import { defineBackground, browser } from '#imports';

// 全局類型聲明
interface NavigatorUADataBrandVersion {
  readonly brand: string;
  readonly version: string;
}

interface NavigatorUAData {
  readonly brands: ReadonlyArray<NavigatorUADataBrandVersion>;
  readonly mobile: boolean;
  readonly platform: string;
  getHighEntropyValues(hints: string[]): Promise<Record<string, any>>;
  toJSON(): Record<string, any>;
}


// 擴展 Navigator 接口
declare global {
  interface Navigator {
    readonly userAgentData?: NavigatorUAData;
  }
}

export default defineBackground(() => {
  console.log('Hello background!', { id: browser.runtime.id })
  
  // 檢查是否有 WEB_APP_CLIENT_ID_PREFIX 可用
  try {
    // @ts-ignore
    console.log('檢查 __WEB_APP_CLIENT_ID_PREFIX__ 變量:', typeof __WEB_APP_CLIENT_ID_PREFIX__ !== 'undefined' ? '已定義' : '未定義');
    // @ts-ignore
    if (typeof __WEB_APP_CLIENT_ID_PREFIX__ !== 'undefined') {
      // @ts-ignore
      console.log('__WEB_APP_CLIENT_ID_PREFIX__ 值:', __WEB_APP_CLIENT_ID_PREFIX__);
    }
    console.log('Manifest 信息:', browser.runtime.getManifest());
  } catch (err) {
    console.error('檢查配置變量時出錯:', err);
  }

  // 導入哈希工具函數（直接在這裡定義一份，以避免跨模塊依賴問題）
  function hashString(str: string): number {
    let hash = 0;
    if (str.length === 0) return hash;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 轉為32位整數
    }
    
    return Math.abs(hash); // 確保是正數
  }
  
  function generatePromptId(title: string, content: string, tags?: string[]): string {
    // 基本唯一識別內容：標題和內容
    let uniqueString = `${title.trim()}::${content.trim()}`;
    
    // 如果有標籤，也納入哈希計算
    if (tags && tags.length > 0) {
      const sortedTags = [...tags].sort();
      uniqueString += `::${sortedTags.join(',')}`;
    }
    
    // 生成哈希並轉換為36進制字符串（更短）
    const hash = hashString(uniqueString);
    const hashStr = hash.toString(36);
    
    // 添加前綴
    return `p${hashStr}`;
  }

  // 为背景脚本定义一个简化的 PromptItem 接口，仅包含必要的字段
  interface PromptItem {
    id: string;
    title: string;
    content: string;
    tags: string[];
    enabled: boolean;
    notionPageId?: string;
  }

  // 默认的prompt样例
  const DEFAULT_PROMPTS: PromptItem[] = [
    {
      id: generatePromptId('吉卜力风格', '将图片转换为吉卜力风格', ['画图', '吉卜力']),
      title: '吉卜力风格',
      content: '将图片转换为吉卜力风格',
      tags: ['画图', '吉卜力'],
      enabled: true,
    },
    {
      id: generatePromptId('代码解释', '请解释以下代码的功能和工作原理：\n\n', ['编程']),
      title: '代码解释',
      content: '请解释以下代码的功能和工作原理：\n\n',
      tags: ['编程'],
      enabled: true,
    },
    {
      id: generatePromptId('开发角色', '你现在是一个{{角色}}，有着{{年限}}年的开发经验，擅长{{技能}}。', ['编程', '变量']),
      title: '开发角色',
      content: '你现在是一个{{角色}}，有着{{年限}}年的开发经验，擅长{{技能}}。',
      tags: ['编程', '变量'],
      enabled: true,
    },
  ]

  // 获取storage接口的key名，和options页面保持一致
  const BROWSER_STORAGE_KEY = 'userPrompts'

  // Google 帳戶登入功能：通過 Chrome Identity API 獲取 OAuth 令牌
  const authenticateWithGoogle = async (interactive: boolean): Promise<string | null> => {
    console.log(`authenticateWithGoogle called with interactive: ${interactive}`);

    const ua = navigator.userAgent;
    console.log(`DEBUG: Full User-Agent: ${ua}`);

    let forceLaunchWebAuthFlow = false;
    let RELDATA_MESSAGE = '';

    // 明確檢測 Firefox
    const isFirefox = /firefox/i.test(ua);
    if (isFirefox) {
      console.log('[BROWSER_DETECT] Firefox detected, forcing launchWebAuthFlow path.');
      forceLaunchWebAuthFlow = true;
      RELDATA_MESSAGE = '[BROWSER_DECISION] Forcing launchWebAuthFlow for Firefox browser.';
    } else if (typeof navigator.userAgentData !== 'undefined') {
      console.log('[UAData] navigator.userAgentData is available.');
      // 使用類型斷言
      const uaData = navigator.userAgentData as NavigatorUAData;
      const brands = uaData.brands;
      // 記錄完整的 brands 信息以供調試
      console.log('[UAData] Brands:', JSON.stringify(brands)); 

      // 為回調參數提供明確類型
      const hasGoogleChromeBrand = brands.some((b: {brand: string; version: string}) => b.brand === "Google Chrome");
      const hasChromiumBrand = brands.some((b: {brand: string; version: string}) => b.brand === "Chromium");
      const isLikelyChromeUAString = /chrome/i.test(ua) && !/edg/i.test(ua) && !/firefox/i.test(ua);

      if (isLikelyChromeUAString && !hasGoogleChromeBrand && hasChromiumBrand) {
        // User Agent 字符串像 Chrome，但 UserAgentData 中沒有 "Google Chrome" 品牌，卻有 "Chromium" 品牌
        // 這很可能是 Arc (Windows) 或類似的 Chromium 衍生瀏覽器
        forceLaunchWebAuthFlow = true;
        RELDATA_MESSAGE = '[UAData Decision] Forcing launchWebAuthFlow: UA string like Chrome, but no "Google Chrome" brand, only "Chromium". Likely Arc (Windows) or similar.';
      }
    } else {
      console.log('[UAData] navigator.userAgentData is NOT available.');
    }

    const isArcBrowserByUARegex = /Arc\//i.test(ua); // 舊的UA正則檢測，以防 Arc (macOS) 的 UAData 不同
    // isLikelyChrome 的主要判斷，如果 userAgentData 已經決定強制，則此判斷不生效使其走 getAuthToken
    const isStandardChrome = !forceLaunchWebAuthFlow && /chrome/i.test(ua) && !/edg/i.test(ua) && !/firefox/i.test(ua) && !isArcBrowserByUARegex;
    
    if (RELDATA_MESSAGE) {
      console.log(RELDATA_MESSAGE);
    }
    console.log(`[AUTH_DETECT] isStandardChrome (prefers getAuthToken): ${isStandardChrome}, forceLaunchWebAuthFlow: ${forceLaunchWebAuthFlow}`);

    if (forceLaunchWebAuthFlow) {
      console.log('[AUTH_PATH] Using launchWebAuthFlow directly (Forced by userAgentData heuristics).');
      return launchWebAuthFlowInternal(interactive);
    }
    
    // isStandardChrome && typeof browser.identity.getAuthToken === 'function'
    if (isStandardChrome && typeof browser.identity.getAuthToken === 'function') { 
      console.log('[AUTH_PATH] Using browser.identity.getAuthToken (Considered Standard Chrome).');
      // ... (此處是之前包含 try-catch 和異步回調內回退到 launchWebAuthFlowInternal 的 getAuthToken 邏輯) ...
      // (保持之前最健壯的 getAuthToken + fallback 實現)
      return new Promise<string | null>(async (resolve) => {
        try {
          browser.identity.getAuthToken({ interactive }, async (tokenResult) => {
            if (browser.runtime.lastError || !tokenResult) {
              console.warn(`getAuthToken(interactive: ${interactive}) failed: ${browser.runtime.lastError?.message || 'No token returned'}`);
              if (interactive) {
                console.log('[AUTH_FALLBACK] getAuthToken async callback failed in interactive mode, attempting launchWebAuthFlow...');
                try {
                  const tokenFromWebAuth = await launchWebAuthFlowInternal(interactive);
                  resolve(tokenFromWebAuth);
                } catch (e) {
                  console.error('[AUTH_FALLBACK] launchWebAuthFlow also failed after async getAuthToken failure:', e);
                  resolve(null);
                }
              } else { // Non-interactive failure
                resolve(null);
              }
            } else { // getAuthToken succeeded
              console.log(`Successfully authenticated with Google via getAuthToken (interactive: ${interactive})`);
              resolve(tokenResult as string);
            }
          });
        } catch (initialGetAuthTokenError) {
          console.error(`Synchronous error calling browser.identity.getAuthToken (interactive: ${interactive}):`, initialGetAuthTokenError);
          if (interactive) {
            console.log('[AUTH_FALLBACK_SYNC_ERROR] Synchronous getAuthToken error, attempting launchWebAuthFlow...');
            try {
              const tokenFromWebAuth = await launchWebAuthFlowInternal(interactive);
              resolve(tokenFromWebAuth);
            } catch (e) {
              console.error('[AUTH_FALLBACK_SYNC_ERROR] launchWebAuthFlow also failed after sync getAuthToken error:', e);
              resolve(null);
            }
          } else {
            resolve(null);
          }
        }
      });
    } else { // Not Standard Chrome or getAuthToken is not a function, or already forced to launchWebAuthFlow
      console.log('[AUTH_PATH] Using launchWebAuthFlow directly (Not Standard Chrome, or getAuthToken unavailable, or forced by UAData).');
      return launchWebAuthFlowInternal(interactive);
    }
  };

  // Refactored internal function for launchWebAuthFlow logic
  const launchWebAuthFlowInternal = async (interactive: boolean): Promise<string | null> => {
    console.log(`launchWebAuthFlowInternal called with interactive: ${interactive}`);

    try {
      // 檢測當前瀏覽器
      const isFirefox = /firefox/i.test(navigator.userAgent);
      console.log(`[BROWSER_DETECT] isFirefox: ${isFirefox}`);

      const redirectURL = browser.identity.getRedirectURL();
      console.log(`Redirect URL for OAuth (${isFirefox ? 'Firefox' : 'Standard'}): ${redirectURL}`);

      // @ts-ignore // Vite will define this global constant
      const webAppClientIdPrefix = typeof __WEB_APP_CLIENT_ID_PREFIX__ !== 'undefined' ? __WEB_APP_CLIENT_ID_PREFIX__ : null;
      console.log('[AUTH] Web App Client ID (prefix) from wxt.config.ts for launchWebAuthFlow:', webAppClientIdPrefix);

      if (!webAppClientIdPrefix || webAppClientIdPrefix === 'YOUR_NEW_WEB_APP_CLIENT_ID_PREFIX_HERE') {
        console.error('CRITICAL: __WEB_APP_CLIENT_ID_PREFIX__ is not correctly defined in wxt.config.ts or is still the placeholder. Cannot proceed with launchWebAuthFlow.');
        return null;
      }

      const finalRedirectUri = redirectURL;
      const finalClientId = `${webAppClientIdPrefix}.apps.googleusercontent.com`;
      const finalResponseType = 'token';
      const finalScope = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';

      console.log('[AUTH PARAMS] Redirect URI:', finalRedirectUri);
      console.log('[AUTH PARAMS] Client ID for Auth URL:', finalClientId);
      console.log('[AUTH PARAMS] Response Type:', finalResponseType);
      console.log('[AUTH PARAMS] Scope:', finalScope);

      const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');
      authUrl.searchParams.append('client_id', finalClientId);
      authUrl.searchParams.append('response_type', finalResponseType);
      authUrl.searchParams.append('redirect_uri', finalRedirectUri);
      authUrl.searchParams.append('scope', finalScope);

      // 進一步優化 Firefox 處理
      if (isFirefox) {
        // Firefox 可能需要額外的 OAuth 參數以確保回調正確處理
        console.log('[FIREFOX] Adding Firefox-specific OAuth parameters...');
      }

      if (interactive) {
          authUrl.searchParams.append('prompt', 'select_account');
          console.log('[AUTH PARAMS] Added prompt=select_account for interactive mode.');
      }

      console.log(`Attempting launchWebAuthFlow with URL: ${authUrl.toString()} (interactive: ${interactive})`);
      
      // 在 Firefox 中，我們可能需要特別處理某些超時或回調場景
      const responseUrl = await browser.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive
      });

      if (!responseUrl) {
        console.warn(`launchWebAuthFlow(interactive: ${interactive}) returned no response URL. LastError:`, browser.runtime.lastError?.message);
        return null;
      }

      console.log(`launchWebAuthFlow(interactive: ${interactive}) successful. Response URL received.`);
      
      // 解析回應 URL 中的 token (適用於所有瀏覽器)
      let token = null;

      try {
        const url = new URL(responseUrl);
        
        // 檢查是否是 hash fragment 還是 query parameter (Firefox 可能在某些情況下會有所不同)
        if (url.hash && url.hash.includes('access_token=')) {
          const params = new URLSearchParams(url.hash.substring(1));
          token = params.get('access_token');
          console.log('[TOKEN_PARSE] Token extracted from hash fragment.');
        } else if (url.searchParams.has('access_token')) {
          token = url.searchParams.get('access_token');
          console.log('[TOKEN_PARSE] Token extracted from search parameters.');
        } else {
          console.warn('[TOKEN_PARSE] No access_token found in responseUrl. Full responseUrl:', responseUrl);
        }
      } catch (urlParseError) {
        console.error('[TOKEN_PARSE] Error parsing response URL:', urlParseError);
        console.log('[TOKEN_PARSE] Raw responseUrl:', responseUrl);
      }

      if (!token) {
        console.warn('No access_token found in responseUrl from launchWebAuthFlow.');
        return null;
      }
      
      console.log('Successfully obtained token via launchWebAuthFlow.');
      return token;
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      const lastError = browser.runtime.lastError?.message || 'No runtime lastError';
      console.warn(`launchWebAuthFlow (called with interactive: ${interactive}) failed: ${errorMsg}. LastError: ${lastError}`);
      if (browser.runtime.lastError) {
        console.error(`Authentication error details: ${JSON.stringify(browser.runtime.lastError)}`);
      }
      return null;
    }
  };

  // 獲取用戶信息
  const getUserInfo = async (token: string): Promise<{ email: string; name: string } | null> => {
    try {
      const response = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!response.ok) throw new Error('Failed to fetch user info');
      return await response.json();
    } catch (error) {
      console.error('Error fetching user info:', error);
      return null;
    }
  };

  // 從 Notion 同步到本地的函數 (之前名為 initializeNotionSync)
  const syncFromNotionToLocal = async (forceSync: boolean = false, mode: 'replace' | 'append' = 'replace'): Promise<boolean> => {
    try {
      // forceSync 用於手動觸發，跳過開關檢查
      if (!forceSync) {
        // 手動同步不應該檢查開關，此處邏輯移除
      }

      // const localPromptsResult = await browser.storage.local.get(BROWSER_STORAGE_KEY);
      // const localPrompts = localPromptsResult[BROWSER_STORAGE_KEY] || [];
      const { syncPromptsFromNotion } = await import('./content/utils/notionSync');
      
      console.log(`Executing syncFromNotionToLocal (mode: ${mode})...`);
      // 將 mode 參數傳遞給核心同步函數
      const syncResult = await syncPromptsFromNotion(mode); 
      if (syncResult) {
        console.log('Successfully synchronized prompts from Notion to Local');
        return true;
      } else {
        console.warn('Failed to synchronize prompts from Notion to Local');
        return false;
      }
    } catch (error) {
      console.error('Error in syncFromNotionToLocal:', error);
      return false;
    }
  };

  // 新增：從本地同步到 Notion 的函數
  const syncLocalDataToNotion = async (forceSync: boolean = false): Promise<void> => {
    try {
      if (!forceSync) {
        // 從 browser.storage.sync 獲取 Notion 同步設置
        const syncSettingsResult = await browser.storage.sync.get(['notionSyncToNotionEnabled']);
        const notionSyncToNotionEnabled = syncSettingsResult.notionSyncToNotionEnabled ?? false;
        
        if (!notionSyncToNotionEnabled) {
          console.log('本地 → Notion 同步已禁用，跳過同步');
          return;
        }
      }

      const localPromptsResult = await browser.storage.local.get(BROWSER_STORAGE_KEY);
      const localPrompts: PromptItem[] = localPromptsResult[BROWSER_STORAGE_KEY] || [];

      const { syncPromptsToNotion } = await import('./content/utils/notionSync'); // 需要在 notionSync.ts 中創建此函數
      console.log('Executing syncLocalDataToNotion...');
      const syncResult = await syncPromptsToNotion(localPrompts);
      if (syncResult) {
        console.log('Successfully synchronized local prompts to Notion');
        // 發送成功消息到選項頁 (如果選項頁是打開的)
        browser.runtime.sendMessage({
          action: 'notionSyncSuccess',
          source: 'localToNotion', // 標識是哪個方向的同步成功了
          message: '本地更改已成功同步到 Notion！' 
        }).catch((e: Error) => {
          // 通常選項頁未打開時會報錯 \"Could not establish connection. Receiving end does not exist.\"
          // 這是一個預期行為，可以安全地忽略或只在調試時記錄。
          if (e.message?.includes('Receiving end does not exist')) {
            console.log('Attempted to send localToNotion success message, but options page is not open.');
          } else {
            console.warn('Error sending localToNotion success message:', e);
          }
        });
      }
    } catch (e: unknown) {
      const error = e as Error;
      console.error('Error in syncLocalDataToNotion:', error.message || error);
    }
  };

  // 統一的同步初始化函數 - 這個函數現在主要由手動觸發，並且不再處理定時邏輯
  const initializeNotionSync = async (forceSync: boolean = true): Promise<void> => { // forceSync 默認為 true
    try {
      // 不再檢查 timedSyncEnabled 開關
      const settings = await browser.storage.sync.get(['notionSyncToNotionEnabled']);
      const syncToNotionEnabled = settings.notionSyncToNotionEnabled;

      console.log('Starting manual two-way Notion sync (if enabled)...');
      
      // 首先執行 Notion -> 本地 (replace模式)
      // 注意：這裡不再需要 syncFromNotionToLocal，因為它會在消息處理中被調用
      // await syncFromNotionToLocal(true, 'replace'); 
      
      // 然後，如果啟用了 本地 -> Notion 同步，則執行
      if (syncToNotionEnabled || forceSync) { // forceSync 也會觸發此部分
        await syncLocalDataToNotion(true); // 強制同步
      }
      
      console.log('Manual Notion sync process completed.');
      
    } catch (error) {
      console.error('Error in initializeNotionSync (manual):', error);
    }
  };

  // 初始化默认提示词
  const initializeDefaultPrompts = async () => {
    try {
      const promptsResult = await browser.storage.local.get(BROWSER_STORAGE_KEY)
      const prompts = promptsResult[BROWSER_STORAGE_KEY];
      if (prompts && Array.isArray(prompts) && prompts.length > 0) {
        console.log('背景脚本: 已存在Prompts数据，无需初始化')
        return
      }

      // 保存默认提示
      const data: Record<string, any> = {}
      data[BROWSER_STORAGE_KEY] = DEFAULT_PROMPTS
      await browser.storage.local.set(data)

      console.log('背景脚本: 成功初始化默认Prompts')
    } catch (error) {
      console.error('背景脚本: 初始化默认提示失败:', error)
    }
  }

  // 在扩展启动时立即执行初始化
  initializeDefaultPrompts()

  // 创建右键菜单项
  browser.contextMenus.create({
    id: 'save-prompt',
    title: '保存该提示词',
    contexts: ['selection'], // 仅在选中文本时显示
  })

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
    }
  })

  // 也监听扩展安装/更新事件
  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      console.log('背景脚本: 扩展首次安装，初始化默认Prompts')
      await initializeDefaultPrompts()
      
      await browser.storage.sync.set({
        // notionTimedSyncEnabled: false, // 移除
        notionSyncToNotionEnabled: false // 保留，並默認關閉
      });
      console.log('背景脚本: 已初始化 Notion 同步設置 (本地->Notion 為關閉狀態)');
    }
    // 不再調用 setupSyncInterval
  })

  // 在擴展啟動時進行 Google 登入和 Notion 同步
  browser.runtime.onStartup.addListener(async () => {
    const token = await authenticateWithGoogle(false);
    if (token) {
      const userInfo = await getUserInfo(token);
      if (userInfo) {
        console.log(`User logged in on startup: ${userInfo.email}`);
      }
    }
    // 不再調用 setupSyncInterval
  });

  // 監聽儲存變化以響應跨設備同步
  browser.storage.onChanged.addListener(async (changes, area) => {
    // 移除監聽 notionTimedSyncEnabled 和 SYNC_INTERVAL_KEY 的部分
    // if (area === 'sync' && (changes.notionTimedSyncEnabled || changes[SYNC_INTERVAL_KEY])) { ... }

    if (area === 'local' && changes[BROWSER_STORAGE_KEY]) {
      console.log('本地提示詞數據已更改，檢查是否需要同步到 Notion...');
      // 從 sync 存儲中獲取同步設置
      const settings = await browser.storage.sync.get('notionSyncToNotionEnabled');
      if (settings.notionSyncToNotionEnabled) {
        console.log('本地數據變更，觸發從本地到 Notion 的同步...');
        await syncLocalDataToNotion(true); // 強制執行同步
      } else {
        console.log('同步到 Notion (本地 → Notion) 已關閉，不進行同步操作。');
      }
    }
  });

  // 监听快捷键命令
  browser.commands.onCommand.addListener(async (command) => {
    if (command === 'open-prompt-selector') {
      console.log('背景脚本: 接收到打开提示词选择器的快捷键命令')

      try {
        // 获取当前活动的标签页
        const tabs = await browser.tabs.query({ active: true, currentWindow: true })

        if (tabs.length > 0 && tabs[0].id) {
          // 向活动标签页发送打开提示词选择器的消息
          await browser.tabs.sendMessage(tabs[0].id, { action: 'openPromptSelector' })
          console.log('背景脚本: 已发送打开提示词选择器的消息到活动标签页')
        } else {
          console.error('背景脚本: 未找到活动的标签页')
        }
      } catch (error) {
        console.error('背景脚本: 发送消息到标签页失败:', error)
      }
    } else if (command === 'save-selected-prompt') {
      console.log('背景脚本: 接收到保存选中文本的快捷键命令')

      try {
        // 获取当前活动的标签页
        const tabs = await browser.tabs.query({ active: true, currentWindow: true })

        if (tabs.length > 0 && tabs[0].id) {
          // 向活动标签页发送获取选中文本的消息
          const response = await browser.tabs.sendMessage(tabs[0].id, { action: 'getSelectedText' })
        } else {
          console.error('背景脚本: 未找到活动的标签页')
        }
      } catch (error) {
        console.error('背景脚本: 获取选中文本或打开选项页失败:', error)
      }
    }
  })

  // 處理來自content script的消息
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('背景脚本: 收到消息', message);

    if (message.action === 'getPrompts') {
      (async () => {
        const result = await browser.storage.local.get(BROWSER_STORAGE_KEY);
        const allPrompts = result[BROWSER_STORAGE_KEY] || [];
        const enabledPrompts = allPrompts.filter((p: PromptItem) => p.enabled !== false);
        sendResponse({ success: true, data: enabledPrompts });
      })();
      return true;
    }

    if (message.action === 'openOptionsPage' || message.action === 'openOptionsPageWithText') {
      (async () => {
        const optionsUrl = browser.runtime.getURL('/options.html');
        let urlToOpen = optionsUrl;
        if (message.action === 'openOptionsPageWithText' && message.text) {
          urlToOpen = `${optionsUrl}?action=new&content=${encodeURIComponent(message.text)}`;
        }
        await browser.tabs.create({ url: urlToOpen });
        sendResponse({ success: true });
      })();
      return true;
    }
    
    // 處理手動同步請求 (雙向，但 Notion->本地部分通過下面的專用消息處理)
    if (message.action === 'manualSyncToNotion') { // 這個消息可能需要重新評估其用途
      (async () => {
        try {
          console.log('手動觸發 Notion 同步 (主要為本地 → Notion)... ');
          await initializeNotionSync(true); 
          sendResponse({ success: true, message: "本地 → Notion 同步已觸發 (如果啟用)" });
        } catch (error: any) {
          console.error('手動同步 (本地 → Notion) 失敗:', error);
          sendResponse({ success: false, error: error.message || '未知錯誤' });
        }
      })();
      return true;
    }
    
    // 處理從 Notion 到本地的同步請求 (手動按鈕觸發)
    if (message.action === 'syncFromNotionToLocal') {
      (async () => {
        try {
          console.log(`手動觸發 Notion → 本地同步 (模式: ${message.mode || 'replace'})...`);
          // 直接調用修改後的 syncFromNotionToLocal
          const syncResult = await syncFromNotionToLocal(true, message.mode || 'replace');
          
          if (syncResult) {
            console.log(`Notion → 本地同步 (${message.mode || 'replace'} 模式) 成功完成`);
            sendResponse({ success: true });
          } else {
            console.error(`Notion → 本地同步 (${message.mode || 'replace'} 模式) 失敗`);
            sendResponse({ success: false, error: '同步操作失敗' });
          }
        } catch (error: any) {
          console.error('從 Notion 到本地同步失敗:', error);
          sendResponse({ success: false, error: error.message || '未知錯誤' });
        }
      })();
      return true;
    }
    
    // 處理從本地到 Notion 的同步請求
    if (message.action === 'syncLocalToNotion') {
      (async () => {
        try {
          console.log('手動觸發 本地 → Notion 同步...');
          
          const localPromptsResult = await browser.storage.local.get(BROWSER_STORAGE_KEY);
          const localPrompts = localPromptsResult[BROWSER_STORAGE_KEY] || [];
          
          if (!localPrompts || localPrompts.length === 0) {
            console.log('沒有本地提示詞可同步到 Notion');
            sendResponse({ success: true, message: '沒有本地提示詞可同步' });
            return;
          }
          
          const { syncPromptsToNotion } = await import('./content/utils/notionSync');
          const syncResult = await syncPromptsToNotion(localPrompts);
          
          if (syncResult) {
            console.log('本地 → Notion 同步成功完成');
            sendResponse({ success: true });
          } else {
            console.error('本地 → Notion 同步失敗');
            sendResponse({ success: false, error: '同步操作失敗' });
          }
        } catch (error: any) {
          console.error('從本地到 Notion 同步失敗:', error);
          sendResponse({ success: false, error: error.message || '未知錯誤' });
        }
      })();
      return true;
    }

    if (message.action === 'authenticateWithGoogle') {
      (async () => {
        try {
          const token = await authenticateWithGoogle(message.interactive);
          if (!token) {
            console.log('authenticateWithGoogle message handler: token is null');
            const responseObject = { success: false, error: 'Failed to authenticate with Google' };
            console.log('authenticateWithGoogle message handler: sending error object:', responseObject);
            sendResponse(responseObject);
            return;
          }
          
          console.log('authenticateWithGoogle message handler: token acquired, fetching user info...');
          const userInfo = await getUserInfo(token);
          if (!userInfo) {
            console.log('authenticateWithGoogle message handler: userInfo is null');
            const responseObject = { success: false, error: 'Failed to fetch user info' };
            console.log('authenticateWithGoogle message handler: sending error object:', responseObject);
            sendResponse(responseObject);
            return;
          }
          
          // 登錄成功，存儲用戶信息到 local storage
          try {
            await browser.storage.local.set({ googleUser: userInfo });
            console.log('authenticateWithGoogle message handler: UserInfo stored in local storage.');
          } catch (storageError) {
            console.error('authenticateWithGoogle message handler: Error storing userInfo to local storage:', storageError);
          }

          console.log('authenticateWithGoogle message handler: success, sending token and userInfo');
          const successObject = { 
            success: true, 
            data: { token, userInfo } 
          };
          console.log('authenticateWithGoogle message handler: sending success object:', successObject);
          sendResponse(successObject);
        } catch (error: any) {
          console.error('背景脚本: Google 登录失败 (in message handler):', error);
          const errorObject = { success: false, error: error.message };
          console.log('authenticateWithGoogle message handler: sending error object from catch:', errorObject);
          sendResponse(errorObject);
        }
      })();
      return true; // Indicates an asynchronous response for authenticateWithGoogle
    }

    // 用于登出 Google 帐户
    if (message.action === 'logoutGoogle') {
      (async () => {
        try {
          // 这里实现登出逻辑，例如清除令牌
          // 如果使用 Chrome 特有 API
          if (typeof browser.identity.removeCachedAuthToken === 'function') {
            // 获取当前令牌然后移除它
            browser.identity.getAuthToken({ interactive: false }, (token) => {
              if (token) {
                // 转换 token 为字符串类型
                const tokenStr = typeof token === 'string' ? token : JSON.stringify(token);
                browser.identity.removeCachedAuthToken({ token: tokenStr }, () => {
                  console.log('令牌已成功移除');
                  // Consider if sendResponse should be here or outside the callback
                });
              }
              // else: No token to remove, or getAuthToken failed
            });
          }
          // Assuming logout is successful if no errors, or if removeCachedAuthToken is not present.
          // If removeCachedAuthToken is async and we need to wait, this needs adjustment.
          
          // 清除本地存儲的用戶信息
          try {
            await browser.storage.local.remove('googleUser');
            console.log('logoutGoogle message handler: UserInfo removed from local storage.');
          } catch (storageError) {
            console.error('logoutGoogle message handler: Error removing userInfo from local storage:', storageError);
          }

          sendResponse({ success: true }); 
        } catch (error: any) {
          console.error('背景脚本: Google 登出失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // Indicates an asynchronous response for logoutGoogle
    }

    // Default case
    // console.log('No specific action matched or synchronous message'); // 可以取消註釋以進行調試
    // return false; // 確保未處理的消息返回 false
  });
})
