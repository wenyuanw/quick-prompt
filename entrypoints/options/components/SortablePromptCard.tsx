import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { PromptItem, Category } from '@/utils/types'
import { t } from '../../../utils/i18n'

interface SortablePromptCardProps {
  prompt: PromptItem
  category?: Category
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onToggleEnabled?: (id: string, enabled: boolean) => void
  onTogglePinned?: (id: string, pinned: boolean) => void
  onCopy: (content: string, id: string) => void
  copiedId: string | null
}

const SortablePromptCard: React.FC<SortablePromptCardProps> = ({
  prompt,
  category,
  onEdit,
  onDelete,
  onToggleEnabled,
  onTogglePinned,
  onCopy,
  copiedId,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: prompt.id,
    data: {
      type: 'prompt',
      prompt,
    },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  }

  // 格式化最后修改时间
  const formatLastModified = (lastModified?: string) => {
    if (!lastModified) return t('noModificationTime')
    
    try {
      const date = new Date(lastModified)
      if (isNaN(date.getTime())) {
        return t('invalidTime')
      }
      
      const now = new Date()
      const diffInMs = now.getTime() - date.getTime()
      
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 flex flex-col ${
        isDragging ? 'shadow-lg scale-105 ring-2 ring-blue-500 ring-opacity-50' : ''
      }`}
    >
      {/* Card Header */}
      <div className={`px-5 py-4 border-b border-gray-100 dark:border-gray-700 ${
        prompt.pinned 
          ? 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20' 
          : 'bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-700'
      }`}>
        <div className='flex items-center justify-between gap-3'>
          <div className='flex items-center flex-1 min-w-0'>
            {/* 置顶图标 */}
            {prompt.pinned && (
              <svg className='w-4 h-4 text-amber-600 dark:text-amber-400 mr-2 flex-shrink-0' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M5 15l7-7 7 7'/>
              </svg>
            )}
            <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200 truncate'>{prompt.title}</h3>
          </div>
          
          <div className='flex items-center gap-2 flex-shrink-0'>
            {/* 分类标识 */}
            {category && (
              <div className='flex items-center'>
                <div
                  className='w-3 h-3 rounded-full mr-1.5'
                  style={{ backgroundColor: category.color || '#6366f1' }}
                />
                <span className='text-xs text-gray-600 dark:text-gray-300 font-medium'>{category.name}</span>
              </div>
            )}
            
            {/* 拖拽手柄 */}
            <div
              {...attributes}
              {...listeners}
              className="w-7 h-7 cursor-grab active:cursor-grabbing flex items-center justify-center rounded-md bg-white dark:bg-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 border border-gray-300 dark:border-gray-600 hover:border-emerald-400 dark:hover:border-emerald-500 shadow-sm hover:shadow-md transition-all duration-200 group"
              title={t('dragToReorder') || '拖拽重新排序'}
            >
              {/* 上下箭头排序图标 - 直观表示排序功能 */}
              <svg className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/>
              </svg>
            </div>
          </div>
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
          onClick={() => onCopy(prompt.content, prompt.id)}
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
      <div className='px-5 py-3 bg-gray-50 dark:bg-gray-700 border-t border-gray-100 dark:border-gray-600 flex justify-end space-x-1.5'>
        {/* 置顶按钮 */}
        {onTogglePinned && (
          <button
            onClick={() => onTogglePinned(prompt.id, !prompt.pinned)}
            className={`p-1.5 text-sm rounded-md border transition-colors duration-200 cursor-pointer ${
              prompt.pinned
                ? 'bg-amber-100 dark:bg-amber-900/50 border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/70'
                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
            } focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-amber-500`}
            title={prompt.pinned ? t('unpinPrompt') : t('pinPrompt')}
          >
            {prompt.pinned ? (
              <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M19 9l-7 7-7-7'/>
              </svg>
            ) : (
              <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M5 15l7-7 7 7'/>
              </svg>
            )}
          </button>
        )}

        <button
          onClick={() => onCopy(prompt.content, prompt.id)}
          className={`p-1.5 text-sm rounded-md border transition-colors duration-200 cursor-pointer ${
            copiedId === prompt.id
              ? 'bg-green-100 dark:bg-green-900/50 border-green-300 dark:border-green-600 text-green-700 dark:text-green-400'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
          } focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500`}
          title={copiedId === prompt.id ? (t('copied') || '已复制') : (t('copy') || '复制')}
        >
          {copiedId === prompt.id ? (
            <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M5 13l4 4L19 7' />
            </svg>
          ) : (
            <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z' />
            </svg>
          )}
        </button>

        <button
          onClick={() => onEdit(prompt.id)}
          className='p-1.5 text-sm rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 transition-colors duration-200 cursor-pointer'
          title={t('edit')}
        >
          <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' />
          </svg>
        </button>

        <button
          onClick={() => onDelete(prompt.id)}
          className='p-1.5 text-sm rounded-md bg-white dark:bg-gray-800 border border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-500 transition-colors duration-200 cursor-pointer'
          title={t('delete')}
        >
          <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default SortablePromptCard
