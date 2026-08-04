import { browser } from '#imports';

export interface QuickInjectDomainRule {
  domain: string;
  promptId: string;
}

export type QuickInjectMode = 'overwrite' | 'append';

export interface GlobalSettings {
  closeModalOnOutsideClick: boolean;
  language?: string;
  quickInjectEnabled: boolean;
  quickInjectOnFocus: boolean;
  quickInjectMode: QuickInjectMode;
  quickInjectRules: QuickInjectDomainRule[];
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  closeModalOnOutsideClick: true,
  quickInjectEnabled: false,
  quickInjectOnFocus: false,
  quickInjectMode: 'overwrite',
  quickInjectRules: [],
};

const GLOBAL_SETTINGS_KEY = 'globalSettings';

const normalizeQuickInjectRules = (
  rules: unknown
): QuickInjectDomainRule[] => {
  if (!Array.isArray(rules)) {
    return [];
  }

  const normalized: QuickInjectDomainRule[] = [];
  const seen = new Set<string>();

  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') {
      continue;
    }

    const domain = String((rule as QuickInjectDomainRule).domain || '')
      .trim()
      .toLowerCase()
      .replace(/^www\./, '');
    const promptId = String((rule as QuickInjectDomainRule).promptId || '').trim();

    if (!domain || !promptId || seen.has(domain)) {
      continue;
    }

    seen.add(domain);
    normalized.push({ domain, promptId });
  }

  return normalized;
};

export const normalizeGlobalSettings = (
  partial?: Partial<GlobalSettings> | null
): GlobalSettings => {
  const merged = {
    ...DEFAULT_GLOBAL_SETTINGS,
    ...(partial || {}),
  };

  return {
    ...merged,
    quickInjectEnabled: Boolean(merged.quickInjectEnabled),
    quickInjectOnFocus: Boolean(merged.quickInjectOnFocus),
    quickInjectMode: merged.quickInjectMode === 'append' ? 'append' : 'overwrite',
    quickInjectRules: normalizeQuickInjectRules(merged.quickInjectRules),
  };
};

/**
 * Parse optional globalSettings from a backup payload.
 * Returns null when the field is absent so older backups stay compatible.
 */
export const parseBackupGlobalSettings = (
  value: unknown
): GlobalSettings | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return normalizeGlobalSettings(value as Partial<GlobalSettings>);
};

export const applyImportedGlobalSettings = async (
  value: unknown
): Promise<boolean> => {
  const settings = parseBackupGlobalSettings(value);
  if (!settings) {
    return false;
  }

  await saveGlobalSettings(settings);
  return true;
};

// 获取全局设置
export const getGlobalSettings = async (): Promise<GlobalSettings> => {
  try {
    const result = await browser.storage.sync.get(GLOBAL_SETTINGS_KEY);
    return normalizeGlobalSettings(result[GLOBAL_SETTINGS_KEY] as Partial<GlobalSettings> | undefined);
  } catch (error) {
    console.error('Failed to get global settings:', error);
    return DEFAULT_GLOBAL_SETTINGS;
  }
};

// 保存全局设置
export const saveGlobalSettings = async (settings: GlobalSettings): Promise<void> => {
  try {
    await browser.storage.sync.set({
      [GLOBAL_SETTINGS_KEY]: normalizeGlobalSettings(settings),
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

export const normalizeHostname = (hostname: string): string => {
  let value = hostname.trim().toLowerCase();

  try {
    if (value.includes('://')) {
      value = new URL(value).hostname;
    } else if (value.includes('/')) {
      value = value.split('/')[0] || value;
    }
  } catch {
    value = value.split('/')[0] || value;
  }

  // Strip optional port
  value = value.replace(/:\d+$/, '');

  return value.replace(/^www\./, '');
};

export const findQuickInjectRule = (
  rules: QuickInjectDomainRule[],
  hostname: string
): QuickInjectDomainRule | null => {
  const normalizedHostname = normalizeHostname(hostname);
  return rules.find((rule) => rule.domain === normalizedHostname) || null;
};
