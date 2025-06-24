import { t } from "@/utils/i18n"

// 检测快捷键配置状态
export const checkShortcutConfiguration = async (): Promise<void> => {
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
  } catch (error) {
    console.error('背景脚本: 检测快捷键配置时出错:', error);
  }
};

// Handle keyboard commands
export const handleCommand = async (command: string): Promise<void> => {
  if (command === 'open-prompt-selector') {
    console.log(t('backgroundShortcutOpenSelector'));
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0 && tabs[0].id) {
        await browser.tabs.sendMessage(tabs[0].id, { action: 'openPromptSelector' });
        console.log(t('backgroundShortcutSelectorSent'));
      } else {
        console.error(t('backgroundNoActiveTab'));
      }
    } catch (error) {
      console.error(t('backgroundSendMessageError'), error);
    }
  } else if (command === 'save-selected-prompt') {
    console.log(t('backgroundSaveShortcut'));
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0 && tabs[0].id) {
        const response = await browser.tabs.sendMessage(tabs[0].id, { action: 'getSelectedText' });
        if (response && response.text) {
          const optionsUrl = browser.runtime.getURL('/options.html');
          const urlWithParams = `${optionsUrl}?action=new&content=${encodeURIComponent(response.text)}`;
          await browser.tabs.create({ url: urlWithParams });
        } else {
          console.log(t('shortcutSaveNoTextResponse'))
        }
      } else {
        console.error(t('backgroundNoActiveTab'));
      }
    } catch (error) {
      console.error(t('backgroundGetSelectedTextError'), error);
    }
  }
};
