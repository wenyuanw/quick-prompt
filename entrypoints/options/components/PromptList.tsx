import React, { useState, useEffect } from 'react'
import type { PromptItem, Category } from '@/utils/types'
import { getCategories } from '@/utils/categoryUtils'
import { t } from '../../../utils/i18n'

interface PromptListProps {
  prompts: PromptItem[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  searchTerm: string
  allPromptsCount: number
  onToggleEnabled?: (id: string, enabled: boolean) => void
  onTogglePinned?: (id: string, pinned: boolean) => void
  selectedCategoryId?: string | null
}

const PromptList = ({
  prompts,
  onEdit,
  onDelete,
  searchTerm,
  allPromptsCount,
  onToggleEnabled,
  onTogglePinned,
  selectedCategoryId,
}: PromptListProps) => {
  const [categories, setCategories] = useState<Category[]>([])
  const [categoriesMap, setCategoriesMap] = useState<Record<string, Category>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // 加载分类信息
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const categoriesList = await getCategories()
        setCategories(categoriesList)
        
        // 创建分类映射表
        const map: Record<string, Category> = {}
        categoriesList.forEach(category => {
          map[category.id] = category
        })
        setCategoriesMap(map)
      } catch (err) {
        console.error('加载分类失败:', err)
      }
    }
    
    loadCategories()
  }, [])

  // 复制提示词内容的函数
  const handleCopy = async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
      // 2秒后清除复制状态
      setTimeout(() => {
        setCopiedId(null)
      }, 2000)
    } catch (err) {
      console.error('复制失败:', err)
      // 可以在这里添加错误提示
    }
  }

  // 格式化最后修改时间
  const formatLastModified = (lastModified?: string) => {
    if (!lastModified) return t('noModificationTime')
    
    try {
      const date = new Date(lastModified)
      // 检查日期是否有效
      if (isNaN(date.getTime())) {
        return t('invalidTime')
      }
      
      const now = new Date()
      const diffInMs = now.getTime() - date.getTime()
      
      // 如果时间差为负数（未来时间），显示具体日期
      if (diffInMs < 0) {
        return date.toLocaleDateString()
      }
      
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))
      
      if (diffInDays === 0) {
        const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60))
        if (diffInHours === 0) {
          const diffInMinutes = Math.floor(diffInMs / (1000 * 60))
          return diffInMinutes <= 1 ? t('justNow') : t('minutesAgo', [diffInMinutes.toString()])
        }
        return diffInHours === 1 ? t('oneHourAgo') : t('hoursAgo', [diffInHours.toString()])
      } else if (diffInDays === 1) {
        return t('oneDayAgo')
      } else if (diffInDays < 7) {
        return t('daysAgo', [diffInDays.toString()])
      } else {
        return date.toLocaleDateString()
      }
    } catch (err) {
      console.error('格式化时间出错:', err, 'lastModified:', lastModified)
      return t('invalidTime')
    }
  }

  // 根据选中的分类筛选提示词
  const filteredPrompts = selectedCategoryId 
    ? prompts.filter(prompt => prompt.categoryId === selectedCategoryId)
    : prompts

  if (allPromptsCount === 0) {
    return (
      <div className='text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600'>
        <svg
          className='mx-auto h-12 w-12 text-gray-400 dark:text-gray-500'
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'
          aria-hidden='true'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={1.5}
            d='M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10'
          />
        </svg>
        <p className='mt-4 text-lg font-medium text-gray-700 dark:text-gray-300'>{t('noPromptsAdded')}</p>
        <p className='mt-2 text-gray-500 dark:text-gray-400'>{t('clickAddPrompt')}</p>
      </div>
    )
  }

  if (filteredPrompts.length === 0 && (searchTerm || selectedCategoryId)) {
    return (
      <div className='text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg'>
        <svg
          className='mx-auto h-12 w-12 text-gray-400 dark:text-gray-500'
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'
          aria-hidden='true'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={1.5}
            d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'
          />
        </svg>
        <p className='mt-4 text-lg font-medium text-gray-700 dark:text-gray-300'>{t('noMatchingPrompts')}</p>
        <p className='mt-2 text-gray-500 dark:text-gray-400'>{t('tryOtherTermsOrCategories')}</p>
      </div>
    )
  }

  return (
    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
      {filteredPrompts.map((prompt) => {
        const category = categoriesMap[prompt.categoryId]
        
        return (
          <div
            key={prompt.id}
            className='bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 flex flex-col'
          >
            {/* Card Header */}
            <div className={`px-5 py-4 border-b border-gray-100 dark:border-gray-700 ${
              prompt.pinned 
                ? 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20' 
                : 'bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-700'
            }`}>
              <div className='flex items-center justify-between'>
                <div className='flex items-center flex-1 min-w-0'>
                  {/* 置顶图标 */}
                  {prompt.pinned && (
                    <svg className='w-4 h-4 text-amber-600 dark:text-amber-400 mr-2 flex-shrink-0' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M5 15l7-7 7 7'/>
                    </svg>
                  )}
                  <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200 truncate'>{prompt.title}</h3>
                </div>
                {/* 分类标识 */}
                {category && (
                  <div className='ml-2 flex items-center'>
                    <div
                      className='w-3 h-3 rounded-full mr-1.5'
                      style={{ backgroundColor: category.color || '#6366f1' }}
                    />
                    <span className='text-xs text-gray-600 dark:text-gray-300 font-medium'>{category.name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Card Content */}
            <div className='p-5 flex-grow'>
              {/* Tags */}
              <div className='mb-3'>
                {prompt.tags && prompt.tags.length > 0 ? (
                  <div className='flex flex-wrap gap-1.5'>
                    {prompt.tags.map((tag) => (
                      <span
                        key={tag}
                        className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300'
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className='text-xs text-gray-400 dark:text-gray-500 italic'>{t('noTags')}</span>
                )}
              </div>

              {/* Content preview */}
              <p 
                className='text-sm text-gray-600 dark:text-gray-300 mb-4 truncate cursor-pointer hover:text-gray-800 dark:hover:text-gray-100 transition-colors duration-200' 
                title={`${prompt.content}\n\n${t('clickToCopy') || '点击复制内容'}`}
                onClick={() => handleCopy(prompt.content, prompt.id)}
              >
                {prompt.content}
              </p>

              {/* 备注 */}
              {prompt.notes && prompt.notes.trim() && (
                <div className='mb-3 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-md'>
                  <div className='flex items-start space-x-2'>
                    <svg className='w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' />
                    </svg>
                    <div className='flex-1'>
                      <h4 className='text-xs font-medium text-amber-800 dark:text-amber-300 mb-1'>{t('notes')}</h4>
                      <p className='text-xs text-amber-700 dark:text-amber-200 whitespace-pre-wrap'>{prompt.notes}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 最后修改时间 */}
              <div className='mb-3 flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400'>
                <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' />
                </svg>
                <span>{t('lastModified')}: {formatLastModified(prompt.lastModified)}</span>
              </div>

              {/* 启用状态 */}
              {onToggleEnabled && (
                <div className='mt-2 flex items-center'>
                  <label className='relative inline-flex items-center cursor-pointer'>
                    <input 
                      type='checkbox' 
                      checked={prompt.enabled !== undefined ? prompt.enabled : true} 
                      onChange={(e) => onToggleEnabled(prompt.id, e.target.checked)}
                      className='sr-only peer'
                    />
                    <div className='relative w-9 h-5 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[""] after:absolute after:top-1/2 after:right-1/2 after:-translate-y-1/2 after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600'></div>
                    <span className='ml-2 text-xs text-gray-600 dark:text-gray-300'>
                      {prompt.enabled !== undefined ? (prompt.enabled ? t('enabled') : t('disabled')) : t('enabled')}
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Card Footer / Actions */}
            <div className='px-5 py-3 bg-gray-50 dark:bg-gray-700 border-t border-gray-100 dark:border-gray-600 flex justify-end space-x-2'>
              {/* 置顶按钮 */}
              {onTogglePinned && (
                <button
                  onClick={() => onTogglePinned(prompt.id, !prompt.pinned)}
                  className={`px-3 py-1.5 text-sm rounded-md border transition-colors duration-200 ${
                    prompt.pinned
                      ? 'bg-amber-100 dark:bg-amber-900/50 border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/70'
                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                  } focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-amber-500`}
                  title={prompt.pinned ? t('unpinPrompt') || '取消置顶' : t('pinPrompt') || '置顶'}
                >
                  <span className='flex items-center'>
                    {prompt.pinned ? (
                      // 已置顶状态：显示向下箭头，表示可以取消置顶
                      <svg className='w-4 h-4 mr-1.5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M19 9l-7 7-7-7'/>
                      </svg>
                    ) : (
                      // 未置顶状态：显示向上箭头，表示可以置顶
                      <svg className='w-4 h-4 mr-1.5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M5 15l7-7 7 7'/>
                      </svg>
                    )}
                    {prompt.pinned ? (t('unpin') || '取消置顶') : (t('pin') || '置顶')}
                  </span>
                </button>
              )}
              
              <button
                onClick={() => handleCopy(prompt.content, prompt.id)}
                className={`px-3 py-1.5 text-sm rounded-md border transition-colors duration-200 ${
                  copiedId === prompt.id
                    ? 'bg-green-100 dark:bg-green-900/50 border-green-300 dark:border-green-600 text-green-700 dark:text-green-400'
                    : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                } focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500`}
              >
                <span className='flex items-center'>
                  {copiedId === prompt.id ? (
                    <>
                      <svg
                        className='w-4 h-4 mr-1.5'
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'
                      >
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth='2'
                          d='M5 13l4 4L19 7'
                        />
                      </svg>
                      {t('copied') || '已复制'}
                    </>
                  ) : (
                    <>
                      <svg
                        className='w-4 h-4 mr-1.5'
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'
                      >
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth='2'
                          d='M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z'
                        />
                      </svg>
                      {t('copy') || '复制'}
                    </>
                  )}
                </span>
              </button>

              <button
                onClick={() => onEdit(prompt.id)}
                className='px-3 py-1.5 text-sm rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 transition-colors duration-200'
              >
                <span className='flex items-center'>
                  <svg
                    className='w-4 h-4 mr-1.5'
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
                  {t('edit')}
                </span>
              </button>

              <button
                onClick={() => onDelete(prompt.id)}
                className='px-3 py-1.5 text-sm rounded-md bg-white dark:bg-gray-800 border border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-500 transition-colors duration-200'
              >
                <span className='flex items-center'>
                  <svg
                    className='w-4 h-4 mr-1.5'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth='2'
                      d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16'
                    />
                  </svg>
                  {t('delete')}
                </span>
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default PromptList
