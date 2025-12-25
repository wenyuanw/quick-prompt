import React, { useState, useMemo } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import type { PromptItem, Category } from '@/utils/types'
import { t } from '../../../utils/i18n'
import SortablePromptCard from './SortablePromptCard'

interface PromptListProps {
  prompts: PromptItem[]
  categories: Category[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onReorder: (activeId: string, overId: string) => void
  searchTerm: string
  allPromptsCount: number
  onToggleEnabled?: (id: string, enabled: boolean) => void
  onTogglePinned?: (id: string, pinned: boolean) => void
  selectedCategoryId?: string | null
}

const PromptList = ({
  prompts,
  categories,
  onEdit,
  onDelete,
  onReorder,
  searchTerm,
  allPromptsCount,
  onToggleEnabled,
  onTogglePinned,
  selectedCategoryId,
}: PromptListProps) => {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  // 创建分类映射表
  const categoriesMap = useMemo(() => {
    const map: Record<string, Category> = {}
    categories.forEach(category => {
      map[category.id] = category
    })
    return map
  }, [categories])

  // 拖拽传感器配置
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // 拖拽开始处理
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  // 拖拽结束处理
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    
    if (active.id !== over?.id && over?.id) {
      onReorder(active.id as string, over.id as string)
    }
    
    setActiveId(null)
  }

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

  // 获取当前被拖拽的提示词
  const activePrompt = activeId ? filteredPrompts.find(prompt => prompt.id === activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext 
        items={filteredPrompts.map(p => p.id)} 
        strategy={rectSortingStrategy}
      >
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          {filteredPrompts.map((prompt) => {
            const category = categoriesMap[prompt.categoryId]
            
            return (
              <SortablePromptCard
                key={prompt.id}
                prompt={prompt}
                category={category}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleEnabled={onToggleEnabled}
                onTogglePinned={onTogglePinned}
                onCopy={handleCopy}
                copiedId={copiedId}
              />
            )
          })}
        </div>
      </SortableContext>

      {/* 拖拽覆盖层 */}
      <DragOverlay>
        {activePrompt ? (
          <div className="transform rotate-3 scale-105">
            <SortablePromptCard
              prompt={activePrompt}
              category={categoriesMap[activePrompt.categoryId]}
              onEdit={() => {}}
              onDelete={() => {}}
              onToggleEnabled={() => {}}
              onTogglePinned={() => {}}
              onCopy={() => {}}
              copiedId={null}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

export default PromptList
