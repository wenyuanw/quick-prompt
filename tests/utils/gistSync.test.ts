import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PromptItem, Category } from '@/utils/types'
import {
  GistExportData,
  serializeToGistContent,
  deserializeFromGistContent,
  parseGistUrl,
  GistPlatform,
  GIST_SYNC_ERRORS,
  GistSyncException,
} from '@/utils/sync/gistSync'

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

const createCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 'cat-1',
  name: 'Test Category',
  enabled: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
})

describe('serializeToGistContent', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('应该正确序列化 prompts 和 categories', () => {
    const prompts = [createPrompt({ id: '1' }), createPrompt({ id: '2' })]
    const categories = [createCategory({ id: 'cat-1' })]

    const result = serializeToGistContent(prompts, categories)
    const parsed = JSON.parse(result)

    expect(parsed.version).toBe('1.0')
    expect(parsed.exportedAt).toBe('2024-01-15T12:00:00.000Z')
    expect(parsed.prompts).toHaveLength(2)
    expect(parsed.categories).toHaveLength(1)
  })

  it('应该处理空数组', () => {
    const result = serializeToGistContent([], [])
    const parsed = JSON.parse(result)

    expect(parsed.prompts).toEqual([])
    expect(parsed.categories).toEqual([])
  })

  it('应该生成有效的 JSON 字符串', () => {
    const prompts = [createPrompt()]
    const categories = [createCategory()]

    const result = serializeToGistContent(prompts, categories)

    expect(() => JSON.parse(result)).not.toThrow()
  })
})

describe('deserializeFromGistContent', () => {
  it('应该正确反序列化有效的 JSON 内容', () => {
    const data: GistExportData = {
      version: '1.0',
      exportedAt: '2024-01-15T12:00:00.000Z',
      prompts: [createPrompt({ id: '1' })],
      categories: [createCategory({ id: 'cat-1' })],
    }
    const content = JSON.stringify(data)

    const result = deserializeFromGistContent(content)

    expect(result.version).toBe('1.0')
    expect(result.prompts).toHaveLength(1)
    expect(result.categories).toHaveLength(1)
  })

  it('应该在 JSON 无效时抛出 GistSyncException', () => {
    const invalidJson = 'not valid json {'

    expect(() => deserializeFromGistContent(invalidJson)).toThrow(GistSyncException)

    try {
      deserializeFromGistContent(invalidJson)
    } catch (err) {
      expect(err).toBeInstanceOf(GistSyncException)
      expect((err as GistSyncException).code).toBe(GIST_SYNC_ERRORS.INVALID_FORMAT)
    }
  })

  it('应该在缺少 prompts 字段时抛出 GistSyncException', () => {
    const data = {
      version: '1.0',
      exportedAt: '2024-01-15T12:00:00.000Z',
      categories: [],
    }
    const content = JSON.stringify(data)

    expect(() => deserializeFromGistContent(content)).toThrow(GistSyncException)

    try {
      deserializeFromGistContent(content)
    } catch (err) {
      expect((err as GistSyncException).code).toBe(GIST_SYNC_ERRORS.MISSING_DATA)
    }
  })

  it('应该在 prompts 不是数组时抛出 GistSyncException', () => {
    const data = {
      version: '1.0',
      exportedAt: '2024-01-15T12:00:00.000Z',
      prompts: 'not an array',
      categories: [],
    }
    const content = JSON.stringify(data)

    expect(() => deserializeFromGistContent(content)).toThrow(GistSyncException)
  })

  it('应该处理缺少 categories 字段的情况（默认为空数组）', () => {
    const data = {
      version: '1.0',
      exportedAt: '2024-01-15T12:00:00.000Z',
      prompts: [createPrompt()],
    }
    const content = JSON.stringify(data)

    const result = deserializeFromGistContent(content)

    expect(result.categories).toEqual([])
  })
})

describe('parseGistUrl', () => {
  describe('GitHub Gist URLs', () => {
    it('应该解析标准 GitHub Gist URL', () => {
      const url = 'https://gist.github.com/username/abc123def456'
      const result = parseGistUrl(url)

      expect(result).not.toBeNull()
      expect(result?.platform).toBe('github')
      expect(result?.gistId).toBe('abc123def456')
    })

    it('应该解析带有文件名的 GitHub Gist URL', () => {
      const url = 'https://gist.github.com/username/abc123def456#file-prompts-json'
      const result = parseGistUrl(url)

      expect(result).not.toBeNull()
      expect(result?.platform).toBe('github')
      expect(result?.gistId).toBe('abc123def456')
    })

    it('应该解析没有用户名的 GitHub Gist URL', () => {
      const url = 'https://gist.github.com/abc123def456'
      const result = parseGistUrl(url)

      expect(result).not.toBeNull()
      expect(result?.platform).toBe('github')
      expect(result?.gistId).toBe('abc123def456')
    })

    it('应该解析 raw GitHub Gist URL', () => {
      const url = 'https://gist.githubusercontent.com/username/abc123def456/raw/prompts.json'
      const result = parseGistUrl(url)

      expect(result).not.toBeNull()
      expect(result?.platform).toBe('github')
      expect(result?.gistId).toBe('abc123def456')
    })
  })

  describe('Gitee Gist URLs', () => {
    it('应该解析标准 Gitee Gist URL', () => {
      const url = 'https://gitee.com/username/codes/abc123def456'
      const result = parseGistUrl(url)

      expect(result).not.toBeNull()
      expect(result?.platform).toBe('gitee')
      expect(result?.gistId).toBe('abc123def456')
    })

    it('应该解析 Gitee Gist 分享链接', () => {
      const url = 'https://gitee.com/codes/abc123def456'
      const result = parseGistUrl(url)

      expect(result).not.toBeNull()
      expect(result?.platform).toBe('gitee')
      expect(result?.gistId).toBe('abc123def456')
    })
  })

  describe('无效 URLs', () => {
    it('应该对无效 URL 返回 null', () => {
      expect(parseGistUrl('not a url')).toBeNull()
      expect(parseGistUrl('')).toBeNull()
      expect(parseGistUrl('https://example.com')).toBeNull()
    })

    it('应该对不支持的平台返回 null', () => {
      expect(parseGistUrl('https://gitlab.com/snippets/123')).toBeNull()
      expect(parseGistUrl('https://pastebin.com/abc123')).toBeNull()
    })

    it('应该对缺少 Gist ID 的 URL 返回 null', () => {
      expect(parseGistUrl('https://gist.github.com/')).toBeNull()
      expect(parseGistUrl('https://gist.github.com/username')).toBeNull()
    })
  })

  describe('直接 Gist ID', () => {
    it('应该接受直接的 Gist ID（需要指定平台）', () => {
      const result = parseGistUrl('abc123def456789012345678901234567890', 'github')

      expect(result).not.toBeNull()
      expect(result?.platform).toBe('github')
      expect(result?.gistId).toBe('abc123def456789012345678901234567890')
    })

    it('应该对没有指定平台的纯 ID 返回 null', () => {
      const result = parseGistUrl('abc123def456')

      expect(result).toBeNull()
    })
  })
})

describe('GistSyncException', () => {
  it('应该正确创建异常实例', () => {
    const error = new GistSyncException(GIST_SYNC_ERRORS.NETWORK_ERROR, 'Network failed')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(GistSyncException)
    expect(error.code).toBe(GIST_SYNC_ERRORS.NETWORK_ERROR)
    expect(error.message).toBe('Network failed')
  })

  it('应该有正确的错误名称', () => {
    const error = new GistSyncException(GIST_SYNC_ERRORS.AUTH_FAILED, 'Auth failed')

    expect(error.name).toBe('GistSyncException')
  })
})
