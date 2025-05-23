import { storage } from '#imports'
import { isDarkMode } from '@/utils/tools'
import { showPromptSelector } from './components/PromptSelector'
import { extractVariables } from './utils/variableParser'
import { BROWSER_STORAGE_KEY } from '@/utils/constants'
import type { EditableElement, PromptItem, PromptItemWithVariables } from '@/utils/types'

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

    // 获取 contenteditable 元素的内容
    const getContentEditableValue = (element: HTMLElement): string => {
      return element.textContent || ''
    }

    // 设置 contenteditable 元素的内容
    const setContentEditableValue = (element: HTMLElement, value: string): void => {
      element.textContent = value
      // 触发 input 事件以通知其他监听器内容变化
      const inputEvent = new InputEvent('input', { bubbles: true })
      element.dispatchEvent(inputEvent)
    }

    // 创建适配器以统一处理不同类型的输入元素
    const createEditableAdapter = (element: HTMLElement | HTMLInputElement | HTMLTextAreaElement): EditableElement => {
      // 处理标准输入元素
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element
      } 
      // 处理 contenteditable 元素
      else if (element.getAttribute('contenteditable') === 'true') {
        const adapter = {
          _element: element, // 保存原始元素引用
          get value(): string {
            return getContentEditableValue(element)
          },
          set value(newValue: string) {
            setContentEditableValue(element, newValue)
          },
          // contenteditable 元素没有原生的 selectionStart 属性，
          // 但可以通过 selection API 获取当前光标位置
          get selectionStart(): number {
            const selection = window.getSelection()
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0)
              if (element.contains(range.startContainer)) {
                return range.startOffset
              }
            }
            return 0
          },
          focus(): void {
            element.focus()
          },
          setSelectionRange(start: number, end: number): void {
            try {
              const selection = window.getSelection()
              if (selection) {
                selection.removeAllRanges()
                const range = document.createRange()
                // 尝试在文本节点中设置范围
                let textNode = element.firstChild
                if (!textNode) {
                  textNode = document.createTextNode('')
                  element.appendChild(textNode)
                }
                range.setStart(textNode, Math.min(start, textNode.textContent?.length || 0))
                range.setEnd(textNode, Math.min(end, textNode.textContent?.length || 0))
                selection.addRange(range)
              }
            } catch (error) {
              console.error('设置 contenteditable 光标位置失败:', error)
            }
          },
          dispatchEvent(event: Event): boolean {
            return element.dispatchEvent(event)
          }
        }
        return adapter as EditableElement
      }
      return null as unknown as EditableElement
    }

    // 通用函数：获取当前聚焦的输入框元素（如果有）
    const getFocusedTextInput = (): EditableElement | null => {
      const activeElement = document.activeElement
      
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement
      ) {
        return activeElement
      } 
      // 支持 contenteditable 元素
      else if (
        activeElement instanceof HTMLElement &&
        activeElement.getAttribute('contenteditable') === 'true'
      ) {
        return createEditableAdapter(activeElement)
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
    const openPromptSelector = async (inputElement?: EditableElement) => {
      if (isPromptSelectorOpen) return

      try {
        isPromptSelectorOpen = true
        console.log('准备打开提示词选择器...')

        // 保存当前活动元素
        const activeElement = document.activeElement as HTMLElement

        // 如果没有提供输入框，尝试获取当前聚焦的输入框
        const targetInput = inputElement || getFocusedTextInput()

        // 如果找不到任何输入框，给出提示并返回
        if (!targetInput) {
          alert('请先点击一个文本输入框或可编辑元素，然后再使用快捷键打开提示词选择器。')
          isPromptSelectorOpen = false
          return
        }

        // 从存储中获取所有提示词
        const allPrompts = (await storage.getItem<PromptItem[]>(`local:${BROWSER_STORAGE_KEY}`)) || []
        
        // 过滤只保留启用的提示词
        const prompts : PromptItemWithVariables[] = allPrompts.filter(prompt => prompt.enabled !== false)

        // 预处理提示词中的变量
        prompts.forEach(prompt => {
          // 从内容中提取变量
          prompt._variables = extractVariables(prompt.content)
        })

        if (prompts && prompts.length > 0) {
          console.log(`共找到 ${prompts.length} 个启用的提示词，显示选择器...`)

          // 显示提示词选择器弹窗
          const container = showPromptSelector(prompts, targetInput, () => {
            // 在选择器关闭时恢复焦点
            if (activeElement && typeof activeElement.focus === 'function') {
              setTimeout(() => {
                console.log('恢复焦点')
                activeElement.focus()
              }, 100)
            }
            isPromptSelectorOpen = false
          })

          // 设置主题
          if (container) {
            setThemeAttributes(container)
          }

        } else {
          console.log('没有找到已启用的提示词')
          alert('没有找到已启用的提示词。请先在扩展中添加并启用一些提示词。')
          isPromptSelectorOpen = false
        }
      } catch (error) {
        console.error('获取提示词时发生错误:', error)
        isPromptSelectorOpen = false
      }
    }

    // 用于记录可编辑元素的最后一次内容
    const contentEditableValuesMap = new WeakMap<HTMLElement, string>()

    // 监听输入框输入事件
    document.addEventListener('input', async (event) => {
      // 检查事件目标是否为标准输入元素（输入框或文本域）
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        const inputElement = event.target as HTMLInputElement | HTMLTextAreaElement
        const value = inputElement.value

        // 检查是否输入了"/p"并且弹窗尚未打开
        if (value?.toLowerCase()?.endsWith('/p') && lastInputValue !== value && !isPromptSelectorOpen) {
          lastInputValue = value

          // 使用通用函数打开提示词选择器
          await openPromptSelector(inputElement)
        } else if (!value?.toLowerCase()?.endsWith('/p')) {
          // 更新上次输入值
          lastInputValue = value
        }
      } 
      // 支持 contenteditable 元素的输入检测
      else if (
        event.target instanceof HTMLElement && 
        event.target.getAttribute('contenteditable') === 'true'
      ) {
        const editableElement = event.target as HTMLElement
        const adapter = createEditableAdapter(editableElement)
        const value = adapter.value

        // 获取上一次的值，如果没有则为空字符串
        const lastValue = contentEditableValuesMap.get(editableElement) || ''
        
        // 检查是否输入了"/p"并且弹窗尚未打开
        if (value?.toLowerCase()?.endsWith('/p') && lastValue !== value && !isPromptSelectorOpen) {
          contentEditableValuesMap.set(editableElement, value)
          
          // 使用通用函数打开提示词选择器
          await openPromptSelector(adapter)
        } else if (!value?.toLowerCase()?.endsWith('/p')) {
          // 更新上次输入值
          contentEditableValuesMap.set(editableElement, value)
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
