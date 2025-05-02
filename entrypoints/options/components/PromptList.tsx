import React from 'react'
import type { PromptItem } from '../App'

interface PromptListProps {
  prompts: PromptItem[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  searchTerm: string
  allPromptsCount: number
}

const PromptList = ({
  prompts,
  onEdit,
  onDelete,
  searchTerm,
  allPromptsCount,
}: PromptListProps) => {
  if (allPromptsCount === 0) {
    return (
      <div className='text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300'>
        <svg
          className='mx-auto h-12 w-12 text-gray-400'
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
        <p className='mt-4 text-lg font-medium text-gray-700'>还没有添加任何 Prompt</p>
        <p className='mt-2 text-gray-500'>点击"添加新 Prompt"按钮来创建您的第一个 Prompt。</p>
      </div>
    )
  }

  if (prompts.length === 0 && searchTerm) {
    return (
      <div className='text-center py-12 bg-gray-50 rounded-lg'>
        <svg
          className='mx-auto h-12 w-12 text-gray-400'
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
        <p className='mt-4 text-lg font-medium text-gray-700'>没有找到匹配的 Prompt</p>
        <p className='mt-2 text-gray-500'>请尝试其他搜索词。</p>
      </div>
    )
  }

  return (
    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
      {prompts.map((prompt) => (
        <div
          key={prompt.id}
          className='bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 flex flex-col'
        >
          {/* Card Header */}
          <div className='px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white'>
            <h3 className='text-lg font-semibold text-gray-800 truncate'>{prompt.title}</h3>
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
                      className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800'
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : (
                <span className='text-xs text-gray-400 italic'>(无标签)</span>
              )}
            </div>

            {/* Content preview */}
            <p className='text-sm text-gray-600 mb-4 truncate' title={prompt.content}>
              {prompt.content}
            </p>
          </div>

          {/* Card Footer / Actions */}
          <div className='px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end space-x-2'>
            <button
              onClick={() => onEdit(prompt.id)}
              className='px-3 py-1.5 text-sm rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 transition-colors duration-200'
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
                编辑
              </span>
            </button>

            <button
              onClick={() => onDelete(prompt.id)}
              className='px-3 py-1.5 text-sm rounded-md bg-white border border-red-300 text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-500 transition-colors duration-200'
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
                删除
              </span>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export default PromptList
