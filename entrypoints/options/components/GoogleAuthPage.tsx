import React, { useState, useEffect, useRef } from 'react';
import { browser } from '#imports';

interface UserInfo {
  email: string;
  name: string;
  id?: string;
}

const GoogleAuthPage: React.FC = () => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const periodicCheckerRef = useRef<number | null>(null);

  // 检查用户的登录状态
  useEffect(() => {
    checkAuthStatus();
    
    // 监听认证状态变化
    const authStatusIntervalId = monitorAuthStatus();
    
    // 设置轮询检查登录状态
    startPeriodicAuthCheck();
    
    // 在组件卸载时清除定时器
    return () => {
      stopPeriodicAuthCheck();
      
      // 清除监听认证状态的定时器
      if (authStatusIntervalId) {
        window.clearInterval(authStatusIntervalId);
      }
    };
  }, []);
  
  // 开始定期检查登录状态
  const startPeriodicAuthCheck = () => {
    // 每10秒检查一次登录状态
    periodicCheckerRef.current = window.setInterval(async () => {
      const result = await browser.storage.local.get('google_user_info');
      // 只有状态有变化时才更新
      if ((result.google_user_info && !user) || 
          (!result.google_user_info && user)) {
        console.log('检测到登录状态变化，更新UI');
        if (result.google_user_info) {
          setUser(result.google_user_info);
          setError(null);
        } else {
          setUser(null);
        }
      }
    }, 10000);
  };
  
  // 停止定期检查
  const stopPeriodicAuthCheck = () => {
    if (periodicCheckerRef.current) {
      window.clearInterval(periodicCheckerRef.current);
      periodicCheckerRef.current = null;
    }
  };

  const checkAuthStatus = async () => {
    setIsLoading(true);
    try {
      // 从本地存储获取用户信息
      const result = await browser.storage.local.get('google_user_info');
      if (result.google_user_info) {
        setUser(result.google_user_info);
        setError(null); // 清除任何错误状态
        console.log('找到已登录用户:', result.google_user_info);
        return true;
      }
      return false;
    } catch (error) {
      console.error('检查认证状态时出错:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('尝试进行Google交互式登录');
      
      // 背景脚本将设置 'google_auth_status' 为 'in_progress'.
      // monitorAuthStatus 将会捕捉此状态并显示相应信息.
      await browser.runtime.sendMessage({
        action: 'authenticateWithGoogle',
        interactive: true
      });
      
      // UI更新将由monitorAuthStatus在检测到 'google_auth_status' === 'success' 时触发，
      // 然后调用 checkAuthStatus。
      // 注意：setIsLoading(false) 将由 monitorAuthStatus 或 checkAuthStatus 内部处理。

    } catch (e: any) {
      // 此处主要捕获发送消息本身的错误
      const errorMessage = e?.message || '启动登录过程中发生错误';
      setError(errorMessage);
      console.error('Google登录请求发送错误:', e);
      setIsLoading(false); // 在发送错误时确保停止加载
    }
  };

  const handleLogout = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('正在登出Google账号');
      
      // 发送登出请求
      browser.runtime.sendMessage({ action: 'logoutGoogle' }).catch(e => {
        console.error('发送登出请求出错:', e);
      });
      
      // 创建一个登出状态检查函数，等待用户信息被清除
      const checkUntilLoggedOut = async (maxAttempts = 5) => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          // 等待一小段时间
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // 检查用户是否已经登出
          const result = await browser.storage.local.get('google_user_info');
          if (!result.google_user_info) {
            console.log('确认用户已成功登出');
            setUser(null);
            return true;
          }
          
          console.log(`登出检查尝试 ${attempt + 1}/${maxAttempts}...`);
        }
        
        return false;
      };
      
      // 开始检查登出状态
      const loggedOut = await checkUntilLoggedOut();
      
      if (loggedOut) {
        console.log('Google账号登出成功');
      } else {
        // 即使检查失败，也尝试清除本地状态
        setUser(null);
        setError('登出可能未完全完成，请刷新页面');
        console.warn('登出过程可能未完全完成');
      }
    } catch (e: any) {
      const errorMessage = e?.message || '登出过程中发生错误';
      setError(errorMessage);
      console.error('Google登出请求错误:', e);
    } finally {
      setIsLoading(false);
    }
  };
  
  // 监控认证状态变化
  const monitorAuthStatus = () => {
    // 设置状态变化检测
    const checkInterval = window.setInterval(async () => {
      try {
        const result = await browser.storage.local.get('google_auth_status');
        if (result.google_auth_status) {
          const status = result.google_auth_status.status;
          const timestamp = result.google_auth_status.timestamp;
          
          // 只处理最近5分钟内的状态更新
          const isRecent = (Date.now() - timestamp) < 5 * 60 * 1000;
          
          if (isRecent) {
            switch (status) {
              case 'in_progress':
                // isLoading 应该在 handleLogin 开始时设置，此处可选择性更新error提示
                setError('正在进行登录，请在打开的窗口中完成认证...');
                setIsLoading(true); // 确保在轮询到in_progress时也显示loading
                break;
              case 'checking_session':
                setError('正在检查登录会话...');
                setIsLoading(true);
                break;
              case 'success':
                await checkAuthStatus(); // 这会更新用户状态并可能设置isLoading(false)
                await browser.storage.local.remove('google_auth_status');
                setError(null); // 清除之前的提示信息
                setIsLoading(false); // 明确停止加载
                break;
              case 'failed':
                setError('登录失败，请重新尝试');
                await browser.storage.local.remove('google_auth_status');
                setIsLoading(false);
                break;
              case 'error':
                setError('登录过程中发生错误，请稍后再试');
                await browser.storage.local.remove('google_auth_status');
                setIsLoading(false);
                break;
            }
          }
        }
      } catch (err) {
        console.error('监控认证状态时出错:', err);
        // 发生监控错误时，也应该停止加载，避免UI卡死
        // setIsLoading(false); // 考虑是否添加，可能导致错误状态下loading提前消失
      }
    }, 1000); // 每秒检查一次
    
    // 在useEffect的返回函数中会调用clearInterval
    return checkInterval;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Google 认证</h1>
      
      {/* 认证卡片 */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">账号认证</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          连接您的 Google 账号，以便在使用 Quick Prompt 时获得更多功能，例如云同步、跨设备访问等。
        </p>
        
        <div className="max-w-md mx-auto">
          {isLoading ? (
            <div className="flex justify-center my-6">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : user ? (
            <div className="flex flex-col items-center p-6 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center mb-3">
                <span className="text-blue-600 dark:text-blue-200 text-2xl font-bold">
                  {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="text-center">
                <h3 className="font-medium text-gray-800 dark:text-gray-200">{user.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{user.email}</p>
                <button
                  onClick={handleLogout}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                  </svg>
                  退出 Google 账号
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-700 text-sm font-medium rounded-md shadow-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                <path d="M1 1h22v22H1z" fill="none" />
              </svg>
              使用 Google 账号登录
            </button>
          )}
          
          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm rounded-md">
              <p className="flex items-center">
                <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </p>
            </div>
          )}
        </div>
      </div>
      
      {/* 介绍部分 */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Google 认证说明</h2>
        <div className="space-y-4 text-gray-600 dark:text-gray-400">
          <p>通过 Google 认证，您可以获得以下功能：</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>安全地存储和同步您的提示词到云端</li>
            <li>在不同设备间无缝切换和使用您的提示词库</li>
            <li>使用 Google 服务进行额外的快捷操作</li>
          </ul>
          <p>我们仅会请求必要的权限，并且您的数据安全将受到严格保护。您可以随时取消授权并删除相关数据。</p>
        </div>
      </div>
    </div>
  );
};

export default GoogleAuthPage; 