import React, { useState, useEffect } from 'react';
import { browser } from '#imports';
import { getGlobalSettings, updateGlobalSettings, type GlobalSettings } from '@/utils/globalSettings';
import { t, initLocale, setLocale, getCurrentLocale, SUPPORTED_LOCALES } from '@/utils/i18n';

const GlobalSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<GlobalSettings>({
    closeModalOnOutsideClick: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [shortcuts, setShortcuts] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        const globalSettings = await getGlobalSettings();
        setSettings(globalSettings);
        await initLocale();

        try {
          const commands = await browser.commands.getAll();
          const shortcutMap: { [key: string]: string } = {};
          commands.forEach(command => {
            if (command.name && command.shortcut) {
              shortcutMap[command.name] = command.shortcut;
            }
          });
          setShortcuts(shortcutMap);
        } catch (error) {
          console.warn('Unable to get shortcuts:', error);
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleSettingChange = async (key: keyof GlobalSettings, value: any) => {
    try {
      setIsSaving(true);
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);
      await updateGlobalSettings({ [key]: value });
    } catch (error) {
      console.error('Failed to update setting:', error);
      setSettings(prev => ({ ...prev, [key]: settings[key] }));
    } finally {
      setIsSaving(false);
    }
  };

  const openShortcutSettings = () => {
    const isChrome = navigator.userAgent.includes('Chrome');
    const isFirefox = navigator.userAgent.includes('Firefox');

    if (isChrome) {
      browser.tabs.create({ url: 'chrome://extensions/shortcuts' });
    } else if (isFirefox) {
      browser.tabs.create({ url: 'about:addons' });
    } else {
      alert(t('pleaseManuallyNavigateToShortcuts'));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="flex justify-center items-center min-h-screen">
          <div className="text-center space-y-4">
            <div className="relative">
              <div className="w-16 h-16 mx-auto">
                <div className="absolute inset-0 border-4 border-blue-200 dark:border-blue-800 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-blue-600 dark:border-blue-400 rounded-full border-t-transparent animate-spin"></div>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">{t('loading')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('loadingGlobalSettings')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 页面头部 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('globalSettings')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('globalSettingsDescription')}
          </p>
        </div>

        {/* 所有设置合并在一个卡片中 */}
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow rounded-xl divide-y divide-gray-100 dark:divide-gray-700/50">

          {/* 语言 */}
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('languageLabel')}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('languageDescription')}</p>
            </div>
            <div className="ml-4 flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
              {SUPPORTED_LOCALES.map((locale) => {
                const isActive = (settings.language || getCurrentLocale()) === locale.code;
                return (
                  <button
                    key={locale.code}
                    onClick={async () => {
                      if (isActive || isSaving) return;
                      await handleSettingChange('language', locale.code);
                      setLocale(locale.code);
                      window.location.reload();
                    }}
                    disabled={isSaving}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                    } disabled:opacity-50`}
                  >
                    {locale.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 弹窗行为 */}
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('closeModalOnOutsideClick')}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('closeModalOnOutsideClickDescription')}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-4 flex-shrink-0">
              <input
                type="checkbox"
                checked={settings.closeModalOnOutsideClick}
                onChange={(e) => handleSettingChange('closeModalOnOutsideClick', e.target.checked)}
                disabled={isSaving}
                className="sr-only peer"
              />
              <div className="relative w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-1/2 after:right-1/2 after:-translate-y-1/2 after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 disabled:opacity-50"></div>
            </label>
          </div>

          {/* 快捷键 */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('keyboardShortcuts')}</h3>
              <button
                onClick={openShortcutSettings}
                className="inline-flex items-center text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              >
                {t('manageShortcuts')}
                <svg className="w-3.5 h-3.5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            </div>
            <div className="space-y-1.5">
              {[
                { key: 'open-prompt-selector', label: t('openPromptSelector') },
                { key: 'save-selected-prompt', label: t('saveSelectedPrompt') },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={openShortcutSettings}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/40 hover:bg-gray-100 dark:hover:bg-gray-700/70 transition-colors cursor-pointer"
                >
                  <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
                  {shortcuts[key] ? (
                    <span className="flex items-center gap-1">
                      {shortcuts[key].split('+').map((part, i) => (
                        <span key={i} className="flex items-center">
                          {i > 0 && <span className="text-gray-400 dark:text-gray-500 mx-0.5 text-[11px]">+</span>}
                          <span className="inline-block px-1.5 py-0.5 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded text-[11px] font-semibold text-gray-700 dark:text-gray-200 shadow-sm">{part}</span>
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400 dark:text-gray-500">{t('notSet')}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalSettingsPage; 
