import type { PromptItem } from './types'
import { DEFAULT_CATEGORY_ID } from './constants'

function hashString(str: string): number {
  let hash = 0;
  if (str.length === 0) return hash;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }
  return Math.abs(hash); // 确保是正数
}

/**
 * Generates a unique ID for a prompt based on its title, content, and tags.
 * Ensures the ID starts with 'p' to be a valid selector.
 * @param title The title of the prompt.
 * @param content The content of the prompt.
 * @param tags Optional array of tags.
 * @returns A unique string ID for the prompt.
 */
export function generatePromptId(title: string, content: string, tags?: string[]): string {
  let uniqueString = `${title.trim()}::${content.trim()}`;
  if (tags && tags.length > 0) {
    const sortedTags = [...tags].sort();
    uniqueString += `::${sortedTags.join(',')}`;
  }
  const hash = hashString(uniqueString);
  const hashStr = hash.toString(36);
  // 添加前缀p以确保ID始终以字母开头，避免潜在的CSS选择器问题或HTML ID问题
  return `p${hashStr}`;
}

/**
 * 排序提示词列表
 * 置顶项目优先，然后按 sortOrder 升序排序
 */
export const sortPrompts = (items: PromptItem[]): PromptItem[] => {
  return [...items].sort((a, b) => {
    // 置顶项目始终在前面
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1

    // 在同一置顶状态下，按照 sortOrder 排序
    const aOrder = a.sortOrder !== undefined ? a.sortOrder : 999999
    const bOrder = b.sortOrder !== undefined ? b.sortOrder : 999999
    return aOrder - bOrder
  })
}

/**
 * 根据搜索词和分类筛选提示词
 */
export const filterPrompts = (
  prompts: PromptItem[],
  options: {
    searchTerm?: string
    categoryId?: string | null
  }
): PromptItem[] => {
  const { searchTerm, categoryId } = options
  let filtered = prompts

  // 按分类筛选
  if (categoryId) {
    filtered = filtered.filter(prompt => prompt.categoryId === categoryId)
  }

  // 按搜索词筛选
  if (searchTerm?.trim()) {
    const term = searchTerm.toLowerCase().trim()
    filtered = filtered.filter((prompt) => {
      const titleMatch = prompt.title.toLowerCase().includes(term)
      const contentMatch = prompt.content.toLowerCase().includes(term)
      const tagMatch = prompt.tags.some((tag) =>
        tag.toLowerCase().includes(term)
      )
      return titleMatch || contentMatch || tagMatch
    })
  }

  return filtered
}

/**
 * 验证单个提示词数据结构是否有效
 */
export const isValidPromptItem = (prompt: unknown): prompt is PromptItem => {
  return (
    typeof prompt === 'object' &&
    prompt !== null &&
    typeof (prompt as PromptItem).id === 'string' &&
    typeof (prompt as PromptItem).title === 'string' &&
    typeof (prompt as PromptItem).content === 'string' &&
    Array.isArray((prompt as PromptItem).tags)
  )
}

/**
 * 规范化提示词数据，填充默认值
 */
export const normalizePromptItem = (prompt: PromptItem): PromptItem => {
  return {
    ...prompt,
    categoryId: prompt.categoryId || DEFAULT_CATEGORY_ID,
    enabled: prompt.enabled !== undefined ? prompt.enabled : true,
    lastModified: prompt.lastModified || new Date().toISOString(),
    notes: prompt.notes || '',
  }
}

// 错误类型常量，用于国际化
export const PROMPT_VALIDATION_ERRORS = {
  INVALID_FORMAT: 'INVALID_FORMAT',
  NO_VALID_PROMPTS: 'NO_VALID_PROMPTS',
} as const

export type PromptValidationError = typeof PROMPT_VALIDATION_ERRORS[keyof typeof PROMPT_VALIDATION_ERRORS]

export class PromptValidationException extends Error {
  constructor(public code: PromptValidationError) {
    super(code)
    this.name = 'PromptValidationException'
  }
}

/**
 * 验证并规范化导入的提示词数据
 * @throws PromptValidationException 如果数据格式无效或没有有效的提示词
 */
export const validateAndNormalizePrompts = (data: unknown): PromptItem[] => {
  if (!Array.isArray(data)) {
    throw new PromptValidationException(PROMPT_VALIDATION_ERRORS.INVALID_FORMAT)
  }

  const validPrompts = data
    .filter(isValidPromptItem)
    .map(normalizePromptItem)

  if (validPrompts.length === 0) {
    throw new PromptValidationException(PROMPT_VALIDATION_ERRORS.NO_VALID_PROMPTS)
  }

  return validPrompts
}

/**
 * 合并导入的提示词与现有提示词
 * 返回合并后的列表以及新增和更新的数量
 */
export const mergePrompts = (
  existingPrompts: PromptItem[],
  newPrompts: PromptItem[]
): { merged: PromptItem[]; addedCount: number; updatedCount: number } => {
  const promptsMap = new Map(existingPrompts.map(p => [p.id, p]))
  let addedCount = 0
  let updatedCount = 0

  newPrompts.forEach(prompt => {
    const existing = promptsMap.get(prompt.id)
    if (existing) {
      const updatedPrompt = { ...existing, ...prompt }
      // 排除 lastModified 字段进行比较
      const { lastModified: _a, ...existingRest } = existing
      const { lastModified: _b, ...updatedRest } = updatedPrompt
      if (JSON.stringify(existingRest) !== JSON.stringify(updatedRest)) {
        promptsMap.set(prompt.id, updatedPrompt)
        updatedCount++
      }
    } else {
      promptsMap.set(prompt.id, prompt)
      addedCount++
    }
  })

  return {
    merged: Array.from(promptsMap.values()),
    addedCount,
    updatedCount,
  }
}

/**
 * 根据分类 ID 获取有效的分类 ID
 * 如果指定的分类不存在于列表中，返回第一个可用分类的 ID
 */
export const getValidCategoryId = (
  preferredId: string | undefined,
  availableCategories: { id: string }[]
): string => {
  if (preferredId && availableCategories.some(cat => cat.id === preferredId)) {
    return preferredId
  }
  return availableCategories[0]?.id || ''
} 