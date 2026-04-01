import { browser } from '#imports';
import zhMessages from '@/public/_locales/zh/messages.json';
import enMessages from '@/public/_locales/en/messages.json';

interface MessageEntry {
  message: string;
  placeholders?: Record<string, { content: string; example?: string }>;
}

type Messages = Record<string, MessageEntry>;

const messages: Record<string, Messages> = {
  zh: zhMessages as Messages,
  en: enMessages as Messages,
};

let currentLocale = 'en';

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '简体中文' },
];

export function getCurrentLocale(): string {
  return currentLocale;
}

export function setLocale(locale: string): void {
  currentLocale = locale;
  globalThis.dispatchEvent(new CustomEvent('quick-prompt-locale-change', { detail: { locale } }));
}

export async function initLocale(): Promise<void> {
  try {
    const result = await browser.storage.sync.get('globalSettings');
    const settings = result.globalSettings as Record<string, any> | undefined;
    if (settings?.language) {
      currentLocale = settings.language;
      return;
    }
  } catch (error) {
    console.warn('Failed to read language from storage:', error);
  }

  try {
    const uiLang = browser.i18n.getUILanguage();
    currentLocale = uiLang.startsWith('zh') ? 'zh' : 'en';
  } catch {
    currentLocale = 'en';
  }
}

export function t(key: string, substitutions?: string[]): string {
  const entry = messages[currentLocale]?.[key] || messages['en']?.[key];
  if (!entry) return key;

  let msg = entry.message;

  if (entry.placeholders && substitutions) {
    for (const [name, def] of Object.entries(entry.placeholders)) {
      const match = def.content.match(/^\$(\d+)$/);
      if (match) {
        const index = parseInt(match[1], 10) - 1;
        if (index >= 0 && index < substitutions.length) {
          const regex = new RegExp(`\\$${name}\\$`, 'gi');
          msg = msg.replace(regex, substitutions[index]);
        }
      }
    }
  }

  if (substitutions) {
    for (let i = 0; i < substitutions.length; i++) {
      msg = msg.replace(new RegExp(`\\$${i + 1}`, 'g'), substitutions[i]);
    }
  }

  return msg;
}
