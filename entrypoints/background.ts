export default defineBackground(() => {
  console.log('Hello background!', { id: browser.runtime.id })

  // 默认的prompt样例
  const DEFAULT_PROMPTS = [
    {
      id: crypto.randomUUID(),
      title: '吉卜力风格',
      content: '将图片转换为吉卜力风格',
      tags: ['画图', '吉卜力'],
    },
    {
      id: crypto.randomUUID(),
      title: '代码解释',
      content: '请解释以下代码的功能和工作原理：\n\n',
      tags: ['编程'],
    },
  ]

  // 获取storage接口的key名，和options页面保持一致
  const BROWSER_STORAGE_KEY = 'userPrompts'

  // 初始化默认提示词
  const initializeDefaultPrompts = async () => {
    try {
      const prompts = await browser.storage.local.get(BROWSER_STORAGE_KEY)

      // 如果已经有提示，不初始化
      if (
        prompts[BROWSER_STORAGE_KEY as keyof typeof prompts] &&
        Array.isArray(prompts[BROWSER_STORAGE_KEY as keyof typeof prompts]) &&
        (prompts[BROWSER_STORAGE_KEY as keyof typeof prompts] as any[]).length > 0
      ) {
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
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      console.log('背景脚本: 扩展首次安装，初始化默认Prompts')
      initializeDefaultPrompts()
    }
  })

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
    }
  })

  // 处理来自content script的消息
  browser.runtime.onMessage.addListener(async (message, sender) => {
    console.log('背景脚本: 收到消息', message)

    if (message.action === 'getPrompts') {
      try {
        // 从local storage获取所有prompts
        const result = await browser.storage.local.get(BROWSER_STORAGE_KEY)
        const prompts = result[BROWSER_STORAGE_KEY] || []

        console.log('背景脚本: 获取到', prompts.length, '个Prompts')
        return {
          success: true,
          data: prompts,
        }
      } catch (error) {
        console.error('背景脚本: 获取Prompts时出错:', error)
        return {
          success: false,
          error: '无法获取Prompts数据',
        }
      }
    }

    if (message.action === 'openOptionsPage') {
      try {
        // 获取选项页URL - 使用WXT框架特定的路径格式
        const optionsUrl = browser.runtime.getURL('/options.html')
        // 在新标签页打开选项页
        await browser.tabs.create({ url: optionsUrl })
        return { success: true }
      } catch (error) {
        console.error('打开选项页失败:', error)
        // 如果打开新标签页失败，回退到默认打开方式
        browser.runtime.openOptionsPage()
        return { success: true, fallback: true }
      }
    }

    return false
  })
})
