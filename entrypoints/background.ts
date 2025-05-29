import { BROWSER_STORAGE_KEY, DEFAULT_PROMPTS, DEFAULT_CATEGORY_ID } from "@/utils/constants"
import { initializeDefaultCategories, migratePromptsWithCategory } from "@/utils/categoryUtils"
import { generatePromptId } from "@/utils/promptUtils"
import { syncPromptsFromNotion as syncCorePromptsFromNotion, syncPromptsToNotion as syncCorePromptsToNotion } from "@/entrypoints/content/utils/notionSync"
import type { PromptItem } from "@/utils/types"

// User Info Storage Key
const USER_INFO_STORAGE_KEY = 'google_user_info';

// 从环境变量获取客户端ID前缀
const WEB_APP_CLIENT_ID_PREFIX = import.meta.env.WXT_WEB_APP_CLIENT_ID_PREFIX || '';
const CHROME_CLIENT_ID_PREFIX = import.meta.env.WXT_CHROME_APP_CLIENT_ID_PREFIX || '';

console.log('WEB_APP_CLIENT_ID_PREFIX', WEB_APP_CLIENT_ID_PREFIX);
console.log('CHROME_CLIENT_ID_PREFIX', CHROME_CLIENT_ID_PREFIX);

export default defineBackground(() => {
  console.log('Hello background!', { id: browser.runtime.id })

  // +++ Google Auth & Notion Sync Logic (Integrated from notion project) +++

  // Helper to determine if we are in a Chrome-like environment that supports getAuthToken
  const isLikelyChromeDesktop = (): boolean => {
    const ua = navigator.userAgent.toLowerCase()
    return ua.includes('chrome/') && !ua.includes('edg/') && !ua.includes('opr/') && !navigator.userAgentData?.mobile
  }

  const getDesktopTypeForAuth = async (): Promise<string> => {
    if (typeof navigator.userAgentData !== 'undefined' && navigator.userAgentData) {
      try {
        const highEntropyValues = await navigator.userAgentData.getHighEntropyValues(['platformArch', 'bitness', 'model'])
        const platform = (navigator.userAgentData.platform || '').toLowerCase()
        const brands = navigator.userAgentData.brands?.map((b: { brand: string; version: string }) => b.brand.toLowerCase()).join(',')

        console.log('[UAData Check]', {
          platform: platform,
          mobile: navigator.userAgentData.mobile,
          brands: brands,
          highEntropyValues: highEntropyValues
        })

        // Arc Browser on Windows reports as "Windows", "x86", "64" and brands include "Chromium", "Google Chrome"
        // but might not have "Arc" explicitly. It behaves like Chrome for getAuthToken.
        if (platform === 'windows' && brands?.includes('chromium') && brands?.includes('google chrome')) {
          // Further check if it's Arc or similar that might hide its true identity but supports getAuthToken
          if (isLikelyChromeDesktop()) return 'CHROME_DESKTOP_LIKELY' // Treat as Chrome if it walks and talks like Chrome
        }
        // Standard Chrome check
        if (navigator.userAgentData.brands?.some(b => b.brand.toLowerCase() === 'google chrome') && !navigator.userAgentData.mobile) return 'CHROME_DESKTOP_NATIVE'

      } catch (e) {
        console.warn('Error fetching highEntropyValues from UserAgentData:', e)
      }
    }
    // Fallback or non-Chromium
    if (isLikelyChromeDesktop()) return 'CHROME_DESKTOP_UA_FALLBACK'
    return 'OTHER'
  }

  // Core function for Google Authentication via getAuthToken (Chrome specific)
  const getAuthTokenInternal = (interactive: boolean): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!browser.identity || typeof browser.identity.getAuthToken !== 'function') {
        console.warn('browser.identity.getAuthToken is not available.');
        resolve(null);
        return;
      }

      const clientIdPrefix = CHROME_CLIENT_ID_PREFIX;
      if (!clientIdPrefix) {
        console.warn('CHROME_CLIENT_ID_PREFIX is not defined. Proceeding without explicit client_id for getAuthToken. May rely on extension ID whitelisting.');
      }
      console.log(`[getAuthTokenInternal] Calling browser.identity.getAuthToken (interactive: ${interactive}), Client ID prefix configured: ${!!clientIdPrefix}`);

      browser.identity.getAuthToken({ interactive }, (result: any) => {
        console.log(`[getAuthTokenInternal Callback] Received result/error from getAuthToken. Interactive: ${interactive}`);
        try {
          if (browser.runtime.lastError) {
            console.warn(`getAuthToken(interactive: ${interactive}) FAILED:`, browser.runtime.lastError.message);
            resolve(null);
            return;
          }

          let tokenToResolve: string | null = null;

          if (typeof result === 'string' && result) {
            tokenToResolve = result;
          } else if (result && typeof result.token === 'string' && result.token) {
            tokenToResolve = result.token;
          }

          if (tokenToResolve) {
            console.log(`getAuthToken(interactive: ${interactive}) successful with token (first few chars): ${tokenToResolve.substring(0,10)}...`);
            resolve(tokenToResolve);
          } else {
            console.warn(`getAuthToken(interactive: ${interactive}) did not yield a valid token. Result was:`, result);
            resolve(null);
          }
        } catch (e: any) {
          console.error(`[getAuthTokenInternal Callback] Error processing getAuthToken result (interactive: ${interactive}):`, e);
          resolve(null); // Ensure promise resolves even if internal processing fails
        }
      });
    });
  };

  // Core function for Google Authentication via launchWebAuthFlow
  const launchWebAuthFlowInternal = async (interactive: boolean): Promise<string | null> => {
    try {
      const webClientIdPrefix = WEB_APP_CLIENT_ID_PREFIX;
      if (!webClientIdPrefix) {
        console.error('WEB_APP_CLIENT_ID_PREFIX is not defined. Cannot use launchWebAuthFlow.');
        return null;
      }
      const CLIENT_ID = `${webClientIdPrefix}.apps.googleusercontent.com`;
      const REDIRECT_URI = browser.identity.getRedirectURL();
      const SCOPES = ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'];

      let authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.append('client_id', CLIENT_ID);
      authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
      authUrl.searchParams.append('response_type', 'token');
      authUrl.searchParams.append('scope', SCOPES.join(' '));
      if (interactive) {
        authUrl.searchParams.append('prompt', 'select_account');
      }

      console.log(`Attempting launchWebAuthFlow with URL: ${authUrl.toString()} (interactive: ${interactive})`);

      const responseUrl = await browser.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive
      });

      if (!responseUrl) {
        console.warn(`launchWebAuthFlow(interactive: ${interactive}) returned no response URL. LastError:`, browser.runtime.lastError?.message);
        return null;
      }
      console.log(`launchWebAuthFlow(interactive: ${interactive}) successful. Response URL received.`);

      let token = null;
      try {
        const url = new URL(responseUrl);
        if (url.hash && url.hash.includes('access_token=')) {
          const params = new URLSearchParams(url.hash.substring(1));
          token = params.get('access_token');
        } else if (url.searchParams.has('access_token')) {
          token = url.searchParams.get('access_token');
        } else {
          console.warn('No access_token found in responseUrl from launchWebAuthFlow.');
        }
      } catch (urlParseError) {
        console.error('Error parsing response URL:', urlParseError, 'Raw responseUrl:', responseUrl);
      }

      if (!token) {
        console.warn('No access_token found in responseUrl from launchWebAuthFlow.');
        return null;
      }
      console.log('Successfully obtained token via launchWebAuthFlow.');
      return token;
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      console.warn(`launchWebAuthFlow (called with interactive: ${interactive}) failed: ${errorMsg}. LastError: ${browser.runtime.lastError?.message}`);
      return null;
    }
  };

  // Unified Google Authentication function
  const authenticateWithGoogle = async (interactive: boolean): Promise<{token: string; userInfo?: { email: string; name: string, id: string }} | null> => {
    console.log(`[AUTH_START V2] authenticateWithGoogle(interactive: ${interactive})`);
    let token: string | null = null;
    const desktopType = await getDesktopTypeForAuth();
    console.log(`[AUTH_DESKTOP_TYPE V2] Determined desktop type: ${desktopType}`);

    const chromeClientIdPrefixAvailable = CHROME_CLIENT_ID_PREFIX;
    const webClientIdPrefixAvailable = WEB_APP_CLIENT_ID_PREFIX;

    if (!chromeClientIdPrefixAvailable && !webClientIdPrefixAvailable) {
      console.error("[AUTH_ERROR V2] Neither CHROME_CLIENT_ID_PREFIX nor WEB_APP_CLIENT_ID_PREFIX are defined. Authentication is not possible.");
      return null;
    }

    if (chromeClientIdPrefixAvailable && (desktopType.startsWith('CHROME_DESKTOP') || desktopType === 'OTHER_LIKELY_CHROME_GETAUTHTOKEN_CAPABLE')) {
      console.log('[AUTH_ATTEMPT V2] Trying getAuthTokenInternal...');
      token = await getAuthTokenInternal(interactive);
      if (token) {
        console.log('[AUTH_SUCCESS V2] Token obtained via getAuthTokenInternal.');
        // For getAuthToken, we fetch userInfo here to ensure it's fresh.
        const userInfo = await getUserInfo(token);
        if (userInfo) {
          await browser.storage.local.set({ [USER_INFO_STORAGE_KEY]: userInfo }); // Store user info
          return { token, userInfo };
        } else {
          console.warn('[AUTH_WARN V2] getAuthTokenInternal succeeded but getUserInfo failed. Token might be invalid or network issue.');
          // Do not return a token if userInfo cannot be fetched, as it might be stale/problematic.
          // Caller should handle this as a failed auth attempt.
          await browser.storage.local.remove(USER_INFO_STORAGE_KEY); // Ensure inconsistent state is cleared
          return null;
        }
      }
      console.warn('[AUTH_FALLBACK V2] getAuthTokenInternal failed or returned no token.');
      if (!webClientIdPrefixAvailable) {
        console.error("[AUTH_ERROR V2] getAuthToken failed and WEB_APP_CLIENT_ID_PREFIX is not available for fallback. Cannot authenticate.");
        return null;
      }
      console.log('[AUTH_FALLBACK V2] Proceeding to launchWebAuthFlowInternal as fallback.');
    } else if (!webClientIdPrefixAvailable) {
      console.error("[AUTH_ERROR V2] Not a Chrome-like desktop or CHROME_CLIENT_ID_PREFIX not set, and WEB_APP_CLIENT_ID_PREFIX is not available. Cannot authenticate.");
      return null;
    }

    if (webClientIdPrefixAvailable) {
      console.log('[AUTH_ATTEMPT V2] Trying launchWebAuthFlowInternal...');
      token = await launchWebAuthFlowInternal(interactive);
      if (token) {
        console.log('[AUTH_SUCCESS V2] Token obtained via launchWebAuthFlowInternal.');
        // For launchWebAuthFlow, we fetch userInfo here as well.
        const userInfo = await getUserInfo(token);
        if (userInfo) {
          await browser.storage.local.set({ [USER_INFO_STORAGE_KEY]: userInfo }); // Store user info
          return { token, userInfo };
        } else {
          console.warn('[AUTH_WARN V2] launchWebAuthFlowInternal succeeded but getUserInfo failed. Token might be invalid or network issue.');
          // As above, do not return a token if userInfo cannot be fetched.
          await browser.storage.local.remove(USER_INFO_STORAGE_KEY); // Ensure inconsistent state is cleared
          return null;
        }
      }
      console.warn('[AUTH_FAILURE V2] launchWebAuthFlowInternal also failed or returned no token.');
    } else {
      console.log('[AUTH_SKIP V2] launchWebAuthFlowInternal skipped as WEB_APP_CLIENT_ID_PREFIX is not available.');
    }

    console.error('[AUTH_END V2] Authentication failed after all attempts.');
    await browser.storage.local.remove(USER_INFO_STORAGE_KEY); // Ensure storage is cleared on final failure
    return null;
  };

  // Fetch user info from Google
  const getUserInfo = async (token: string): Promise<{ email: string; name: string, id: string } | null> => {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        console.error('Failed to fetch user info:', response.status, await response.text());
        throw new Error('Failed to fetch user info');
      }
      const data = await response.json();
      if (!data.email || !data.name || !data.sub) {
        console.error('User info from Google is missing essential fields (email, name, sub):', data);
        return null;
      }
      return { email: data.email, name: data.name, id: data.sub };
    } catch (error) {
      console.error('Error fetching user info:', error);
      return null;
    }
  };

  // Logout from Google
  const logoutGoogle = async (): Promise<void> => {
    console.log('Attempting to log out from Google...');
    let activeToken: string | null = null;
    try {
      // Attempt to get a non-interactive token to see if we are logged in.
      // This helps in deciding if removeCachedAuthToken needs to be called.
      // We don't strictly need the token value itself, just its presence.
      const authDetails = await browser.storage.local.get(USER_INFO_STORAGE_KEY);
      if (authDetails && authDetails[USER_INFO_STORAGE_KEY]) {
        // If user info exists, we can assume a token was previously obtained.
        // To be absolutely sure for removeCachedAuthToken, we *could* try getAuthToken(false)
        // but it might be overkill if we are clearing user info anyway.
        // For simplicity, we'll rely on stored user info as an indicator of an active session.
        // To be more robust, one might need to fetch the token to pass to removeCachedAuthToken,
        // especially if multiple accounts or token types were possible.

        // Try to get current token to remove it explicitly. This is a best effort.
        // Note: getAuthToken(false) might fail if token is expired, but removeCachedAuthToken
        // might still work based on browser's internal session state.
        if (browser.identity && typeof browser.identity.getAuthToken === 'function') {
          try {
            const tokenResponse = await getAuthTokenInternal(false); // Try to get current token without UI
            if (tokenResponse) { // tokenResponse is string | null
              activeToken = tokenResponse;
            }
          } catch (e) {
            console.warn("Error trying to fetch token non-interactively before logout:", e);
          }
        }
      }

      if (activeToken && browser.identity && typeof browser.identity.removeCachedAuthToken === 'function') {
        console.log('Removing cached auth token for token:', activeToken.substring(0, 20) + "...");
        await browser.identity.removeCachedAuthToken({ token: activeToken });
      } else if (browser.identity && typeof browser.identity.clearAllCachedAuthTokens === 'function') {
        // Fallback if a specific token couldn't be fetched or removeCachedAuthToken is unavailable
        // clearAllCachedAuthTokens is a more aggressive approach. Use with caution.
        // console.log('No specific token to remove or removeCachedAuthToken not available. Attempting to clear all cached auth tokens.');
        // await browser.identity.clearAllCachedAuthTokens(); // This is often too broad. Let's avoid unless necessary.
        // For most cases, just clearing our stored user info is sufficient if token removal is problematic.
      }

      // Always remove user info from our storage
      await browser.storage.local.remove(USER_INFO_STORAGE_KEY);
      console.log('User info removed from local storage. Logout process complete.');

    } catch (error) {
      console.error('Error during Google logout:', error);
      // Still attempt to clear local storage as a fallback
      await browser.storage.local.remove(USER_INFO_STORAGE_KEY);
      console.warn('Ensured user info is removed from local storage despite logout error.');
    }
  };

  // Wrapper for Notion Sync: Notion -> Local
  const syncFromNotionToLocal = async (forceSync: boolean = false, mode: 'replace' | 'append' = 'replace'): Promise<boolean> => {
    console.log(`Background: Triggering syncFromNotionToLocal (force: ${forceSync}, mode: ${mode})`);
    return await syncCorePromptsFromNotion(mode);
  };

  // Wrapper for Notion Sync: Local -> Notion
  const syncLocalDataToNotion = async (forceSync: boolean = false): Promise<{success: boolean; errors?: string[]}> => {
    console.log(`Background: Triggering syncLocalDataToNotion (force: ${forceSync})`);
    const syncSettingsResult = await browser.storage.sync.get(['notionSyncToNotionEnabled']);
    const notionSyncToNotionEnabled = syncSettingsResult.notionSyncToNotionEnabled ?? false;

    if (!forceSync && !notionSyncToNotionEnabled) {
      console.log('Local -> Notion sync is disabled and not forced, skipping.');
      return {success: false, errors: ['本地到Notion的同步已禁用。']};
    }

    const localPromptsResult = await browser.storage.local.get(BROWSER_STORAGE_KEY);
    const localPrompts: PromptItem[] = (localPromptsResult[BROWSER_STORAGE_KEY as keyof typeof localPromptsResult] as PromptItem[]) || [];

    if (!localPrompts || localPrompts.length === 0) {
      console.log('No local prompts to sync to Notion.');
      return {success: true};
    }
    return await syncCorePromptsToNotion(localPrompts);
  };

  // --- End of Integrated Auth & Sync Logic ---

  // Initialization logic (Modified to include Notion sync setting)
  const initializeDefaultData = async () => {
    try {
      await initializeDefaultCategories();
      await migratePromptsWithCategory();

      const promptsResult = await browser.storage.local.get(BROWSER_STORAGE_KEY);
      const prompts = promptsResult[BROWSER_STORAGE_KEY as keyof typeof promptsResult];

      if (prompts && Array.isArray(prompts) && prompts.length > 0) {
        console.log('背景脚本: 已存在Prompts数据，无需初始化默认提示词');
      } else {
        const dataToStore: Record<string, any> = {};
        dataToStore[BROWSER_STORAGE_KEY] = DEFAULT_PROMPTS;
        await browser.storage.local.set(dataToStore);
        console.log('背景脚本: 成功初始化默认Prompts');
      }
    } catch (error) {
      console.error('背景脚本: 初始化默认数据失败:', error);
    }
  };

  // 检测快捷键配置状态
  const checkShortcutConfiguration = async (): Promise<void> => {
    try {
      console.log('背景脚本: 开始检测快捷键配置状态');

      // 获取所有已配置的命令
      const commands = await browser.commands.getAll();
      const promptCommand = commands.find(cmd => cmd.name === 'open-prompt-selector');
      const saveCommand = commands.find(cmd => cmd.name === 'save-selected-prompt');

      // 检查主要的提示词选择器快捷键
      let shortcutIssues: string[] = [];

      if (!promptCommand || !promptCommand.shortcut) {
        shortcutIssues.push('提示词选择器快捷键未配置成功（可能存在冲突）');
        console.log('背景脚本: 提示词选择器快捷键配置失败');
      } else {
        console.log('背景脚本: 提示词选择器快捷键配置成功:', promptCommand.shortcut);
      }

      if (!saveCommand || !saveCommand.shortcut) {
        shortcutIssues.push('保存提示词快捷键未配置成功（可能存在冲突）');
        console.log('背景脚本: 保存提示词快捷键配置失败');
      } else {
        console.log('背景脚本: 保存提示词快捷键配置成功:', saveCommand.shortcut);
      }

      // 存储快捷键配置状态，供弹出窗口和选项页面使用
      await browser.storage.local.set({
        'shortcut_check_result': {
          hasIssues: shortcutIssues.length > 0,
          issues: shortcutIssues,
          promptShortcut: promptCommand?.shortcut || null,
          saveShortcut: saveCommand?.shortcut || null,
          checkedAt: Date.now()
        }
      });

      // 如果存在快捷键问题，发送通知
      if (shortcutIssues.length > 0) {
        console.log('背景脚本: 检测到快捷键配置问题，将显示通知');

        // 创建通知显示快捷键配置问题
        if (browser.notifications) {
          await browser.notifications.create('shortcut-config-issue', {
            type: 'basic',
            iconUrl: '/icon/32.png',
            title: 'Quick Prompt - 快捷键配置提醒',
            message: '部分快捷键可能因冲突未能配置成功，建议手动设置。点击查看详情。'
          });
        }

        // 设置标记，让用户下次打开弹出窗口时能看到详细提示
        await browser.storage.local.set({
          'show_shortcut_setup_reminder': true
        });
      }

    } catch (error) {
      console.error('背景脚本: 检测快捷键配置时出错:', error);
    }
  };

  initializeDefaultData();

  // 创建插件图标右键菜单项
  browser.contextMenus.create({
    id: 'open-options',
    title: '提示词管理',
    contexts: ['action'], // 插件图标右键菜单
  })

  browser.contextMenus.create({
    id: 'category-management',
    title: '分类管理',
    contexts: ['action'],
  })

  // 创建页面内容右键菜单项
  browser.contextMenus.create({
    id: 'save-prompt',
    title: '保存该提示词',
    contexts: ['selection'],
  });


  // 处理右键菜单点击事件
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'save-prompt' && info.selectionText) {
      console.log('背景脚本: 右键菜单被点击，选中文本:', info.selectionText)

      // 获取选项页URL
      const optionsUrl = browser.runtime.getURL('/options.html')

      // 添加查询参数，传递选中的文本
      const urlWithParams = `${optionsUrl}?action=new&content=${encodeURIComponent(
        info.selectionText
      )}`

      // 在新标签页打开选项页
      await browser.tabs.create({ url: urlWithParams })
    } else if (info.menuItemId === 'open-options') {
      // 打开选项页
      const optionsUrl = browser.runtime.getURL('/options.html')
      await browser.tabs.create({ url: optionsUrl })
    } else if (info.menuItemId === 'category-management') {
      // 打开分类管理页
      const optionsUrl = browser.runtime.getURL('/options.html#/categories')
      await browser.tabs.create({ url: optionsUrl })
    }
  })

  // 处理通知点击事件
  if (browser.notifications && browser.notifications.onClicked) {
    browser.notifications.onClicked.addListener(async (notificationId) => {
      if (notificationId === 'shortcut-config-issue') {
        console.log('背景脚本: 用户点击了快捷键配置通知');

        try {
          // 检测浏览器类型并打开对应的快捷键设置页面
          const isFirefox = navigator.userAgent.includes('Firefox');
          const shortcutSettingsUrl = isFirefox ? 'about:addons' : 'chrome://extensions/shortcuts';

          await browser.tabs.create({ url: shortcutSettingsUrl });

          // 清除通知
          await browser.notifications.clear(notificationId);

          // 如果是Firefox，显示额外提示
          if (isFirefox) {
            setTimeout(async () => {
              await browser.notifications.create('firefox-shortcut-tip', {
                type: 'basic',
                iconUrl: '/icon/32.png',
                title: 'Quick Prompt - 设置提示',
                message: '在扩展页面点击右上角齿轮图标，选择"管理扩展快捷键"'
              });
            }, 1000);
          }
        } catch (error) {
          console.error('背景脚本: 打开快捷键设置页面失败:', error);
        }
      }

      // 清除Firefox的提示通知
      if (notificationId === 'firefox-shortcut-tip') {
        setTimeout(async () => {
          await browser.notifications.clear(notificationId);
        }, 5000);
      }
    });
  }

  // 也监听扩展安装/更新事件
  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      console.log('背景脚本: 扩展首次安装');
      await initializeDefaultData();
      await browser.storage.sync.set({ notionSyncToNotionEnabled: false });
      console.log('背景脚本: 已初始化 Notion 同步设置 (本地->Notion 为关闭状态)');

      // 安装后延迟一下再检测快捷键，确保扩展完全加载
      setTimeout(async () => {
        await checkShortcutConfiguration();
      }, 2000);
    }
  });

  // Added: storage.onChanged listener for auto-sync Local -> Notion
  browser.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'local' && changes[BROWSER_STORAGE_KEY]) {
      console.log('Local prompts data changed, checking if Notion sync (Local -> Notion) is needed...');
      const syncSettings = await browser.storage.sync.get('notionSyncToNotionEnabled');
      if (syncSettings.notionSyncToNotionEnabled) {
        console.log('Local data changed, Notion sync (Local -> Notion) is enabled. Triggering sync...');

        // 创建唯一的同步ID用于自动同步
        const syncId = `auto_${Date.now()}`;

        // 存储同步状态为进行中
        await browser.storage.local.set({
          'notion_sync_status': {
            id: syncId,
            status: 'in_progress',
            message: '正在自动同步到Notion，请稍候...',
            startTime: Date.now()
          }
        });

        try {
          // 执行同步并获取结果
          const result = await syncLocalDataToNotion(true);
          console.log(`[AUTO_SYNC_COMPLETE] Auto sync to Notion ${result.success ? 'successful' : 'failed'}`, result.errors || '');

          // 保存同步结果
          if (result.success && !result.errors?.length) {
            // 完全成功
            await browser.storage.local.set({
              'notion_sync_status': {
                id: syncId,
                status: 'success',
                success: true,
                message: '自动同步成功!',
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
                message: '部分自动同步成功，但有错误发生',
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
                message: '自动同步失败',
                error: result.errors ? result.errors.join('\n') : '未知错误',
                completedTime: Date.now()
              }
            });
          }
        } catch (error: any) {
          console.error('[AUTO_SYNC_ERROR] Error during automatic sync to Notion:', error);

          // 存储错误信息
          await browser.storage.local.set({
            'notion_sync_status': {
              id: syncId,
              status: 'error',
              success: false,
              message: '自动同步失败',
              error: error?.message || '自动同步过程中发生未知错误',
              completedTime: Date.now()
            }
          });
        }
      } else {
        console.log('Local data changed, but Notion sync (Local -> Notion) is disabled.');
      }
    }
  });

  browser.commands.onCommand.addListener(async (command) => {
    if (command === 'open-prompt-selector') {
      console.log('背景脚本: 接收到打开提示词选择器的快捷键命令');
      try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0 && tabs[0].id) {
          await browser.tabs.sendMessage(tabs[0].id, { action: 'openPromptSelector' });
          console.log('背景脚本: 已发送打开提示词选择器的消息到活动标签页');
        } else {
          console.error('背景脚本: 未找到活动的标签页');
        }
      } catch (error) {
        console.error('背景脚本: 发送消息到标签页失败:', error);
      }
    } else if (command === 'save-selected-prompt') {
      console.log('背景脚本: 接收到保存选中文本的快捷键命令');
      try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0 && tabs[0].id) {
          const response = await browser.tabs.sendMessage(tabs[0].id, { action: 'getSelectedText' });
          if (response && response.text) {
            const optionsUrl = browser.runtime.getURL('/options.html');
            const urlWithParams = `${optionsUrl}?action=new&content=${encodeURIComponent(response.text)}`;
            await browser.tabs.create({ url: urlWithParams });
          } else {
            console.log("快捷键保存：未从内容脚本获取到文本，或内容脚本未响应。")
          }
        } else {
          console.error('背景脚本: 未找到活动的标签页');
        }
      } catch (error) {
        console.error('背景脚本: 获取选中文本或打开选项页失败:', error);
      }
    }
  });

  // Merged message listener
  browser.runtime.onMessage.addListener(async (message: any, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    console.log('[MSG_RECEIVED V3] Background received message:', message, 'from sender:', sender);

    // Existing message handlers
    if (message.action === 'getPrompts') {
      try {
        const result = await browser.storage.local.get(BROWSER_STORAGE_KEY);
        const allPrompts = (result[BROWSER_STORAGE_KEY as keyof typeof result] as PromptItem[]) || [];
        const enabledPrompts = allPrompts.filter((prompt: PromptItem) => prompt.enabled !== false);
        console.log('背景脚本: 获取到', allPrompts.length, '个Prompts，其中', enabledPrompts.length, '个已启用');
        return { success: true, data: enabledPrompts };
      } catch (error) {
        console.error('背景脚本: 获取Prompts时出错:', error);
        return { success: false, error: '无法获取Prompts数据' };
      }
    }

    if (message.action === 'openOptionsPage') {
      try {
        const optionsUrl = browser.runtime.getURL('/options.html');
        await browser.tabs.create({ url: optionsUrl });
        return { success: true };
      } catch (error) {
        console.error('打开选项页失败:', error);
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
        console.error('背景脚本: 打开选项页(带文本)失败:', error);
        return { success: false, error: error.message };
      }
    }

    // +++ Consolidated Google Auth Message Handlers +++
    if (message.action === 'authenticateWithGoogle' || message.action === 'googleLogin') { // Handles both old and new action name for login
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

      // 为了解决异步操作和UI更新之间的时序问题
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
            // Core authenticateWithGoogle now handles storing to USER_INFO_STORAGE_KEY
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
            resolve({ success: false, error: '登录失败，请稍后再试' });
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

    if (message.action === 'logoutGoogle' || message.action === 'googleLogout') { // Handles both old and new action name for logout
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
          await logoutGoogle(); // Core logoutGoogle handles token removal and USER_INFO_STORAGE_KEY
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

    // Handle Notion sync messages if they are still relevant and managed here
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
  });

  // Initialize default prompts if not already present
  initializeDefaultData();

  console.log('Background script fully initialized with auth and message listeners.');
})
