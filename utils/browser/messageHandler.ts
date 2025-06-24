import { BROWSER_STORAGE_KEY } from "@/utils/constants"
import { authenticateWithGoogle, logoutGoogle, USER_INFO_STORAGE_KEY } from "@/utils/auth/googleAuth"
import { syncFromNotionToLocal, syncLocalDataToNotion } from "@/utils/sync/notionSync"
import type { PromptItem } from "@/utils/types"
import { t } from "@/utils/i18n"

// Handle basic prompt and options messages
const handleBasicMessages = async (message: any): Promise<any> => {
  if (message.action === 'getPrompts') {
    try {
      const result = await browser.storage.local.get(BROWSER_STORAGE_KEY);
      const allPrompts = (result[BROWSER_STORAGE_KEY as keyof typeof result] as PromptItem[]) || [];
      const enabledPrompts = allPrompts.filter((prompt: PromptItem) => prompt.enabled !== false);
      console.log(t('backgroundPromptsLoaded'), allPrompts.length, t('backgroundPromptsEnabled'), enabledPrompts.length, t('backgroundPromptsEnabledSuffix'));
      return { success: true, data: enabledPrompts };
    } catch (error) {
      console.error(t('backgroundGetPromptsError'), error);
      return { success: false, error: t('backgroundGetPromptsDataError') };
    }
  }

  if (message.action === 'openOptionsPage') {
    try {
      const optionsUrl = browser.runtime.getURL('/options.html');
      await browser.tabs.create({ url: optionsUrl });
      return { success: true };
    } catch (error) {
      console.error(t('backgroundOpenOptionsError'), error);
      browser.runtime.openOptionsPage();
      return { success: true, fallback: true };
    }
  }

  if (message.action === 'openOptionsPageWithText') {
    try {
      const optionsUrl = browser.runtime.getURL('/options.html');
      const urlWithParams = `${optionsUrl}?action=new&content=${encodeURIComponent(message.text)}`;
      await browser.tabs.create({ url: urlWithParams });
      return { success: true };
    } catch (error: any) {
      console.error(t('backgroundOpenOptionsWithTextError'), error);
      return { success: false, error: error.message };
    }
  }

  return null;
};

// Handle Google authentication messages
const handleAuthMessages = async (message: any, sendResponse: (response?: any) => void): Promise<boolean> => {
  if (message.action === 'authenticateWithGoogle' || message.action === 'googleLogin') {
    console.log(`[MSG_AUTH V3] Processing '${message.action}' for interactive: ${message.interactive}`);

    // 定义认证状态键，用于存储认证进度
    const AUTH_STATUS_KEY = 'google_auth_status';

    // 更新认证状态
    const updateAuthStatus = async (status: string) => {
      await browser.storage.local.set({
        [AUTH_STATUS_KEY]: {
          status: status,
          timestamp: Date.now()
        }
      });
    };

    // 标记认证开始
    await updateAuthStatus('in_progress');

    // 定义响应类型
    interface AuthResponse {
      success: boolean;
      data?: {
        token: string;
        userInfo: { email: string; name: string, id: string };
      };
      error?: string;
    }

    let authPromise = new Promise<AuthResponse>(async (resolve) => {
      try {
        // 改进认证逻辑，先尝试使用交互式登录，如果失败则检查已存在的会话
        let authResult = null;
        const isInteractive = message.interactive === true;

        console.log('[MSG_AUTH V3] Starting authentication process...');

        // 首先尝试进行认证
        authResult = await authenticateWithGoogle(isInteractive);

        // 确保我们有足够的时间等待认证完成
        console.log('[MSG_AUTH V3] Initial auth attempt completed, checking result...');

        // 如果交互式登录失败但Chrome中已登录账号，尝试获取已有会话信息
        if (!authResult && isInteractive) {
          console.log('[MSG_AUTH V3] Interactive auth failed, checking for existing session...');
          await updateAuthStatus('checking_session');
          // 检查本地存储中是否已有用户信息
          const storedInfo = await browser.storage.local.get(USER_INFO_STORAGE_KEY);
          if (storedInfo && storedInfo[USER_INFO_STORAGE_KEY]) {
            console.log('[MSG_AUTH V3] Found existing user info in storage');
            authResult = {
              token: 'session-token', // 使用占位符token
              userInfo: storedInfo[USER_INFO_STORAGE_KEY]
            };
          }
        }

        if (authResult && authResult.userInfo) {
          console.log('[MSG_AUTH V3] Authentication successful. User:', authResult.userInfo.email);
          await updateAuthStatus('success');
          resolve({
            success: true,
            data: {
              token: authResult.token,
              userInfo: authResult.userInfo
            }
          });
        } else {
          console.warn('[MSG_AUTH V3] Authentication failed or no user info.');
          await updateAuthStatus('failed');
          resolve({ success: false, error: t('backgroundLoginFailed') });
        }
      } catch (error: any) {
        console.error('[MSG_AUTH V3] Error during authenticateWithGoogle message processing:', error);
        await updateAuthStatus('error');
        resolve({ success: false, error: error.message || 'An unknown error occurred during authentication.' });
      }
    });

    // 使用更可靠的异步响应模式
    authPromise.then(response => {
      console.log('[MSG_AUTH V3] Sending final auth response:', response.success);
      sendResponse(response);
    });

    return true; // Indicate asynchronous response
  }

  if (message.action === 'logoutGoogle' || message.action === 'googleLogout') {
    console.log(`[MSG_LOGOUT V3] Processing '${message.action}'`);

    // 定义响应类型
    interface LogoutResponse {
      success: boolean;
      message?: string;
      error?: string;
    }

    // 使用Promise确保异步处理完成后再响应
    const logoutPromise = new Promise<LogoutResponse>(async (resolve) => {
      try {
        await logoutGoogle();
        console.log('[MSG_LOGOUT V3] Logout process completed by core function.');
        resolve({ success: true, message: 'Logout successful.' });
      } catch (e: any) {
        console.error('[MSG_LOGOUT V3] Error during logoutGoogle message processing:', e);
        resolve({ success: false, error: e.message || 'An unknown error occurred during logout.' });
      }
    });

    // 使用更可靠的异步响应模式
    logoutPromise.then(response => {
      console.log('[MSG_LOGOUT V3] Sending final logout response:', response.success);
      sendResponse(response);
    });

    return true; // Indicate asynchronous response
  }

  if (message.action === 'getUserStatus') {
    console.log('[MSG_GET_STATUS V3] Processing getUserStatus');
    try {
      const result = await browser.storage.local.get(USER_INFO_STORAGE_KEY);
      const userInfo = result[USER_INFO_STORAGE_KEY];
      if (userInfo) {
        sendResponse({ isLoggedIn: true, userInfo });
      } else {
        sendResponse({ isLoggedIn: false });
      }
    } catch (error: any) {
      console.error('[MSG_GET_STATUS V3] Error getting user status:', error);
      sendResponse({ isLoggedIn: false, error: error.message || 'Unknown error fetching status' });
    }
    return true; // Indicate asynchronous response
  }

  return false;
};

// Handle Notion sync messages
const handleNotionSyncMessages = async (message: any, sendResponse: (response?: any) => void): Promise<boolean> => {
  if (message.action === 'syncFromNotion' || message.action === 'syncFromNotionToLocal') {
    console.log(`Received ${message.action} message in background`);

    const syncId = Date.now().toString();

    // 告知前端同步已开始 - 移动到 await 之前
    sendResponse({
      success: true,
      syncInProgress: true,
      syncId: syncId,
      message: '从Notion同步已开始，正在处理...'
    });

    // 异步处理同步操作 和 存储初始状态
    (async function() {
      try {
        // 存储同步状态，标记为进行中 - 现在在异步块内
        await browser.storage.local.set({
          'notion_from_sync_status': {
            id: syncId,
            status: 'in_progress',
            startTime: Date.now()
          }
        });

        console.log('[SYNC_FROM_NOTION_START] Beginning sync from Notion process');
        const success = await syncFromNotionToLocal(message.forceSync || false, message.mode || 'replace');
        console.log(`[SYNC_FROM_NOTION_COMPLETE] Sync from Notion ${success ? 'successful' : 'failed'}`);

        // 存储同步结果
        await browser.storage.local.set({
          'notion_from_sync_status': {
            id: syncId,
            status: success ? 'success' : 'error',
            success: success,
            message: success ? '从Notion同步成功!' : '同步失败，请查看控制台日志',
            completedTime: Date.now()
          }
        });
      } catch (error: any) {
        console.error('[SYNC_FROM_NOTION_ERROR] Error syncing from Notion:', error);

        // 存储错误信息
        await browser.storage.local.set({
          'notion_from_sync_status': {
            id: syncId,
            status: 'error',
            success: false,
            error: error?.message || '从Notion同步过程中发生未知错误',
            completedTime: Date.now()
          }
        });
      }
    })();

    return true;
  }

  if (message.action === 'syncToNotion' || message.action === 'syncLocalToNotion') {
    console.log(`Received ${message.action} message in background`);

    const syncId = Date.now().toString();

    // 告知前端同步已开始 - 移动到 await 之前
    sendResponse({
      success: true,
      syncInProgress: true,
      syncId: syncId,
      message: '同步已开始，正在处理...'
    });

    // 异步处理同步操作 和 存储初始状态
    (async function() {
      try {
        // 存储同步状态，标记为进行中 - 现在在异步块内
        await browser.storage.local.set({
          'notion_sync_status': {
            id: syncId,
            status: 'in_progress',
            startTime: Date.now()
          }
        });
        console.log('[SYNC_START] Beginning sync to Notion process');
        const result = await syncLocalDataToNotion(message.forceSync || false);
        console.log(`[SYNC_COMPLETE] Sync to Notion ${result.success ? 'successful' : 'failed'}`, result.errors || '');

        // 存储同步结果
        if (result.success && !result.errors?.length) {
          // 完全成功
          await browser.storage.local.set({
            'notion_sync_status': {
              id: syncId,
              status: 'success',
              success: true,
              message: '同步成功!',
              completedTime: Date.now()
            }
          });
        } else if (result.success && result.errors?.length) {
          // 部分成功，有一些错误
          await browser.storage.local.set({
            'notion_sync_status': {
              id: syncId,
              status: 'error',
              success: true, // 仍然标记为有一定程度的成功
              message: '部分同步成功，但有错误发生',
              error: result.errors.join('\n'),
              completedTime: Date.now()
            }
          });
        } else {
          // 完全失败
          await browser.storage.local.set({
            'notion_sync_status': {
              id: syncId,
              status: 'error',
              success: false,
              message: '同步失败',
              error: result.errors ? result.errors.join('\n') : '未知错误',
              completedTime: Date.now()
            }
          });
        }
      } catch (error: any) {
        console.error('[SYNC_ERROR] Error syncing to Notion:', error);

        // 存储错误信息
        await browser.storage.local.set({
          'notion_sync_status': {
            id: syncId,
            status: 'error',
            success: false,
            message: '同步失败',
            error: error?.message || '同步过程中发生未知错误',
            completedTime: Date.now()
          }
        });
      }
    })();

    return true;
  }

  return false;
};

// Main message handler
export const handleRuntimeMessage = async (message: any, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void): Promise<boolean> => {
  console.log('[MSG_RECEIVED V3] Background received message:', message, 'from sender:', sender);

  // Handle basic messages first
  const basicResult = await handleBasicMessages(message);
  if (basicResult !== null) {
    sendResponse(basicResult);
    return false; // Synchronous response
  }

  // Handle authentication messages
  const authHandled = await handleAuthMessages(message, sendResponse);
  if (authHandled) {
    return true; // Asynchronous response
  }

  // Handle Notion sync messages
  const syncHandled = await handleNotionSyncMessages(message, sendResponse);
  if (syncHandled) {
    return true; // Asynchronous response
  }

  // If no handler matched, return false
  return false;
};
