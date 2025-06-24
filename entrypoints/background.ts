import { BROWSER_STORAGE_KEY, DEFAULT_PROMPTS } from "@/utils/constants"
import { initializeDefaultCategories, migratePromptsWithCategory } from "@/utils/categoryUtils"
import { t } from "@/utils/i18n"

// Import extracted modules
import { checkShortcutConfiguration, handleCommand } from "@/utils/browser/shortcutManager"
import { createContextMenus, handleContextMenuClick } from "@/utils/browser/contextMenuManager"
import { setupNotificationHandlers } from "@/utils/browser/notificationManager"
import { setupStorageChangeListeners } from "@/utils/browser/storageManager"
import { handleRuntimeMessage } from "@/utils/browser/messageHandler"

export default defineBackground(() => {
  console.log('Hello background!', { id: browser.runtime.id })

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
        console.log(t('backgroundNotionSyncInitialized'));
      }
    } catch (error) {
      console.error('背景脚本: 初始化默认数据失败:', error);
    }
  };

  // Initialize default data
  initializeDefaultData();

  // Setup all the modular components
  createContextMenus();
  setupNotificationHandlers();
  setupStorageChangeListeners();

  // Setup event listeners
  browser.contextMenus.onClicked.addListener(handleContextMenuClick);
  browser.commands.onCommand.addListener(handleCommand);

  // Extension lifecycle events
  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      console.log('背景脚本: 扩展首次安装');
      await initializeDefaultData();
      await browser.storage.sync.set({ notionSyncToNotionEnabled: false });
      console.log(t('backgroundNotionSyncInitialized'));

      // 安装后延迟一下再检测快捷键，确保扩展完全加载
      setTimeout(async () => {
        await checkShortcutConfiguration();
      }, 2000);
    }
  });

  // Setup message handler
  browser.runtime.onMessage.addListener(handleRuntimeMessage);

  console.log('Background script fully initialized with modular components.');
})
