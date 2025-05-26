import React, { useState, useEffect } from 'react';
import { browser } from '#imports';

interface UserInfo {
  email: string;
  name: string;
  id?: string;
}

interface AuthResponse {
  success?: boolean;
  error?: string;
  data?: {
    token?: string;
    userInfo?: UserInfo;
  };
  userInfo?: UserInfo; // 兼容旧格式
}

interface GoogleAuthButtonProps {
  onAuthSuccess?: (user: { email: string; name: string }) => void;
}

const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({ onAuthSuccess }) => {
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 检查是否已经登录
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    setIsLoading(true); // Set loading true when checking auth status
    try {
      const storedUserResult = await browser.storage.local.get(['googleUser', 'googleAuthToken']);
      if (storedUserResult.googleUser && storedUserResult.googleAuthToken) {
        console.log('[AUTH_BUTTON V2] Found user info and token in local storage', storedUserResult.googleUser);
        setUser(storedUserResult.googleUser as { email: string; name: string });
        if (onAuthSuccess) {
          onAuthSuccess(storedUserResult.googleUser as { email: string; name: string });
        }
      } else {
        console.log('[AUTH_BUTTON V2] No complete user info/token in local storage, attempting silent auth via background.');
        try {
          const response = await browser.runtime.sendMessage({
            action: 'authenticateWithGoogle',
            interactive: false
          });
          
          // 支持新旧两种响应格式
          const userInfo = response?.data?.userInfo || response?.userInfo;
          
          if (response && response.success && userInfo) {
            console.log('[AUTH_BUTTON V2] Silent auth via background successful:', userInfo);
            setUser(userInfo);
            if (onAuthSuccess) {
              onAuthSuccess(userInfo);
            }
            // Background script now handles storage on successful auth
          } else {
            console.warn('[AUTH_BUTTON V2] Silent auth via background failed or returned no user info:', response?.error || 'No specific error from background');
            // Ensure local state is clear if silent auth fails
            setUser(null); 
            // Background script should have cleared storage, but we can be defensive here if needed
            // await browser.storage.local.remove(['googleUser', 'googleAuthToken']);
          }
        } catch (e) {
          console.error('[AUTH_BUTTON V2] Error during sendMessage for silent auth:', e);
          setUser(null);
        }
      }
    } catch (error) {
      console.error('[AUTH_BUTTON V2] Error checking auth status (e.g., storage access issue):', error);
      setUser(null);
    } finally {
      setIsLoading(false); // Set loading false after checking auth status
    }
  };

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('[AUTH_BUTTON V2] Attempting interactive login via background.');
      const response = await browser.runtime.sendMessage({
        action: 'authenticateWithGoogle',
        interactive: true
      });

      // 支持新旧两种响应格式
      const userInfo = response?.data?.userInfo || response?.userInfo;
      
      if (response && response.success && userInfo) {
        console.log('[AUTH_BUTTON V2] Interactive login via background successful:', userInfo);
        setUser(userInfo);
        if (onAuthSuccess) {
          onAuthSuccess(userInfo);
        }
        // Background script now handles storage on successful auth
      } else {
        const errorMessage = (response && response.error) ? String(response.error) : '登录失败，请稍后再试';
        console.warn('[AUTH_BUTTON V2] Interactive login via background failed:', errorMessage);
        setError(errorMessage);
        setUser(null); // Ensure user state is cleared on failure
        // Background script should have cleared storage
      }
    } catch (e) {
      console.error('[AUTH_BUTTON V2] Error during sendMessage for interactive login:', e);
      const errorMessage = (e instanceof Error) ? e.message : String(e);
      setError(`发生错误: ${errorMessage}`);
      setUser(null); // Ensure user state is cleared on error
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoading(true); // Optional: show loading during logout
    setError(null);
    console.log('[AUTH_BUTTON V2] Initiating logout via background.');
    try {
      const response = await browser.runtime.sendMessage({ action: 'logoutGoogle' });
      if (response && response.success) {
        console.log('[AUTH_BUTTON V2] Logout message to background successful.');
      } else {
        console.warn('[AUTH_BUTTON V2] Logout message to background might have failed or returned unexpected response:', response);
      }
    } catch (error) {
      console.error('[AUTH_BUTTON V2] Error sending logout message to background:', error);
    } finally {
      setUser(null); // Always clear user state in UI
      setIsLoading(false);
      // Background script is responsible for clearing storage.
      // Call onAuthSuccess with null or similar if the parent component needs to react to logout.
      if (onAuthSuccess) {
        // @ts-ignore Allow passing null to onAuthSuccess if it's designed to handle it
        onAuthSuccess(null); 
      }
    }
  };

  if (user) {
    return (
      <div className="flex flex-col items-center p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center mb-3">
          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center mr-2">
            <span className="text-blue-600 dark:text-blue-200 text-sm font-bold">{user.name.charAt(0)}</span>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{user.name}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          退出登录
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleLogin}
      disabled={isLoading}
      className="flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 dark:focus:ring-offset-gray-800"
    >
      {isLoading ? (
        <svg className="w-5 h-5 text-white animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : (
        <>
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            <path d="M1 1h22v22H1z" fill="none" />
          </svg>
          使用 Google 登录
        </>
      )}
    </button>
  );
};

export default GoogleAuthButton; 