import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PromptItem } from '@/utils/types'
import {
  FEISHU_API_BASE,
  FEISHU_PAGE_SIZE,
  FEISHU_SYNC_ERRORS,
  FEISHU_TOKEN_REFRESH_MARGIN_MS,
  FeishuSyncException,
  applyPulledPrompts,
  ensureTenantAccessToken,
  fetchFeishuBitableRecords,
  isFeishuTokenExpired,
  mapFeishuRecordToPrompt,
  readFeishuTextField,
  requestTenantAccessToken,
} from '@/utils/sync/feishuSync'

// Mock fetch (same pattern as giteeGistSync.test.ts / githubGistSync.test.ts)
const mockFetch = vi.fn()
global.fetch = mockFetch

// FAKE placeholder credentials — never real values
const fakeAuthConfig = {
  appId: 'cli_FAKE_APP_ID_PLACEHOLDER',
  appSecret: 'FAKE_APP_SECRET_PLACEHOLDER',
}

const fakeTableConfig = {
  appToken: 'FAKE_BITABLE_APP_TOKEN',
  tableId: 'tblFAKETABLE',
}

const NOW = 1_700_000_000_000

const tokenResponse = (token: string, expire = 7200) => ({
  ok: true,
  json: async () => ({ code: 0, msg: 'ok', tenant_access_token: token, expire }),
})

const recordsResponse = (
  items: Array<{ record_id: string; fields: Record<string, unknown> }>,
  { hasMore = false, pageToken }: { hasMore?: boolean; pageToken?: string } = {}
) => ({
  ok: true,
  json: async () => ({
    code: 0,
    msg: 'success',
    data: { has_more: hasMore, page_token: pageToken, items },
  }),
})

describe('Feishu sync — stage 1 (staged auth + one-way pull)', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('requestTenantAccessToken (staged auth)', () => {
    it('exchanges app_id/app_secret for a tenant_access_token with expiry', async () => {
      mockFetch.mockResolvedValueOnce(tokenResponse('t-fake-token-1'))

      const cache = await requestTenantAccessToken(fakeAuthConfig, mockFetch, NOW)

      expect(cache.token).toBe('t-fake-token-1')
      expect(cache.expiresAt).toBe(NOW + 7200 * 1000)
      expect(mockFetch).toHaveBeenCalledWith(
        `${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            app_id: fakeAuthConfig.appId,
            app_secret: fakeAuthConfig.appSecret,
          }),
        })
      )
    })

    it('maps a non-zero Feishu code to AUTH_FAILED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 99991663, msg: 'app secret invalid' }),
      })

      await expect(
        requestTenantAccessToken(fakeAuthConfig, mockFetch, NOW)
      ).rejects.toMatchObject({
        name: 'FeishuSyncException',
        code: FEISHU_SYNC_ERRORS.AUTH_FAILED,
      })
    })

    it('maps an HTTP failure to HTTP_ERROR', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

      await expect(
        requestTenantAccessToken(fakeAuthConfig, mockFetch, NOW)
      ).rejects.toMatchObject({ code: FEISHU_SYNC_ERRORS.HTTP_ERROR })
    })

    it('maps a network failure to NETWORK_ERROR', async () => {
      mockFetch.mockRejectedValueOnce(new Error('offline'))

      await expect(
        requestTenantAccessToken(fakeAuthConfig, mockFetch, NOW)
      ).rejects.toMatchObject({ code: FEISHU_SYNC_ERRORS.NETWORK_ERROR })
    })

    it('rejects when credentials are missing (NOT_CONFIGURED)', async () => {
      await expect(
        requestTenantAccessToken({ appId: '', appSecret: '' }, mockFetch, NOW)
      ).rejects.toMatchObject({ code: FEISHU_SYNC_ERRORS.NOT_CONFIGURED })
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('token cache and refresh', () => {
    it('reuses a still-valid cached token without a network call', async () => {
      const cache = { token: 't-cached', expiresAt: NOW + 60 * 60 * 1000 }

      const result = await ensureTenantAccessToken(fakeAuthConfig, cache, mockFetch, NOW)

      expect(result.token).toBe('t-cached')
      expect(result.refreshed).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('refreshes an expired token', async () => {
      const expired = { token: 't-old', expiresAt: NOW - 1000 }
      mockFetch.mockResolvedValueOnce(tokenResponse('t-fresh'))

      const result = await ensureTenantAccessToken(fakeAuthConfig, expired, mockFetch, NOW)

      expect(result.token).toBe('t-fresh')
      expect(result.refreshed).toBe(true)
      expect(result.cache.expiresAt).toBe(NOW + 7200 * 1000)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('treats a token inside the refresh margin as expired', () => {
      const nearExpiry = {
        token: 't-soon',
        expiresAt: NOW + FEISHU_TOKEN_REFRESH_MARGIN_MS - 1,
      }
      expect(isFeishuTokenExpired(nearExpiry, NOW)).toBe(true)
      expect(isFeishuTokenExpired(null, NOW)).toBe(true)
      expect(
        isFeishuTokenExpired(
          { token: 't-ok', expiresAt: NOW + FEISHU_TOKEN_REFRESH_MARGIN_MS + 1 },
          NOW
        )
      ).toBe(false)
    })
  })

  describe('fetchFeishuBitableRecords (one-way pull)', () => {
    it('aggregates records across pages via page_token', async () => {
      mockFetch.mockResolvedValueOnce(
        recordsResponse(
          [{ record_id: 'rec1', fields: { Title: 'One', Content: 'C1' } }],
          { hasMore: true, pageToken: 'PAGE_2_TOKEN' }
        )
      )
      mockFetch.mockResolvedValueOnce(
        recordsResponse([{ record_id: 'rec2', fields: { Title: 'Two', Content: 'C2' } }])
      )

      const records = await fetchFeishuBitableRecords('t-fake', fakeTableConfig, mockFetch)

      expect(records.map((r) => r.record_id)).toEqual(['rec1', 'rec2'])
      expect(mockFetch).toHaveBeenCalledTimes(2)
      const firstUrl = mockFetch.mock.calls[0][0] as string
      const secondUrl = mockFetch.mock.calls[1][0] as string
      expect(firstUrl).toContain(
        `/bitable/v1/apps/${fakeTableConfig.appToken}/tables/${fakeTableConfig.tableId}/records`
      )
      expect(firstUrl).toContain(`page_size=${FEISHU_PAGE_SIZE}`)
      expect(firstUrl).not.toContain('page_token')
      expect(secondUrl).toContain('page_token=PAGE_2_TOKEN')
    })

    it('sends the tenant token as a Bearer header', async () => {
      mockFetch.mockResolvedValueOnce(recordsResponse([]))

      await fetchFeishuBitableRecords('t-fake-bearer', fakeTableConfig, mockFetch)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { Authorization: 'Bearer t-fake-bearer' },
        })
      )
    })

    it('maps a non-zero API code to API_ERROR', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 91402, msg: 'NOTEXIST' }),
      })

      await expect(
        fetchFeishuBitableRecords('t-fake', fakeTableConfig, mockFetch)
      ).rejects.toMatchObject({ code: FEISHU_SYNC_ERRORS.API_ERROR })
    })

    it('maps an HTTP failure to HTTP_ERROR', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 })

      await expect(
        fetchFeishuBitableRecords('t-fake', fakeTableConfig, mockFetch)
      ).rejects.toMatchObject({ code: FEISHU_SYNC_ERRORS.HTTP_ERROR })
    })

    it('rejects when the table location is missing (NOT_CONFIGURED)', async () => {
      await expect(
        fetchFeishuBitableRecords('t-fake', { appToken: '', tableId: '' }, mockFetch)
      ).rejects.toMatchObject({ code: FEISHU_SYNC_ERRORS.NOT_CONFIGURED })
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('long-prompt round trip (the issue #27 motivation)', () => {
    it('preserves prompt content far beyond the Notion 2000-character field limit', async () => {
      const longContent = 'x'.repeat(5000)
      mockFetch.mockResolvedValueOnce(
        recordsResponse([
          { record_id: 'recLong', fields: { Title: 'Long prompt', Content: longContent } },
        ])
      )

      const records = await fetchFeishuBitableRecords('t-fake', fakeTableConfig, mockFetch)
      const prompt = mapFeishuRecordToPrompt(records[0])

      expect(prompt).not.toBeNull()
      expect(prompt!.content).toHaveLength(5000)
      expect(prompt!.content).toBe(longContent)
    })

    it('joins ALL rich-text segments instead of reading only the first one', () => {
      // Notion pull reads rich_text[0] only (max 2000 chars); Feishu text fields
      // may arrive as segment arrays and must be joined completely.
      const segmentA = 'a'.repeat(2000)
      const segmentB = 'b'.repeat(2000)
      const segmentC = 'c'.repeat(1000)
      const value = [
        { type: 'text', text: segmentA },
        { type: 'text', text: segmentB },
        { type: 'text', text: segmentC },
      ]

      expect(readFeishuTextField(value)).toHaveLength(5000)
      expect(readFeishuTextField(value)).toBe(segmentA + segmentB + segmentC)
    })
  })

  describe('mapFeishuRecordToPrompt', () => {
    it('maps the agreed field layout onto PromptItem', () => {
      const prompt = mapFeishuRecordToPrompt({
        record_id: 'recMap',
        fields: {
          Title: 'My prompt',
          Content: 'Do the thing',
          Tags: 'writing, coding',
          Enabled: false,
          PromptID: 'prompt-42',
          CategoryID: 'cat-7',
          Notes: 'from Bitable',
          CreatedAt: '2026-01-01T00:00:00.000Z',
          LastModified: '2026-02-01T00:00:00.000Z',
        },
      })

      expect(prompt).toMatchObject({
        id: 'prompt-42',
        title: 'My prompt',
        content: 'Do the thing',
        tags: ['writing', 'coding'],
        enabled: false,
        categoryId: 'cat-7',
        notes: 'from Bitable',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastModified: '2026-02-01T00:00:00.000Z',
      })
    })

    it('falls back to a record-derived id and the default category', () => {
      const prompt = mapFeishuRecordToPrompt({
        record_id: 'recFallback',
        fields: { Title: 'Untitled home', Content: 'body' },
      })

      expect(prompt!.id).toBe('feishu-recFallback')
      expect(prompt!.categoryId).toBe('default')
      expect(prompt!.enabled).toBe(true)
    })

    it('drops records with neither title nor content', () => {
      expect(mapFeishuRecordToPrompt({ record_id: 'recEmpty', fields: {} })).toBeNull()
    })
  })

  describe('applyPulledPrompts merge semantics', () => {
    const local = (id: string): PromptItem => ({
      id,
      title: `local-${id}`,
      content: 'local',
      tags: [],
      enabled: true,
      categoryId: 'default',
    })

    it('replace mode returns exactly the pulled set', () => {
      const merged = applyPulledPrompts([local('a')], [local('b'), local('c')], 'replace')
      expect(merged.map((p) => p.id)).toEqual(['b', 'c'])
    })

    it('append mode keeps local prompts and adds only new ids', () => {
      const merged = applyPulledPrompts(
        [local('a'), local('b')],
        [local('b'), local('c')],
        'append'
      )
      expect(merged.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    })
  })

  it('exposes a typed exception with a stable name', () => {
    const error = new FeishuSyncException(FEISHU_SYNC_ERRORS.API_ERROR, 'boom')
    expect(error.name).toBe('FeishuSyncException')
    expect(error).toBeInstanceOf(Error)
  })
})
