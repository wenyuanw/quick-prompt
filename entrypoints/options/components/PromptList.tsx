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
    return null;
  }

  if (filteredPrompts.length === 0 && (searchTerm || selectedCategoryId)) {
    return null;
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
