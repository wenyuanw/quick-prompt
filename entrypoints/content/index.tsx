import { isDarkMode } from '@/utils/tools'
import { showPromptSelector } from './components/PromptSelector'
import { extractVariables } from '@/utils/variableParser'
import { migratePromptsWithCategory } from '@/utils/categoryUtils'
import { getAllPrompts } from '@/utils/promptStore'
import type { EditableElement, PromptItemWithVariables } from '@/utils/types'
import { t, initLocale } from '@/utils/i18n'
import {
  createEditableAdapter,
  findEditableElement,
  getActiveEditableElement,
  getSelectedText,
  insertContentIntoEditable,
} from './utils/editableTarget'
import {
  isOpenPromptSelectorShortcut,
  isSaveSelectedPromptShortcut,
} from './utils/keyboardShortcuts'
import {
  endsWithPromptTrigger,
  shouldOpenPromptSelector,
} from './utils/promptTrigger'

export default defineContentScript({
  matches: ['*://*/*'],

  async main(ctx) {
    await initLocale()
    console.log(t('contentScriptLoaded'))

    // 记录上次输入的状态
    let isPromptSelectorOpen = false

    // 记录最近一次聚焦的可编辑元素。
    // 侧边栏（side panel）获得焦点时，页面输入框会失焦，
    // 因此需要保留引用，以便从侧边栏插入提示词。
    let lastFocusedEditable: HTMLElement | null = null

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
    const getFocusedTextInput = (): EditableElement | null => {
      const activeElement = getActiveEditableElement()
      return activeElement ? createEditableAdapter(activeElement) : null
    }

    // 通用函数：打开提示词选择器
    const openPromptSelector = async (
      inputElement?: EditableElement,
      options: { removePromptTrigger?: boolean } = {}
    ) => {
      if (isPromptSelectorOpen) return

      try {
        isPromptSelectorOpen = true
        console.log('准备打开提示词选择器...')
        await initLocale()

        // 保存当前活动元素
        const activeElement = document.activeElement as HTMLElement

        // 如果没有提供输入框，尝试获取当前聚焦的输入框
        const targetInput = inputElement || getFocusedTextInput()

        // 如果找不到任何输入框，给出提示并返回
        if (!targetInput) {
          alert(t('clickInputBoxFirst'))
          isPromptSelectorOpen = false
          return
        }

        // 先执行数据迁移，确保分类信息正确
        await migratePromptsWithCategory()

        // 从存储中获取所有提示词
        const allPrompts = await getAllPrompts()
        
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
                console.log(t('restoreFocus'))
                activeElement.focus()
              }, 100)
            }
            isPromptSelectorOpen = false
          }, options)

          // 设置主题
          if (container) {
            setThemeAttributes(container)
          }

        } else {
          console.log(t('noEnabledPromptsFound'))
          alert(t('noEnabledPromptsAlert'))
          isPromptSelectorOpen = false
        }
      } catch (error) {
        console.error(t('errorGettingPrompts'), error)
        isPromptSelectorOpen = false
      }
    }

    // 跟踪最近聚焦的可编辑元素，供侧边栏插入时回退使用
    document.addEventListener(
      'focusin',
      (event) => {
        const editableElement = findEditableElement(event.target)
        if (editableElement) {
          lastFocusedEditable = editableElement
        }
      },
      true
    )

    // 用于记录可编辑元素的最后一次内容
    const editableValuesMap = new WeakMap<HTMLElement, string>()

    const tryOpenPromptSelectorForEditable = async (editableElement: HTMLElement) => {
      const adapter = createEditableAdapter(editableElement)
      const value = adapter.value
      const lastValue = editableValuesMap.get(editableElement) || ''

      if (shouldOpenPromptSelector(value, lastValue, isPromptSelectorOpen)) {
        editableValuesMap.set(editableElement, value)
        await openPromptSelector(adapter, { removePromptTrigger: true })
        return
      }

      if (!endsWithPromptTrigger(value)) {
        editableValuesMap.set(editableElement, value)
      }
    }

    // 监听输入框输入事件
    document.addEventListener('input', async (event) => {
      const editableElement = findEditableElement(event.target)
      if (!editableElement) {
        return
      }

      if (event instanceof InputEvent && event.isComposing) {
        return
      }

      await tryOpenPromptSelectorForEditable(editableElement)
    })

    // IME 提交后输入框可能已是 /p，但不会再触发 input 事件
    document.addEventListener('compositionend', async (event) => {
      const editableElement = findEditableElement(event.target)
      if (!editableElement) {
        return
      }

      await tryOpenPromptSelectorForEditable(editableElement)
    })

    // Chrome commands can be preempted by browser/OS shortcuts; keep a page-level fallback.
    document.addEventListener('keydown', async (event) => {
      if (isOpenPromptSelectorShortcut(event)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        await openPromptSelector()
        return
      }

      if (isSaveSelectedPromptShortcut(event)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        const selectedText = getSelectedText()

        if (selectedText) {
          await browser.runtime.sendMessage({
            action: 'openOptionsPageWithText',
            text: selectedText,
          })
        } else {
          console.log('内容脚本: 未选中任何文本')
        }
      }
    }, true)

    // 监听来自背景脚本的消息
    browser.runtime.onMessage.addListener(async (message) => {
      console.log('内容脚本: 收到消息', message)

      if (message.action === 'openPromptSelector') {
        // 使用通用函数打开提示词选择器
        await openPromptSelector()
        return { success: true }
      }

      if (message.action === 'insertPrompt') {
        // 来自侧边栏的插入请求：把（已填充变量的）内容插入当前/最近聚焦的输入框
        try {
          const content: string = message.content ?? ''

          // 优先使用当前聚焦元素，否则回退到最近聚焦的可编辑元素
          let target = getFocusedTextInput()
          if (!target && lastFocusedEditable && lastFocusedEditable.isConnected) {
            target = createEditableAdapter(lastFocusedEditable)
          }

          if (!target) {
            return { success: false, error: 'noFocusedInput' }
          }

          insertContentIntoEditable(target, content, { removePromptTrigger: false })
          return { success: true }
        } catch (error) {
          console.error('内容脚本: 插入提示词失败', error)
          return { success: false, error: 'insertFailed' }
        }
      }

      if (message.action === 'getSelectedText') {
        try {
          // 获取当前选中的文本
          const selectedText = getSelectedText()
          console.log('内容脚本: 获取到选中文本:', selectedText)
          
          if (selectedText) {
            return { success: true, text: selectedText }
          } else {
            console.log('内容脚本: 未选中任何文本')
            return { success: true, text: '' }
          }
        } catch (error) {
          console.error(t('errorGettingSelectedText'), error)
          return { success: false, error: t('getSelectedTextFailed') }
        }
      }

      return false
    })
  },
})
