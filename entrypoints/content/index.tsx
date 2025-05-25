import { storage } from '#imports'
import { showPromptSelector } from './components/PromptSelector'
import { extractVariables } from './utils/variableParser'
import OptimizeButton from './components/OptimizeButton' 
import { createRoot, Root } from 'react-dom/client' 

export interface PromptItem {
  id: string
  title: string
  content: string
  tags: string[]
  enabled: boolean
  _variables?: string[]
}

export interface EditableElement {
  value: string
  selectionStart?: number | null
  selectionEnd?: number | null
  focus(): void
  setSelectionRange?(start: number, end: number): void
  dispatchEvent(event: Event): boolean
  // Optional: to directly access the underlying HTML element if it's an adapter
  _element?: HTMLElement 
}

const isDarkMode = () => {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
}

let optimizeButtonRoot: Root | null = null
let optimizeButtonContainer: HTMLDivElement | null = null
let focusedEditableElement: EditableElement | null = null
let hideButtonTimeout: NodeJS.Timeout | null = null

export default defineContentScript({
  matches: ['*://*/*'],

  async main(ctx) {
    console.log('内容脚本 (WXT): 已加载 - OptimizeButton Feature Branch')

    let lastInputValue = ''
    let isPromptSelectorOpen = false

    const setThemeAttributes = (container: HTMLElement) => {
      container.setAttribute('data-theme', isDarkMode() ? 'dark' : 'light')
      const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleThemeChange = (e: MediaQueryListEvent) => {
        container.setAttribute('data-theme', e.matches ? 'dark' : 'light')
      }
      if (darkModeMediaQuery.addEventListener) {
        darkModeMediaQuery.addEventListener('change', handleThemeChange)
      }
    }

    const getContentEditableValue = (element: HTMLElement): string => {
      return element.textContent || ''
    }

    const setContentEditableValue = (element: HTMLElement, value: string): void => {
      element.textContent = value
      const inputEvent = new InputEvent('input', { bubbles: true })
      element.dispatchEvent(inputEvent)
    }

    const createEditableAdapter = (element: HTMLElement | HTMLInputElement | HTMLTextAreaElement): EditableElement => {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element
      } 
      else if (element.getAttribute('contenteditable') === 'true') {
        const adapter: EditableElement = {
          _element: element, 
          get value(): string {
            return getContentEditableValue(element)
          },
          set value(newValue: string) {
            setContentEditableValue(element, newValue)
          },
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
                let textNode = element.firstChild
                if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
                   // Ensure there's a text node to set range, create if necessary.
                   // This might need more robust handling for complex contenteditables.
                  const newTextNode = document.createTextNode('');
                  if (textNode) {
                    element.insertBefore(newTextNode, textNode);
                  } else {
                    element.appendChild(newTextNode);
                  }
                  textNode = newTextNode;
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
        return adapter
      }
      return null as unknown as EditableElement 
    }

    const getFocusedTextInput = (): EditableElement | null => {
      const activeElement = document.activeElement
      if (activeElement && activeElement.closest('.optimize-button-container')) {
        return focusedEditableElement 
      }
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
        return activeElement
      } 
      else if (activeElement instanceof HTMLElement && activeElement.getAttribute('contenteditable') === 'true') {
        return createEditableAdapter(activeElement)
      }
      return null
    }
    
    const removeOptimizeButton = () => {
      if (hideButtonTimeout) {
        clearTimeout(hideButtonTimeout)
        hideButtonTimeout = null
      }
      if (optimizeButtonRoot) {
        optimizeButtonRoot.unmount()
        optimizeButtonRoot = null
      }
      if (optimizeButtonContainer) {
        optimizeButtonContainer.remove()
        optimizeButtonContainer = null
      }
      // focusedEditableElement is not nulled here to allow focusout logic to check it
    }

    const showOptimizeButton = (targetElement: EditableElement) => {
      if (!targetElement) return

      if (focusedEditableElement === targetElement && optimizeButtonContainer) {
        if (hideButtonTimeout) clearTimeout(hideButtonTimeout); 
        return;
      }
      
      removeOptimizeButton() 

      focusedEditableElement = targetElement

      const hostElement = targetElement._element || targetElement
      if (!(hostElement instanceof HTMLElement)) {
        focusedEditableElement = null 
        return
      }
      const rect = hostElement.getBoundingClientRect()
      
      const top = rect.top + window.scrollY
      const left = rect.right + window.scrollX + 5 

      // This container is the shadow host
      optimizeButtonContainer = document.createElement('div')
      optimizeButtonContainer.className = 'optimize-button-container' 
      optimizeButtonContainer.style.position = 'absolute' 
      optimizeButtonContainer.style.top = `${top}px` // Position the shadow host
      optimizeButtonContainer.style.left = `${left}px` // Position the shadow host
      optimizeButtonContainer.style.zIndex = '2147483646' 
      
      document.body.appendChild(optimizeButtonContainer)

      // Create Shadow DOM
      const shadowRoot = optimizeButtonContainer.attachShadow({ mode: 'open' });
      const reactRootDiv = document.createElement('div');
      shadowRoot.appendChild(reactRootDiv);

      // Render the button inside the shadow DOM
      optimizeButtonRoot = createRoot(reactRootDiv)

      const handleClick = () => {
        console.log('Optimize button clicked for element:', targetElement)
        if (targetElement.value) {
          const currentVal = targetElement.value
          targetElement.value = "[Optimized] " + currentVal
        }
        const lastFocused = focusedEditableElement;
        removeOptimizeButton()
        focusedEditableElement = lastFocused; 
        
        if(hostElement && typeof hostElement.focus === 'function') {
          setTimeout(() => hostElement.focus(), 0);
        }
      }

      optimizeButtonRoot.render(
        // OptimizeButton no longer takes top/left for styling, as it's block display in shadow DOM
        React.createElement(OptimizeButton, { 
          onClick: handleClick,
        }),
      )
    }

    const openOptionsWithText = async (text: string) => {
      try {
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

    const openPromptSelector = async (inputElement?: EditableElement) => {
      if (isPromptSelectorOpen) return
      try {
        isPromptSelectorOpen = true
        const activeElement = document.activeElement as HTMLElement
        const targetInput = inputElement || getFocusedTextInput()
        if (!targetInput) {
          alert('请先点击一个文本输入框或可编辑元素，然后再使用快捷键打开提示词选择器。')
          isPromptSelectorOpen = false
          return
        }
        const allPrompts = (await storage.getItem<PromptItem[]>('local:userPrompts')) || []
        const prompts = allPrompts.filter(prompt => prompt.enabled !== false)
        prompts.forEach(prompt => {
          prompt._variables = extractVariables(prompt.content)
        })
        if (prompts && prompts.length > 0) {
          const container = showPromptSelector(prompts, targetInput, () => {
            if (activeElement && typeof activeElement.focus === 'function') {
              setTimeout(() => activeElement.focus(), 100)
            }
            isPromptSelectorOpen = false
          })
          if (container) setThemeAttributes(container)
        } else {
          alert('没有找到已启用的提示词。请先在扩展中添加并启用一些提示词。')
          isPromptSelectorOpen = false
        }
      } catch (error) {
        console.error('获取提示词时发生错误:', error)
        isPromptSelectorOpen = false
      }
    }

    const contentEditableValuesMap = new WeakMap<HTMLElement, string>()

    document.addEventListener('input', async (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        const inputElement = event.target
        const value = inputElement.value
        if (value?.toLowerCase()?.endsWith('/p') && lastInputValue !== value && !isPromptSelectorOpen) {
          lastInputValue = value
          await openPromptSelector(inputElement)
        } else if (!value?.toLowerCase()?.endsWith('/p')) {
          lastInputValue = value
        }
      } 
      else if (event.target instanceof HTMLElement && event.target.getAttribute('contenteditable') === 'true') {
        const editableElement = event.target
        const adapter = createEditableAdapter(editableElement)
        const value = adapter.value
        const lastValue = contentEditableValuesMap.get(editableElement) || ''
        if (value?.toLowerCase()?.endsWith('/p') && lastValue !== value && !isPromptSelectorOpen) {
          contentEditableValuesMap.set(editableElement, value)
          await openPromptSelector(adapter)
        } else if (!value?.toLowerCase()?.endsWith('/p')) {
          contentEditableValuesMap.set(editableElement, value)
        }
      }
    })

    browser.runtime.onMessage.addListener(async (message) => {
      if (message.action === 'openPromptSelector') {
        await openPromptSelector()
        return { success: true }
      }
      if (message.action === 'getSelectedText') {
        try {
          const selectedText = window.getSelection()?.toString() || ''
          if (selectedText) {
            const opened = await openOptionsWithText(selectedText)
            return { success: true, text: selectedText, openedOptionsPage: opened }
          } else {
            return { success: true, text: '' }
          }
        } catch (error) {
          console.error('内容脚本: 获取选中文本时出错:', error)
          return { success: false, error: '获取选中文本失败' }
        }
      }
      return false
    })

    document.addEventListener('focusin', (event) => {
      if (hideButtonTimeout) {
        clearTimeout(hideButtonTimeout)
        hideButtonTimeout = null
      }
      const target = event.target
      if (target instanceof HTMLElement && target.closest('.optimize-button-container')) {
        return
      }
      const currentFocusedElement = getFocusedTextInput()
      if (currentFocusedElement) {
        if (currentFocusedElement !== focusedEditableElement || !optimizeButtonContainer) {
            showOptimizeButton(currentFocusedElement)
        }
      } else {
        if (focusedEditableElement && (!document.activeElement || !document.activeElement.closest('.optimize-button-container'))) {
            removeOptimizeButton()
            focusedEditableElement = null; 
        }
      }
    })

    document.addEventListener('focusout', (event) => {
      hideButtonTimeout = setTimeout(() => {
        const relatedTarget = event.relatedTarget as HTMLElement | null
        if (relatedTarget && relatedTarget.closest('.optimize-button-container')) {
          return
        }
        const newFocusedContext = getFocusedTextInput();
        if (newFocusedContext === null) {
          removeOptimizeButton();
          focusedEditableElement = null; 
        } else if (newFocusedContext !== focusedEditableElement) {
           // If focus moved to a *different* editable element.
           // The focusin on the new element should handle showing the button there.
           // So, remove the button if it's still tied to the old element.
          if (event.target === (focusedEditableElement?._element || focusedEditableElement)) {
             removeOptimizeButton();
             // focusedEditableElement will be updated by the new element's focusin.
          }
        }
        // If newFocusedContext === focusedEditableElement, implies focus is still related to the input
        // (e.g. user clicked the button), so don't remove in that case.
      }, 150) 
    })
  },
})
