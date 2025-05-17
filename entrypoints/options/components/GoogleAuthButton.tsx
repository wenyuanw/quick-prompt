import React, { useState, useEffect } from 'react';
import { browser } from '#imports';

interface GoogleAuthButtonProps {
  onAuthSuccess?: (user: { email: string; name: string }) => void;
}

const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({ onAuthSuccess }) => {
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 檢查是否已經登入
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      // 優先從 local storage 讀取用戶信息
      const storedUserResult = await browser.storage.local.get('googleUser');
      if (storedUserResult.googleUser) {
        console.log('GoogleAuthButton: Found user info in local storage', storedUserResult.googleUser);
        setUser(storedUserResult.googleUser as { email: string; name: string });
        if (onAuthSuccess) {
          onAuthSuccess(storedUserResult.googleUser as { email: string; name: string });
        }
        // 即使本地有存儲，仍然可以嘗試在後台靜默獲取新token，但UI上可以先認為已登錄
        // 如果需要，可以在這裡再次調用 authenticateWithGoogle(false) 並更新token，但不是必須立即阻塞UI
      } else {
        console.log('GoogleAuthButton: No user info in local storage, attempting silent auth via background.');
        // 發送消息給背景腳本，檢查是否已登入 (嘗試靜默登錄)
      const response = await browser.runtime.sendMessage({
        action: 'authenticateWithGoogle',
        interactive: false
      });

      if (response.success && response.data.userInfo) {
        setUser(response.data.userInfo);
          // 注意：這裡也應該將獲取到的 userInfo 存儲起來，以防是首次靜默登錄成功
          // 但由於 authenticateWithGoogle 消息處理器已經存儲了，這裡可以不重複存儲
        if (onAuthSuccess) {
          onAuthSuccess(response.data.userInfo);
          }
        } else {
          // 可選：如果靜默登錄失敗，可以清除一下可能存在的舊的 local storage user (儘管上面已經檢查了)
           await browser.storage.local.remove('googleUser');
        }
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  };

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 發送消息給背景腳本，執行 Google 登入
      const response = await browser.runtime.sendMessage({
        action: 'authenticateWithGoogle',
        interactive: true
      });

      if (response.success && response.data.userInfo) {
        setUser(response.data.userInfo);
        if (onAuthSuccess) {
          onAuthSuccess(response.data.userInfo);
        }
      } else {
        setError(response.error || '登入失敗，請稍後再試');
      }
    } catch (error) {
      console.error('Error during login:', error);
      setError('發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      // 清除令牌（通過發送消息給背景腳本）
      await browser.runtime.sendMessage({ action: 'logoutGoogle' });
      setUser(null);
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  if (user) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
          >
            登出
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col mb-6">
      <button
        onClick={handleLogin}
        disabled={isLoading}
        className="flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        {isLoading ? (
          <span className="flex items-center">
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-700 dark:text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            登入中...
          </span>
        ) : (
          <span className="flex items-center">
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path 
                fill="#4285F4" 
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" 
              />
              <path 
                fill="#34A853" 
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" 
              />
              <path 
                fill="#FBBC05" 
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" 
              />
              <path 
                fill="#EA4335" 
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" 
              />
            </svg>
            使用 Google 帳戶登入
          </span>
        )}
      </button>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
};

export default GoogleAuthButton; 