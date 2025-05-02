import React, { ReactNode, useEffect } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  // 处理ESC键关闭弹窗
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // 当弹窗打开时，禁止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'auto'
    }
    return () => {
      document.body.style.overflow = 'auto'
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className='fixed inset-0 z-50 overflow-y-auto'>
      {/* 背景遮罩 - 添加动画效果 */}
      <div
        className='fixed inset-0 bg-black opacity-0 backdrop-blur-sm animate-fadeIn modal-backdrop'
        onClick={onClose}
        aria-hidden='true'
      />

      {/* 弹窗容器 */}
      <div className='flex min-h-screen items-center justify-center p-4'>
        <div
          className='relative w-full max-w-md rounded-xl bg-white shadow-2xl translate-y-4 opacity-0 animate-slideIn modal-content'
          onClick={(e) => e.stopPropagation()}
        >
          {/* 弹窗头部 */}
          <div className='flex items-center justify-between border-b border-gray-200 px-6 py-4'>
            <h3 className='text-xl font-semibold text-gray-800 flex items-center'>
              {title === '添加新 Prompt' ? (
                <svg
                  className='w-5 h-5 mr-2 text-blue-600'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth='2'
                    d='M12 6v6m0 0v6m0-6h6m-6 0H6'
                  />
                </svg>
              ) : (
                <svg
                  className='w-5 h-5 mr-2 text-blue-600'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth='2'
                    d='M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z'
                  />
                </svg>
              )}
              {title}
            </h3>
            <button
              onClick={onClose}
              className='text-gray-400 hover:text-gray-600 focus:outline-none transition-colors duration-200 dark:hover:text-gray-200'
              aria-label='关闭'
            >
              <svg className='h-6 w-6' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M6 18L18 6M6 6l12 12'
                />
              </svg>
            </button>
          </div>

          {/* 弹窗内容 */}
          <div className='px-6 py-4'>{children}</div>
        </div>
      </div>
    </div>
  )
}

export default Modal
