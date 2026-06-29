import { t } from "@/utils/i18n"
import {
  isSidePanelOpen,
  markSidePanelClosed,
  markSidePanelOpen,
  requestSidePanelClose,
} from "@/utils/browser/sidePanelManager"

// 侧边栏切换去抖时间戳：快速连按时，等上一次开/关稳定后再处理，避免在面板创建过程中误判
let lastSidePanelToggleAt = 0
const SIDE_PANEL_TOGGLE_DEBOUNCE_MS = 300

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
export const handleCommand = async (command: string, tab?: Browser.tabs.Tab): Promise<void> => {
  if (command === 'open-side-panel') {
    console.log('背景脚本: 快捷键切换侧边栏');
    const anyBrowser = browser as any;
    const windowId = tab?.windowId;

    // Firefox：使用原生切换
    if (!anyBrowser.sidePanel && anyBrowser.sidebarAction?.toggle) {
      try {
        anyBrowser.sidebarAction.toggle();
      } catch (error) {
        console.error('背景脚本: 切换侧边栏失败:', error);
      }
      return;
    }

    // 拿不到 windowId 的兜底（极少见）：尽力打开
    if (windowId == null) {
      try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const fallbackWindowId = tabs[0]?.windowId;
        if (fallbackWindowId != null && anyBrowser.sidePanel?.open) {
          anyBrowser.sidePanel.open({ windowId: fallbackWindowId });
        }
      } catch (error) {
        console.error('背景脚本: 打开侧边栏失败:', error);
      }
      return;
    }

    // 去抖：快速连按时，等上一次开/关稳定后再处理，避免在面板创建过程中产生竞态
    const now = Date.now();
    if (now - lastSidePanelToggleAt < SIDE_PANEL_TOGGLE_DEBOUNCE_MS) {
      return;
    }
    lastSidePanelToggleAt = now;

    if (isSidePanelOpen(windowId)) {
      // 已打开 -> 关闭。close() 无需用户手势，可异步执行。先乐观更新状态。
      markSidePanelClosed(windowId);
      if (anyBrowser.sidePanel?.close) {
        anyBrowser.sidePanel
          .close({ windowId })
          .catch((error: unknown) => {
            // 关闭失败时尝试让面板自行关闭；若也失败则回滚状态
            if (!requestSidePanelClose(windowId)) {
              markSidePanelOpen(windowId);
            }
            console.error('背景脚本: 关闭侧边栏失败:', error);
          });
      } else if (!requestSidePanelClose(windowId)) {
        markSidePanelOpen(windowId);
      }
      return;
    }

    // 未打开 -> 打开。open() 必须在用户手势内同步调用，open() 之前不能有 await。
    // 先乐观标记为打开，使紧接着的下一次按键能正确判定为"关闭"。
    if (anyBrowser.sidePanel?.open) {
      markSidePanelOpen(windowId);
      anyBrowser.sidePanel
        .open({ windowId })
        .catch((error: unknown) => {
          markSidePanelClosed(windowId);
          console.error('背景脚本: 打开侧边栏失败:', error);
        });
    }
    return;
  }

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
