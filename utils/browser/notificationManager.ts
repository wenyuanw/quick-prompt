import { t } from "@/utils/i18n"

// Setup notification click handlers
export const setupNotificationHandlers = (): void => {
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
                message: t('shortcutSetupTip')
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
};
