import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { PromptItem, Category } from '@/utils/types'
import { getCategories } from '@/utils/categoryUtils'
import { DEFAULT_CATEGORY_ID } from '@/utils/constants'
import { t } from '../../../utils/i18n'

interface PromptFormProps {
  onSubmit: (prompt: PromptItem | Omit<PromptItem, 'id'>) => Promise<void>
  initialData: PromptItem | null
  onCancel: () => void
  isEditing: boolean
}

const PromptForm = ({ onSubmit, initialData, onCancel, isEditing }: PromptFormProps) => {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY_ID)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loadingCategories, setLoadingCategories] = useState(true)

  // 加载分类列表
  useEffect(() => {
    const loadCategories = async () => {
      try {
        setLoadingCategories(true)
        const categoriesList = await getCategories()
        setCategories(categoriesList.filter(cat => cat.enabled)) // 只显示启用的分类
      } catch (err) {
        console.error(t('loadCategoriesError'), err)
      } finally {
        setLoadingCategories(false)
      }
    }
    
    loadCategories()
  }, [])

  // Reset form when initialData changes (editing mode toggle)
  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title)
      setContent(initialData.content)
      setTags(initialData.tags.join(', '))
      setEnabled(initialData.enabled !== undefined ? initialData.enabled : true)
      setCategoryId(initialData.categoryId || DEFAULT_CATEGORY_ID)
    } else {
      // Clear form when not in edit mode
      setTitle('')
      setContent('')
      setTags('')
      setEnabled(true)
      setCategoryId(DEFAULT_CATEGORY_ID)
    }
    setError(null)
  }, [initialData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate form inputs
    if (!title.trim()) {
      setError(t('titleCannotBeEmpty'))
      return
    }

    if (!content.trim()) {
      setError(t('contentCannotBeEmpty'))
      return
    }

    if (!categoryId) {
      setError(t('pleaseSelectCategory'))
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      // Process tags: split by commas, trim whitespace, filter empty strings
      const tagList = tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag !== '')

      // Create prompt object
      const promptData = {
        ...(initialData ? { id: initialData.id } : {}),
        title: title.trim(),
        content: content.trim(),
        tags: tagList,
        enabled,
        categoryId,
      }

      await onSubmit(promptData as any) // Type assertion to handle both new and edited prompts

      // Clear form if not in edit mode (adding new prompt)
      if (!isEditing) {
        setTitle('')
        setContent('')
        setTags('')
        setCategoryId(DEFAULT_CATEGORY_ID)
      }
    } catch (err) {
      console.error(t('formSubmitError'), err)
      setError(t('saveFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div>
      {error && (
        <div className='bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-md mb-4 flex items-start'>
          <svg
            className='w-5 h-5 mr-2 mt-0.5 flex-shrink-0'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth='2'
              d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
            />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className='space-y-5'>
        <div>
          <label htmlFor='title' className='block text-sm font-medium text-gray-700 mb-1'>
            {t('titleLabel')}
          </label>
          <input
            type='text'
            id='title'
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className='w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200'
            placeholder={t('titlePlaceholder')}
          />
        </div>

        <div>
          <label htmlFor='content' className='block text-sm font-medium text-gray-700 mb-1'>
            {t('contentLabel')}
          </label>
          <textarea
            id='content'
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            className='w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200'
            placeholder={t('contentPlaceholder')}
          />
          <div className='mt-2 text-sm text-gray-600 bg-gray-50 p-3 rounded-md border border-gray-200'>
            <p>{t('variableFormatTip')}</p>
            <p className='mt-1 text-gray-500 text-xs'>{t('variableExample')}</p>
          </div>
        </div>

        <div>
          <label htmlFor='category' className='block text-sm font-medium text-gray-700 mb-1'>
            {t('categoryLabel')}
          </label>
          {loadingCategories ? (
            <div className='w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500'>
              {t('loadingCategories')}
            </div>
          ) : (
            <select
              id='category'
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className='w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200'
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          )}
          {categories.length === 0 && !loadingCategories && (
            <p className='mt-1 text-sm text-gray-500'>
              {t('noAvailableCategories')}
              <Link 
                to='/categories' 
                className='text-blue-600 hover:text-blue-800 ml-1'
              >
                {t('createCategory')}
              </Link>
            </p>
          )}
        </div>

        <div>
          <label htmlFor='tags' className='block text-sm font-medium text-gray-700 mb-1'>
            {t('tagsLabel')} <span className='text-gray-400 font-normal'>({t('tagsOptional')})</span>
          </label>
          <input
            type='text'
            id='tags'
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className='w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200'
            placeholder={t('tagsPlaceholder')}
          />
        </div>

        <div className='flex items-center mt-4'>
          <label className='relative inline-flex items-center cursor-pointer'>
            <input 
              type='checkbox' 
              checked={enabled} 
              onChange={(e) => setEnabled(e.target.checked)}
              className='sr-only peer'
            />
            <div className='relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[""] after:absolute after:top-1/2 after:right-1/2 after:-translate-y-1/2 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600'></div>
            <span className='ml-3 text-sm font-medium text-gray-700'>
              {enabled ? t('enabledStatus') : t('disabledStatus')} <span className='text-gray-400 font-normal'>({t('disabledStatusTip')})</span>
            </span>
          </label>
        </div>

        <div className='flex space-x-3 pt-2'>
          <button
            type='submit'
            disabled={isSubmitting}
            className='px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 font-medium flex-grow sm:flex-grow-0'
          >
            {isSubmitting ? t('savingPrompt') : isEditing ? t('updatePrompt') : t('savePromptButton')}
          </button>

          <button
            type='button'
            onClick={onCancel}
            className='px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-colors duration-200'
          >
            {t('cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}

export default PromptForm
