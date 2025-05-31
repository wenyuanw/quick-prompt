import { useState, useEffect } from 'react'
import type { Category } from '@/utils/types'

interface CategoryFormProps {
  onSubmit: (category: Category | Omit<Category, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  initialData: Category | null
  onCancel: () => void
  isEditing: boolean
}

const CategoryForm = ({ onSubmit, initialData, onCancel, isEditing }: CategoryFormProps) => {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [enabled, setEnabled] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 预设颜色选项
  const colorOptions = [
    { name: '蓝色', value: '#6366f1' },
    { name: '绿色', value: '#10b981' },
    { name: '黄色', value: '#f59e0b' },
    { name: '红色', value: '#ef4444' },
    { name: '紫色', value: '#8b5cf6' },
    { name: '粉色', value: '#ec4899' },
    { name: '青色', value: '#06b6d4' },
    { name: '橙色', value: '#f97316' },
  ]

  // Reset form when initialData changes
  useEffect(() => {
    if (initialData) {
      setName(initialData.name)
      setDescription(initialData.description || '')
      setColor(initialData.color || '#6366f1')
      setEnabled(initialData.enabled)
    } else {
      setName('')
      setDescription('')
      setColor('#6366f1')
      setEnabled(true)
    }
    setError(null)
  }, [initialData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate form inputs
    if (!name.trim()) {
      setError('分类名称不能为空')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const categoryData = {
        ...(initialData ? { id: initialData.id, createdAt: initialData.createdAt } : {}),
        name: name.trim(),
        description: description.trim(),
        color,
        enabled,
      }

      await onSubmit(categoryData as any)

      // Clear form if not in edit mode
      if (!isEditing) {
        setName('')
        setDescription('')
        setColor('#6366f1')
        setEnabled(true)
      }
    } catch (err) {
      console.error('提交分类表单出错:', err)
      setError('保存失败，请稍后再试')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div>
      {error && (
        <div className='bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 dark:border-red-400 text-red-700 dark:text-red-300 p-4 rounded-md mb-4 flex items-start'>
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
          <label htmlFor='name' className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
            分类名称
          </label>
          <input
            type='text'
            id='name'
            value={name}
            onChange={(e) => setName(e.target.value)}
            className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200'
            placeholder='例如：编程开发'
          />
        </div>

        <div>
          <label htmlFor='description' className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
            描述 <span className='text-gray-400 dark:text-gray-500 font-normal'>(可选)</span>
          </label>
          <textarea
            id='description'
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200'
            placeholder='简单描述这个分类的用途...'
          />
        </div>

        <div>
          <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
            分类颜色
          </label>
          <div className='flex flex-wrap gap-2'>
            {colorOptions.map((option) => (
              <div
                key={option.value}
                onClick={() => setColor(option.value)}
                className={`w-8 h-8 rounded-full cursor-pointer ring-1 ring-gray-300 dark:ring-gray-600 hover:ring-2 hover:ring-offset-1 hover:ring-gray-400 dark:hover:ring-gray-500 relative flex items-center justify-center transition-all duration-200`}
                style={{ backgroundColor: option.value }}
                title={option.name}
              >
                <div
                  className={`absolute -inset-0.5 rounded-full transition-all duration-200 ease-in-out ${
                    color === option.value
                      ? 'ring-2 ring-offset-1 ring-indigo-500 dark:ring-indigo-400 opacity-100'
                      : 'ring-0 ring-offset-0 ring-transparent opacity-0'
                  }`}
                ></div>

                <svg
                  className={`w-5 h-5 text-white pointer-events-none transition-all duration-200 ease-in-out transform ${
                    color === option.value
                      ? 'opacity-100 scale-100'
                      : 'opacity-0 scale-0'
                  }`}
                  fill='currentColor'
                  viewBox='0 0 20 20'
                >
                  <path
                    fillRule='evenodd'
                    d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                    clipRule='evenodd'
                  />
                </svg>
              </div>
            ))}
          </div>
        </div>

        <div className='flex items-center mt-4'>
          <label className='relative inline-flex items-center cursor-pointer'>
            <input 
              type='checkbox' 
              checked={enabled} 
              onChange={(e) => setEnabled(e.target.checked)}
              className='sr-only peer'
            />
            <div className='w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[""] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600'></div>
            <span className='ml-3 text-sm font-medium text-gray-700 dark:text-gray-300'>
              {enabled ? '已启用' : '已停用'} <span className='text-gray-400 dark:text-gray-500 font-normal'>(停用后该分类下的提示词不会显示)</span>
            </span>
          </label>
        </div>

        <div className='flex space-x-3 pt-2'>
          <button
            type='submit'
            disabled={isSubmitting}
            className='px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 font-medium flex-grow sm:flex-grow-0'
          >
            {isSubmitting ? '保存中...' : isEditing ? '更新分类' : '保存分类'}
          </button>

          <button
            type='button'
            onClick={onCancel}
            className='px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-500 focus:ring-offset-2 transition-colors duration-200'
          >
            取消
          </button>
        </div>
      </form>
    </div>
  )
}

export default CategoryForm
