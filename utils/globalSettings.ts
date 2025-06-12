import { browser } from '#imports';

export interface GlobalSettings {
  closeModalOnOutsideClick: boolean;
  // 可以添加更多全局设置
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  closeModalOnOutsideClick: true,
};

const GLOBAL_SETTINGS_KEY = 'globalSettings';

// 获取全局设置
export const getGlobalSettings = async (): Promise<GlobalSettings> => {
  try {
    const result = await browser.storage.sync.get(GLOBAL_SETTINGS_KEY);
    return {
      ...DEFAULT_GLOBAL_SETTINGS,
      ...result[GLOBAL_SETTINGS_KEY],
    };
  } catch (error) {
    console.error('Failed to get global settings:', error);
    return DEFAULT_GLOBAL_SETTINGS;
  }
};

// 保存全局设置
export const saveGlobalSettings = async (settings: GlobalSettings): Promise<void> => {
  try {
    await browser.storage.sync.set({
      [GLOBAL_SETTINGS_KEY]: settings,
    });
  } catch (error) {
    console.error('Failed to save global settings:', error);
    throw error;
  }
};

// 更新部分全局设置
export const updateGlobalSettings = async (partialSettings: Partial<GlobalSettings>): Promise<void> => {
  try {
    const currentSettings = await getGlobalSettings();
    const newSettings = { ...currentSettings, ...partialSettings };
    await saveGlobalSettings(newSettings);
  } catch (error) {
    console.error('Failed to update global settings:', error);
    throw error;
  }
};

// 获取特定设置
export const getGlobalSetting = async <K extends keyof GlobalSettings>(
  key: K
): Promise<GlobalSettings[K]> => {
  const settings = await getGlobalSettings();
  return settings[key];
}; 