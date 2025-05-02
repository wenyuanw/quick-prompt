import { storage } from '#imports'
import { showPromptSelector } from './components/PromptSelector'
import '~/assets/tailwind.css'
import './content.css'

export interface PromptItem {
  id: string
  title: string
  content: string
  tags: string[]
}

// 检测系统是否为暗黑模式
const isDarkMode = () => {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export default defineContentScript({
  matches: ['*://*/*'],

  async main(ctx) {
    console.log('内容脚本 (WXT): 已加载')

    // 记录上次输入的状态
    let lastInputValue = ''
    let isPromptSelectorOpen = false

    // 设置容器的主题属性
    const setThemeAttributes = (container: HTMLElement) => {
      // 设置数据属性以指示当前主题
      container.setAttribute('data-theme', isDarkMode() ? 'dark' : 'light')

      // 监听主题变化
      const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleThemeChange = (e: MediaQueryListEvent) => {
        container.setAttribute('data-theme', e.matches ? 'dark' : 'light')
      }

      if (darkModeMediaQuery.addEventListener) {
        darkModeMediaQuery.addEventListener('change', handleThemeChange)
      }
    }

    // 通用函数：获取当前聚焦的输入框元素（如果有）
    const getFocusedTextInput = (): HTMLInputElement | HTMLTextAreaElement | null => {
      const activeElement = document.activeElement
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement
      ) {
        return activeElement
      }
      return null
    }

    // 通用函数：打开选项页并传递选中的文本
    const openOptionsWithText = async (text: string) => {
      try {
        // 不直接使用tabs API，而是发送消息给背景脚本
        const response = await browser.runtime.sendMessage({
          action: 'openOptionsPageWithText',
          text: text
        })
        
        console.log('内容脚本: 已请求背景脚本打开选项页', response)
        return response && response.success
      } catch (error) {
        console.error('内容脚本: 请求打开选项页失败:', error)
        return false
      }
    }

    // 通用函数：打开提示词选择器
    const openPromptSelector = async (inputElement?: HTMLInputElement | HTMLTextAreaElement) => {
      if (isPromptSelectorOpen) return

      try {
        isPromptSelectorOpen = true
        console.log('准备打开提示词选择器...')

        // 如果没有提供输入框，尝试获取当前聚焦的输入框
        const targetInput = inputElement || getFocusedTextInput()

        // 如果找不到任何输入框，给出提示并返回
        if (!targetInput) {
          alert('请先点击一个文本输入框，然后再使用快捷键打开提示词选择器。')
          isPromptSelectorOpen = false
          return
        }

        // 从存储中获取所有提示词
        const prompts = (await storage.getItem<PromptItem[]>('local:userPrompts')) || []

        if (prompts && prompts.length > 0) {
          console.log(`共找到 ${prompts.length} 个提示词，显示选择器...`)

          // 显示提示词选择器弹窗
          const container = showPromptSelector(prompts, targetInput)

          // 设置主题
          if (container) {
            setThemeAttributes(container)
          }

          // 弹窗关闭后重置状态
          setTimeout(() => {
            isPromptSelectorOpen = false
          }, 500)
        } else {
          console.log('没有找到已存储的提示词')
          alert('没有找到已保存的提示词。请先在扩展中添加一些提示词。')
          isPromptSelectorOpen = false
        }
      } catch (error) {
        console.error('获取提示词时发生错误:', error)
        isPromptSelectorOpen = false
      }
    }

    // 监听输入框输入事件
    document.addEventListener('input', async (event) => {
      // 检查事件目标是否为输入元素
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        const inputElement = event.target as HTMLInputElement | HTMLTextAreaElement
        const value = inputElement.value

        // 检查是否输入了"/p"并且弹窗尚未打开
        if (value.endsWith('/p') && lastInputValue !== value && !isPromptSelectorOpen) {
          lastInputValue = value

          // 使用通用函数打开提示词选择器
          await openPromptSelector(inputElement)
        } else if (!value.endsWith('/p')) {
          // 更新上次输入值
          lastInputValue = value
        }
      }
    })

    // 监听来自背景脚本的消息
    browser.runtime.onMessage.addListener(async (message) => {
      console.log('内容脚本: 收到消息', message)

      if (message.action === 'openPromptSelector') {
        // 使用通用函数打开提示词选择器
        await openPromptSelector()
        return { success: true }
      }

      if (message.action === 'getSelectedText') {
        try {
          // 获取当前选中的文本
          const selectedText = window.getSelection()?.toString() || ''
          console.log('内容脚本: 获取到选中文本:', selectedText)
          
          if (selectedText) {
            // 如果有选中文本，通过背景脚本打开选项页
            const opened = await openOptionsWithText(selectedText)
            return { success: true, text: selectedText, openedOptionsPage: opened }
          } else {
            console.log('内容脚本: 未选中任何文本')
            return { success: true, text: '' }
          }
        } catch (error) {
          console.error('内容脚本: 获取选中文本时出错:', error)
          return { success: false, error: '获取选中文本失败' }
        }
      }

      return false
    })
  },
})
