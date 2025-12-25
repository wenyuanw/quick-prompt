import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { PromptItem } from '@/utils/types'
import {
  sortPrompts,
  filterPrompts,
  isValidPromptItem,
  normalizePromptItem,
  validateAndNormalizePrompts,
  mergePrompts,
  getValidCategoryId,
  generatePromptId,
  PromptValidationException,
  PROMPT_VALIDATION_ERRORS,
} from '@/utils/promptUtils'

// 测试数据工厂函数
const createPrompt = (overrides: Partial<PromptItem> = {}): PromptItem => ({
  id: 'test-id',
  title: 'Test Title',
  content: 'Test Content',
  tags: ['tag1', 'tag2'],
  enabled: true,
  categoryId: 'default',
  ...overrides,
})

describe('sortPrompts', () => {
  it('应该将置顶项目排在前面', () => {
    const prompts = [
      createPrompt({ id: '1', pinned: false, sortOrder: 0 }),
      createPrompt({ id: '2', pinned: true, sortOrder: 1 }),
      createPrompt({ id: '3', pinned: false, sortOrder: 2 }),
    ]

    const sorted = sortPrompts(prompts)

    expect(sorted[0].id).toBe('2') // 置顶的在最前面
    expect(sorted[1].id).toBe('1')
    expect(sorted[2].id).toBe('3')
  })

  it('应该按 sortOrder 升序排序非置顶项目', () => {
    const prompts = [
      createPrompt({ id: '1', sortOrder: 2 }),
      createPrompt({ id: '2', sortOrder: 0 }),
      createPrompt({ id: '3', sortOrder: 1 }),
    ]

    const sorted = sortPrompts(prompts)

    expect(sorted.map(p => p.id)).toEqual(['2', '3', '1'])
  })

  it('应该将没有 sortOrder 的项目排在最后', () => {
    const prompts = [
      createPrompt({ id: '1', sortOrder: undefined }),
      createPrompt({ id: '2', sortOrder: 0 }),
      createPrompt({ id: '3', sortOrder: 1 }),
    ]

    const sorted = sortPrompts(prompts)

    expect(sorted[2].id).toBe('1') // 没有 sortOrder 的在最后
  })

  it('不应该修改原数组', () => {
    const prompts = [
      createPrompt({ id: '1', sortOrder: 2 }),
      createPrompt({ id: '2', sortOrder: 0 }),
    ]
    const originalOrder = prompts.map(p => p.id)

    sortPrompts(prompts)

    expect(prompts.map(p => p.id)).toEqual(originalOrder)
  })

  it('应该处理空数组', () => {
    const sorted = sortPrompts([])
    expect(sorted).toEqual([])
  })
})

describe('filterPrompts', () => {
  const prompts = [
    createPrompt({ id: '1', title: 'React Tutorial', content: 'Learn React', tags: ['react', 'frontend'], categoryId: 'programming' }),
    createPrompt({ id: '2', title: 'Vue Guide', content: 'Learn Vue', tags: ['vue', 'frontend'], categoryId: 'programming' }),
    createPrompt({ id: '3', title: 'Cooking Recipe', content: 'Make pasta', tags: ['food'], categoryId: 'lifestyle' }),
  ]

  describe('按分类筛选', () => {
    it('应该返回指定分类的提示词', () => {
      const filtered = filterPrompts(prompts, { categoryId: 'programming' })

      expect(filtered).toHaveLength(2)
      expect(filtered.every(p => p.categoryId === 'programming')).toBe(true)
    })

    it('当 categoryId 为 null 时应该返回所有提示词', () => {
      const filtered = filterPrompts(prompts, { categoryId: null })

      expect(filtered).toHaveLength(3)
    })

    it('当 categoryId 为 undefined 时应该返回所有提示词', () => {
      const filtered = filterPrompts(prompts, {})

      expect(filtered).toHaveLength(3)
    })
  })

  describe('按搜索词筛选', () => {
    it('应该匹配标题', () => {
      const filtered = filterPrompts(prompts, { searchTerm: 'React' })

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('1')
    })

    it('应该匹配内容', () => {
      const filtered = filterPrompts(prompts, { searchTerm: 'pasta' })

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('3')
    })

    it('应该匹配标签', () => {
      const filtered = filterPrompts(prompts, { searchTerm: 'frontend' })

      expect(filtered).toHaveLength(2)
    })

    it('应该忽略大小写', () => {
      const filtered = filterPrompts(prompts, { searchTerm: 'REACT' })

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('1')
    })

    it('应该忽略搜索词前后的空格', () => {
      const filtered = filterPrompts(prompts, { searchTerm: '  React  ' })

      expect(filtered).toHaveLength(1)
    })

    it('当搜索词为空字符串时应该返回所有提示词', () => {
      const filtered = filterPrompts(prompts, { searchTerm: '' })

      expect(filtered).toHaveLength(3)
    })

    it('当搜索词只有空格时应该返回所有提示词', () => {
      const filtered = filterPrompts(prompts, { searchTerm: '   ' })

      expect(filtered).toHaveLength(3)
    })
  })

  describe('组合筛选', () => {
    it('应该同时按分类和搜索词筛选', () => {
      const filtered = filterPrompts(prompts, {
        categoryId: 'programming',
        searchTerm: 'React',
      })

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('1')
    })

    it('当没有匹配结果时应该返回空数组', () => {
      const filtered = filterPrompts(prompts, {
        categoryId: 'lifestyle',
        searchTerm: 'React',
      })

      expect(filtered).toHaveLength(0)
    })
  })
})

describe('isValidPromptItem', () => {
  it('应该验证有效的提示词对象', () => {
    const validPrompt = createPrompt()
    expect(isValidPromptItem(validPrompt)).toBe(true)
  })

  it('应该拒绝 null', () => {
    expect(isValidPromptItem(null)).toBe(false)
  })

  it('应该拒绝 undefined', () => {
    expect(isValidPromptItem(undefined)).toBe(false)
  })

  it('应该拒绝非对象类型', () => {
    expect(isValidPromptItem('string')).toBe(false)
    expect(isValidPromptItem(123)).toBe(false)
    expect(isValidPromptItem([])).toBe(false)
  })

  it('应该拒绝缺少 id 的对象', () => {
    const invalid = { title: 'Test', content: 'Test', tags: [] }
    expect(isValidPromptItem(invalid)).toBe(false)
  })

  it('应该拒绝缺少 title 的对象', () => {
    const invalid = { id: '1', content: 'Test', tags: [] }
    expect(isValidPromptItem(invalid)).toBe(false)
  })

  it('应该拒绝缺少 content 的对象', () => {
    const invalid = { id: '1', title: 'Test', tags: [] }
    expect(isValidPromptItem(invalid)).toBe(false)
  })

  it('应该拒绝 tags 不是数组的对象', () => {
    const invalid = { id: '1', title: 'Test', content: 'Test', tags: 'not-array' }
    expect(isValidPromptItem(invalid)).toBe(false)
  })

  it('应该接受只有必需字段的对象', () => {
    const minimal = { id: '1', title: 'Test', content: 'Test', tags: [] }
    expect(isValidPromptItem(minimal)).toBe(true)
  })
})

describe('normalizePromptItem', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'))
  })

  it('应该填充缺失的 categoryId 为默认值', () => {
    const prompt = createPrompt({ categoryId: '' })
    const normalized = normalizePromptItem(prompt)

    expect(normalized.categoryId).toBe('default')
  })

  it('应该保留已有的 categoryId', () => {
    const prompt = createPrompt({ categoryId: 'custom' })
    const normalized = normalizePromptItem(prompt)

    expect(normalized.categoryId).toBe('custom')
  })

  it('应该填充缺失的 enabled 为 true', () => {
    const prompt = createPrompt({ enabled: undefined as unknown as boolean })
    const normalized = normalizePromptItem(prompt)

    expect(normalized.enabled).toBe(true)
  })

  it('应该保留 enabled 为 false', () => {
    const prompt = createPrompt({ enabled: false })
    const normalized = normalizePromptItem(prompt)

    expect(normalized.enabled).toBe(false)
  })

  it('应该填充缺失的 lastModified', () => {
    const prompt = createPrompt({ lastModified: undefined })
    const normalized = normalizePromptItem(prompt)

    expect(normalized.lastModified).toBe('2024-01-01T00:00:00.000Z')
  })

  it('应该填充缺失的 notes 为空字符串', () => {
    const prompt = createPrompt({ notes: undefined })
    const normalized = normalizePromptItem(prompt)

    expect(normalized.notes).toBe('')
  })

  vi.useRealTimers()
})

describe('validateAndNormalizePrompts', () => {
  it('应该验证并规范化有效的提示词数组', () => {
    const data = [
      { id: '1', title: 'Test 1', content: 'Content 1', tags: ['tag1'] },
      { id: '2', title: 'Test 2', content: 'Content 2', tags: ['tag2'] },
    ]

    const result = validateAndNormalizePrompts(data)

    expect(result).toHaveLength(2)
    expect(result[0].categoryId).toBe('default')
    expect(result[0].enabled).toBe(true)
  })

  it('应该过滤掉无效的提示词', () => {
    const data = [
      { id: '1', title: 'Valid', content: 'Content', tags: [] },
      { invalid: 'object' },
      null,
      'string',
    ]

    const result = validateAndNormalizePrompts(data)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('当输入不是数组时应该抛出 PromptValidationException', () => {
    expect(() => validateAndNormalizePrompts('not-array')).toThrow(PromptValidationException)
    expect(() => validateAndNormalizePrompts({})).toThrow(PromptValidationException)
    expect(() => validateAndNormalizePrompts(null)).toThrow(PromptValidationException)

    try {
      validateAndNormalizePrompts('not-array')
    } catch (err) {
      expect(err).toBeInstanceOf(PromptValidationException)
      expect((err as PromptValidationException).code).toBe(PROMPT_VALIDATION_ERRORS.INVALID_FORMAT)
    }
  })

  it('当没有有效提示词时应该抛出 PromptValidationException', () => {
    const data = [{ invalid: 'object' }, null]

    try {
      validateAndNormalizePrompts(data)
    } catch (err) {
      expect(err).toBeInstanceOf(PromptValidationException)
      expect((err as PromptValidationException).code).toBe(PROMPT_VALIDATION_ERRORS.NO_VALID_PROMPTS)
    }
  })

  it('当数组为空时应该抛出 PromptValidationException', () => {
    expect(() => validateAndNormalizePrompts([])).toThrow(PromptValidationException)
  })
})

describe('mergePrompts', () => {
  it('应该添加新的提示词', () => {
    const existing = [createPrompt({ id: '1', title: 'Existing' })]
    const newPrompts = [createPrompt({ id: '2', title: 'New' })]

    const result = mergePrompts(existing, newPrompts)

    expect(result.merged).toHaveLength(2)
    expect(result.addedCount).toBe(1)
    expect(result.updatedCount).toBe(0)
  })

  it('应该更新已存在的提示词', () => {
    const existing = [createPrompt({ id: '1', title: 'Old Title' })]
    const newPrompts = [createPrompt({ id: '1', title: 'New Title' })]

    const result = mergePrompts(existing, newPrompts)

    expect(result.merged).toHaveLength(1)
    expect(result.merged[0].title).toBe('New Title')
    expect(result.addedCount).toBe(0)
    expect(result.updatedCount).toBe(1)
  })

  it('当内容相同时不应该计入更新数量（忽略 lastModified）', () => {
    const existing = [createPrompt({ id: '1', title: 'Same', lastModified: '2024-01-01' })]
    const newPrompts = [createPrompt({ id: '1', title: 'Same', lastModified: '2024-01-02' })]

    const result = mergePrompts(existing, newPrompts)

    expect(result.updatedCount).toBe(0)
  })

  it('应该同时处理新增和更新', () => {
    const existing = [
      createPrompt({ id: '1', title: 'Existing 1' }),
      createPrompt({ id: '2', title: 'Existing 2' }),
    ]
    const newPrompts = [
      createPrompt({ id: '2', title: 'Updated 2' }),
      createPrompt({ id: '3', title: 'New 3' }),
    ]

    const result = mergePrompts(existing, newPrompts)

    expect(result.merged).toHaveLength(3)
    expect(result.addedCount).toBe(1)
    expect(result.updatedCount).toBe(1)
  })

  it('应该处理空的现有列表', () => {
    const existing: PromptItem[] = []
    const newPrompts = [createPrompt({ id: '1' })]

    const result = mergePrompts(existing, newPrompts)

    expect(result.merged).toHaveLength(1)
    expect(result.addedCount).toBe(1)
  })

  it('应该处理空的新列表', () => {
    const existing = [createPrompt({ id: '1' })]
    const newPrompts: PromptItem[] = []

    const result = mergePrompts(existing, newPrompts)

    expect(result.merged).toHaveLength(1)
    expect(result.addedCount).toBe(0)
    expect(result.updatedCount).toBe(0)
  })
})

describe('getValidCategoryId', () => {
  const categories = [
    { id: 'cat1' },
    { id: 'cat2' },
    { id: 'cat3' },
  ]

  it('当首选 ID 存在于列表中时应该返回首选 ID', () => {
    const result = getValidCategoryId('cat2', categories)
    expect(result).toBe('cat2')
  })

  it('当首选 ID 不存在时应该返回第一个分类的 ID', () => {
    const result = getValidCategoryId('nonexistent', categories)
    expect(result).toBe('cat1')
  })

  it('当首选 ID 为 undefined 时应该返回第一个分类的 ID', () => {
    const result = getValidCategoryId(undefined, categories)
    expect(result).toBe('cat1')
  })

  it('当分类列表为空时应该返回空字符串', () => {
    const result = getValidCategoryId('any', [])
    expect(result).toBe('')
  })

  it('当首选 ID 为空字符串时应该返回第一个分类的 ID', () => {
    const result = getValidCategoryId('', categories)
    expect(result).toBe('cat1')
  })
})

describe('generatePromptId', () => {
  it('应该生成以 p 开头的 ID', () => {
    const id = generatePromptId('Title', 'Content')
    expect(id.startsWith('p')).toBe(true)
  })

  it('相同输入应该生成相同的 ID', () => {
    const id1 = generatePromptId('Title', 'Content', ['tag1', 'tag2'])
    const id2 = generatePromptId('Title', 'Content', ['tag1', 'tag2'])
    expect(id1).toBe(id2)
  })

  it('不同输入应该生成不同的 ID', () => {
    const id1 = generatePromptId('Title 1', 'Content')
    const id2 = generatePromptId('Title 2', 'Content')
    expect(id1).not.toBe(id2)
  })

  it('标签顺序不同但内容相同应该生成相同的 ID', () => {
    const id1 = generatePromptId('Title', 'Content', ['a', 'b', 'c'])
    const id2 = generatePromptId('Title', 'Content', ['c', 'a', 'b'])
    expect(id1).toBe(id2)
  })

  it('应该忽略标题和内容的前后空格', () => {
    const id1 = generatePromptId('Title', 'Content')
    const id2 = generatePromptId('  Title  ', '  Content  ')
    expect(id1).toBe(id2)
  })

  it('没有标签时应该正常工作', () => {
    const id = generatePromptId('Title', 'Content')
    expect(id).toBeTruthy()
    expect(id.startsWith('p')).toBe(true)
  })

  it('空标签数组应该正常工作', () => {
    const id = generatePromptId('Title', 'Content', [])
    expect(id).toBeTruthy()
  })
})
