import { t } from "@/utils/i18n"

// Create context menu items
export const createContextMenus = (): void => {
  // 创建插件图标右键菜单项
  browser.contextMenus.create({
    id: 'open-options',
    title: t('promptManagement'),
    contexts: ['action'], // 插件图标右键菜单
  })

  browser.contextMenus.create({
    id: 'category-management',
    title: t('categoryManagement'),
    contexts: ['action'],
  })

  // 创建页面内容右键菜单项
  browser.contextMenus.create({
    id: 'save-prompt',
    title: t('savePrompt'),
    contexts: ['selection'],
  });
}

// Handle context menu clicks
export const handleContextMenuClick = async (info: Browser.contextMenus.OnClickData, _tab?: Browser.tabs.Tab): Promise<void> => {
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
};
