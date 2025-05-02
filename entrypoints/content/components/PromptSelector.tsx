import React, { useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import type { PromptItem } from '../index'

interface PromptSelectorProps {
  prompts: PromptItem[]
  targetElement: HTMLInputElement | HTMLTextAreaElement
  onClose: () => void
}

// 检测系统是否为暗黑模式的函数
const isDarkMode = () => {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
}

const PromptSelector: React.FC<PromptSelectorProps> = ({ prompts, targetElement, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isDark, setIsDark] = useState(isDarkMode())
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // 过滤提示列表
  const filteredPrompts = prompts.filter(
    (prompt) =>
      prompt.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prompt.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prompt.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  // 当组件挂载时聚焦搜索框
  useEffect(() => {
    setTimeout(() => {
      searchInputRef.current?.focus()
    }, 100)

    // 监听系统主题变化
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      setIsDark(e.matches)
      if (modalRef.current) {
        modalRef.current.setAttribute('data-theme', e.matches ? 'dark' : 'light')
      }
    }

    if (darkModeMediaQuery.addEventListener) {
      darkModeMediaQuery.addEventListener('change', handleChange)
      return () => darkModeMediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  // 设置初始主题
  useEffect(() => {
    if (modalRef.current) {
      modalRef.current.setAttribute('data-theme', isDark ? 'dark' : 'light')
    }
  }, [isDark])

  // 添加进入动画效果
  useEffect(() => {
    const modal = modalRef.current?.querySelector('.qp-modal') as HTMLElement
    if (modal) {
      // 先设置初始状态
      modal.style.opacity = '0'
      modal.style.transform = 'translateY(10px) scale(0.99)' // 更微妙的动画起点

      // 然后添加动画
      setTimeout(() => {
        modal.style.opacity = '1'
        modal.style.transform = 'translateY(0) scale(1)'
      }, 10)
    }
  }, [])

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 阻止事件冒泡，防止宿主页面接收到这些键盘事件
      e.stopPropagation()

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, filteredPrompts.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredPrompts[selectedIndex]) {
            applyPrompt(filteredPrompts[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown, true) // 使用捕获阶段
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [selectedIndex, filteredPrompts])

  // 确保选中项在视图中
  useEffect(() => {
    const selectedElement = document.getElementById(`prompt-item-${selectedIndex}`)
    if (selectedElement && listRef.current) {
      selectedElement.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // 应用选中的提示
  const applyPrompt = (prompt: PromptItem) => {
    const cursorPosition = targetElement.selectionStart || 0
    // 替换"/p"为选中的提示内容
    const textBeforeCursor = targetElement.value.substring(0, cursorPosition - 2) // 移除 "/p"
    const textAfterCursor = targetElement.value.substring(cursorPosition)
    targetElement.value = textBeforeCursor + prompt.content + textAfterCursor

    // 设置光标位置
    const newCursorPosition = textBeforeCursor.length + prompt.content.length
    targetElement.setSelectionRange(newCursorPosition, newCursorPosition)
    targetElement.focus()

    // 触发input事件，确保其他监听器知道值已更改
    const inputEvent = new Event('input', { bubbles: true })
    targetElement.dispatchEvent(inputEvent)

    // 关闭弹窗
    onClose()
  }

  // 点击背景关闭弹窗
  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      ref={modalRef}
      className='qp-fixed qp-inset-0 qp-flex qp-items-center qp-justify-center qp-z-50 qp-modal-container'
      onClick={handleBackgroundClick}
      data-theme={isDark ? 'dark' : 'light'}
    >
      <div className='qp-flex qp-flex-col qp-modal'>
        <div className='qp-modal-header'>
          <input
            ref={searchInputRef}
            type='text'
            className='qp-w-full qp-search-input'
            placeholder='输入关键词搜索提示...'
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setSelectedIndex(0)
            }}
          />
        </div>

        <div ref={listRef} className='qp-overflow-auto qp-modal-content qp-custom-scrollbar'>
          {filteredPrompts.length > 0 ? (
            <div className='qp-prompt-list-container'>
              {filteredPrompts.map((prompt, index) => (
                <div
                  id={`prompt-item-${index}`}
                  key={prompt.id}
                  className={`qp-cursor-pointer qp-prompt-item ${
                    index === selectedIndex ? 'qp-selected' : ''
                  }`}
                  onClick={() => applyPrompt(prompt)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className='qp-prompt-title'>{prompt.title}</div>
                  <div className='qp-prompt-preview'>{prompt.content}</div>
                  {prompt.tags.length > 0 && (
                    <div className='qp-tags-container'>
                      {prompt.tags.map((tag) => (
                        <span key={tag} className='qp-tag'>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className='qp-empty-state'>
              <svg
                className='qp-empty-icon'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
                xmlns='http://www.w3.org/2000/svg'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={1.5}
                  d='M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z'
                />
              </svg>
              <div className='qp-empty-text'>没有找到匹配的提示</div>
              <div className='qp-empty-subtext'>尝试使用其他关键词搜索</div>
            </div>
          )}
        </div>

        <div className='qp-modal-footer'>
          <span>共 {filteredPrompts.length} 个提示</span>
          <span>按 ↑↓ 导航 · Enter 选择 · Esc 关闭</span>
        </div>
      </div>
    </div>
  )
}

// 创建弹窗并挂载组件
export function showPromptSelector(
  prompts: PromptItem[],
  targetElement: HTMLInputElement | HTMLTextAreaElement
): HTMLElement {
  // 移除任何已存在的弹窗
  const existingContainer = document.getElementById('quick-prompt-selector')
  if (existingContainer) {
    document.body.removeChild(existingContainer)
  }

  // 创建新容器
  const container = document.createElement('div')
  container.id = 'quick-prompt-selector'

  // 确保添加到body的最后，这样它会覆盖其他所有元素
  document.body.appendChild(container)

  // 解决一些浏览器的样式隔离问题
  container.setAttribute(
    'style',
    `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2147483647;
    pointer-events: auto;
  `
  )

  // 渲染组件
  const root = createRoot(container)
  root.render(
    <PromptSelector
      prompts={prompts}
      targetElement={targetElement}
      onClose={() => {
        root.unmount()
        if (document.body.contains(container)) {
          document.body.removeChild(container)
        }
      }}
    />
  )

  // 返回容器元素以便进一步定制
  return container
}
