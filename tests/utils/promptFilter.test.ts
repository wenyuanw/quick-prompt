import { describe, it, expect } from 'vitest'
import type { PromptItem } from '@/utils/types'
import { filterAndSortPrompts } from '@/utils/promptFilter'

const createPrompt = (overrides: Partial<PromptItem> = {}): PromptItem => ({
  id: 'test-id',
  title: 'Test Title',
  content: 'Test Content',
  tags: ['tag1', 'tag2'],
  enabled: true,
  categoryId: 'default',
  ...overrides,
})

describe('filterAndSortPrompts', () => {
  describe('分类过滤', () => {
    const prompts = [
      createPrompt({ id: '1', categoryId: 'programming' }),
      createPrompt({ id: '2', categoryId: 'programming' }),
      createPrompt({ id: '3', categoryId: 'painting' }),
    ]

    it('指定分类时只返回该分类的提示词', () => {
      const result = filterAndSortPrompts(prompts, { categoryId: 'programming' })
      expect(result).toHaveLength(2)
      expect(result.every((p) => p.categoryId === 'programming')).toBe(true)
    })

    it('categoryId 为 null 时返回所有提示词', () => {
      const result = filterAndSortPrompts(prompts, { categoryId: null })
      expect(result).toHaveLength(3)
    })

    it('不传 options 时返回所有提示词', () => {
      const result = filterAndSortPrompts(prompts)
      expect(result).toHaveLength(3)
    })
  })

  describe('搜索过滤', () => {
    const prompts = [
      createPrompt({ id: '1', title: 'React 教程', content: '学习 React', tags: ['frontend'] }),
      createPrompt({ id: '2', title: 'Vue 指南', content: '学习 Vue', tags: ['frontend'] }),
      createPrompt({ id: '3', title: '做饭', content: '番茄炒蛋', tags: ['food'] }),
    ]

    it('匹配标题', () => {
      const result = filterAndSortPrompts(prompts, { searchTerm: 'React' })
      expect(result.map((p) => p.id)).toEqual(['1'])
    })

    it('匹配内容', () => {
      const result = filterAndSortPrompts(prompts, { searchTerm: '番茄' })
      expect(result.map((p) => p.id)).toEqual(['3'])
    })

    it('匹配标签', () => {
      const result = filterAndSortPrompts(prompts, { searchTerm: 'frontend' })
      expect(result).toHaveLength(2)
    })

    it('忽略大小写', () => {
      const result = filterAndSortPrompts(prompts, { searchTerm: 'react' })
      expect(result.map((p) => p.id)).toEqual(['1'])
    })

    it('忽略前后空格', () => {
      const result = filterAndSortPrompts(prompts, { searchTerm: '  vue  ' })
      expect(result.map((p) => p.id)).toEqual(['2'])
    })
  })

  describe('排序', () => {
    it('置顶项目排在前面', () => {
      const prompts = [
        createPrompt({ id: '1', pinned: false, lastModified: '2024-01-03' }),
        createPrompt({ id: '2', pinned: true, lastModified: '2024-01-01' }),
      ]
      const result = filterAndSortPrompts(prompts)
      expect(result[0].id).toBe('2')
    })

    it('同置顶状态下按 lastModified 降序', () => {
      const prompts = [
        createPrompt({ id: '1', lastModified: '2024-01-01' }),
        createPrompt({ id: '2', lastModified: '2024-01-03' }),
        createPrompt({ id: '3', lastModified: '2024-01-02' }),
      ]
      const result = filterAndSortPrompts(prompts)
      expect(result.map((p) => p.id)).toEqual(['2', '3', '1'])
    })

    it('缺少 lastModified 的项目视为最旧', () => {
      const prompts = [
        createPrompt({ id: '1', lastModified: undefined }),
        createPrompt({ id: '2', lastModified: '2024-01-01' }),
      ]
      const result = filterAndSortPrompts(prompts)
      expect(result.map((p) => p.id)).toEqual(['2', '1'])
    })

    it('不修改原数组', () => {
      const prompts = [
        createPrompt({ id: '1', lastModified: '2024-01-01' }),
        createPrompt({ id: '2', lastModified: '2024-01-03' }),
      ]
      const originalOrder = prompts.map((p) => p.id)
      filterAndSortPrompts(prompts)
      expect(prompts.map((p) => p.id)).toEqual(originalOrder)
    })
  })

  describe('组合过滤', () => {
    const prompts = [
      createPrompt({ id: '1', title: 'React', categoryId: 'programming', lastModified: '2024-01-01' }),
      createPrompt({ id: '2', title: 'Vue', categoryId: 'programming', lastModified: '2024-01-02' }),
      createPrompt({ id: '3', title: 'React Cooking', categoryId: 'food', lastModified: '2024-01-03' }),
    ]

    it('同时按分类和搜索词过滤', () => {
      const result = filterAndSortPrompts(prompts, {
        categoryId: 'programming',
        searchTerm: 'React',
      })
      expect(result.map((p) => p.id)).toEqual(['1'])
    })

    it('无匹配时返回空数组', () => {
      const result = filterAndSortPrompts(prompts, {
        categoryId: 'food',
        searchTerm: 'Vue',
      })
      expect(result).toHaveLength(0)
    })
  })
})
