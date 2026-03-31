import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  testGiteeConnection,
  fetchGiteeGist,
  createGiteeGist,
  updateGiteeGist,
  GiteeGistResponse,
} from '@/utils/sync/giteeGistSync'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Gitee Gist Sync', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('testGiteeConnection', () => {
    it('应该在 token 有效时返回成功', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ login: 'testuser', name: 'Test User' }),
      })

      const result = await testGiteeConnection('valid-token')

      expect(result.success).toBe(true)
      expect(result.username).toBe('testuser')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://gitee.com/api/v5/user'),
        expect.any(Object)
      )
    })

    it('应该在 token 无效时返回失败', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: '401 Unauthorized' }),
      })

      const result = await testGiteeConnection('invalid-token')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('应该在网络错误时返回失败', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await testGiteeConnection('any-token')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Network error')
    })
  })

  describe('fetchGiteeGist', () => {
    const mockGistResponse: GiteeGistResponse = {
      id: 'gist123',
      description: 'Quick Prompt Backup',
      public: false,
      files: {
        'quick-prompt-backup.json': {
          filename: 'quick-prompt-backup.json',
          content: JSON.stringify({
            version: '1.0',
            exportedAt: '2024-01-15T12:00:00.000Z',
            prompts: [],
            categories: [],
          }),
        },
      },
      html_url: 'https://gitee.com/codes/gist123',
      created_at: '2024-01-15T12:00:00.000Z',
      updated_at: '2024-01-15T12:00:00.000Z',
    }

    it('应该成功获取 Gist 内容', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockGistResponse,
      })

      const result = await fetchGiteeGist('valid-token', 'gist123')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('gist123')
      expect(result?.files).toBeDefined()
    })

    it('应该在 Gist 不存在时返回 null', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Not Found' }),
      })

      const result = await fetchGiteeGist('valid-token', 'nonexistent')

      expect(result).toBeNull()
    })

    it('应该在认证失败时抛出错误', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: '401 Unauthorized' }),
      })

      await expect(fetchGiteeGist('invalid-token', 'gist123')).rejects.toThrow()
    })
  })

  describe('createGiteeGist', () => {
    it('应该成功创建 Gist', async () => {
      const mockResponse: GiteeGistResponse = {
        id: 'newgist123',
        description: 'Quick Prompt Backup',
        public: false,
        files: {
          'quick-prompt-backup.json': {
            filename: 'quick-prompt-backup.json',
            content: '{}',
          },
        },
        html_url: 'https://gitee.com/codes/newgist123',
        created_at: '2024-01-15T12:00:00.000Z',
        updated_at: '2024-01-15T12:00:00.000Z',
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      })

      const result = await createGiteeGist('valid-token', 'test content', false)

      expect(result).not.toBeNull()
      expect(result?.id).toBe('newgist123')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://gitee.com/api/v5/gists'),
        expect.objectContaining({
          method: 'POST',
        })
      )
    })

    it('应该支持创建公开 Gist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          id: 'publicgist',
          public: true,
          files: {},
          html_url: '',
          created_at: '',
          updated_at: '',
        }),
      })

      await createGiteeGist('valid-token', 'content', true)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"public":"true"'),
        })
      )
    })

    it('应该在创建失败时抛出错误', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({ message: 'Validation Failed' }),
      })

      await expect(createGiteeGist('valid-token', 'content', false)).rejects.toThrow()
    })
  })

  describe('updateGiteeGist', () => {
    it('应该成功更新 Gist', async () => {
      const mockResponse: GiteeGistResponse = {
        id: 'gist123',
        description: 'Quick Prompt Backup',
        public: false,
        files: {
          'quick-prompt-backup.json': {
            filename: 'quick-prompt-backup.json',
            content: 'updated content',
          },
        },
        html_url: 'https://gitee.com/codes/gist123',
        created_at: '2024-01-15T12:00:00.000Z',
        updated_at: '2024-01-15T13:00:00.000Z',
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await updateGiteeGist('valid-token', 'gist123', 'updated content')

      expect(result).not.toBeNull()
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://gitee.com/api/v5/gists/gist123'),
        expect.objectContaining({
          method: 'PATCH',
        })
      )
    })

    it('应该在 Gist 不存在时抛出错误', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Not Found' }),
      })

      await expect(updateGiteeGist('valid-token', 'nonexistent', 'content')).rejects.toThrow()
    })
  })
})
