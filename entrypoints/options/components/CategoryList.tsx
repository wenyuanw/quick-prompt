import React from 'react'
import type { Category } from '@/utils/types'
import { DEFAULT_CATEGORY_ID } from '@/utils/constants'
import { t } from '../../../utils/i18n'

interface CategoryListProps {
  categories: Category[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  searchTerm: string
  allCategoriesCount: number
  onToggleEnabled?: (id: string, enabled: boolean) => void
  promptCounts: Record<string, number>
}

const CategoryList = ({
  categories,
  onEdit,
  onDelete,
  searchTerm,
  allCategoriesCount,
  onToggleEnabled,
  promptCounts,
}: CategoryListProps) => {
  if (allCategoriesCount === 0) {
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
        <p className='mt-4 text-lg font-medium text-gray-700 dark:text-gray-300'>{t('noCategoriesAdded')}</p>
        <p className='mt-2 text-gray-500 dark:text-gray-400'>{t('clickAddCategory')}</p>
      </div>
    )
  }

  if (categories.length === 0 && searchTerm) {
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
        <p className='mt-4 text-lg font-medium text-gray-700 dark:text-gray-300'>{t('noMatchingCategories')}</p>
        <p className='mt-2 text-gray-500 dark:text-gray-400'>{t('tryOtherSearchTerms')}</p>
      </div>
    )
  }

  return (
    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
      {categories.map((category) => (
        <div
          key={category.id}
          className='bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 flex flex-col'
        >
          {/* Card Header */}
          <div className='px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-700'>
            <div className='flex items-center'>
              <div
                className='w-4 h-4 rounded-full mr-3 flex-shrink-0'
                style={{ backgroundColor: category.color || '#6366f1' }}
              />
              <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200 truncate flex-1'>
                {category.name}
              </h3>
              {category.id === DEFAULT_CATEGORY_ID && (
                <span className='ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300'>
                  {t('default')}
                </span>
              )}
            </div>
          </div>

          {/* Card Content */}
          <div className='p-5 flex-grow'>
            {/* Description */}
            <div className='mb-3'>
              {category.description ? (
                <p className='text-sm text-gray-600 dark:text-gray-300 line-clamp-2'>{category.description}</p>
              ) : (
                <span className='text-xs text-gray-400 dark:text-gray-500 italic'>{t('noDescription')}</span>
              )}
            </div>

            {/* Prompt Count */}
            <div className='mb-3'>
              <div className='flex items-center text-sm text-gray-500 dark:text-gray-400'>
                <svg
                  className='w-4 h-4 mr-1'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth='2'
                    d='M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10'
                  />
                </svg>
                {t('prompts', [`${promptCounts[category.id] || 0}`])}
              </div>
            </div>

            {/* 启用状态 */}
            {onToggleEnabled && (
              <div className='mt-2 flex items-center'>
                <label className='relative inline-flex items-center cursor-pointer'>
                  <input 
                    type='checkbox' 
                    checked={category.enabled} 
                    onChange={(e) => onToggleEnabled(category.id, e.target.checked)}
                    className='sr-only peer'
                  />
                  <div className='w-9 h-5 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[""] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600'></div>
                  <span className='ml-2 text-xs text-gray-600 dark:text-gray-300'>
                    {category.enabled ? t('enabled') : t('disabled')}
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Card Footer / Actions */}
          <div className='px-5 py-3 bg-gray-50 dark:bg-gray-700 border-t border-gray-100 dark:border-gray-600 flex justify-end space-x-2'>
            <button
              onClick={() => onEdit(category.id)}
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

            {/* 只有非默认分类才能删除 */}
            {category.id !== DEFAULT_CATEGORY_ID && (
              <button
                onClick={() => onDelete(category.id)}
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
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default CategoryList 