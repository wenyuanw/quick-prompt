import type { PromptItem } from '@/utils/types'
import { DEFAULT_CATEGORY_ID } from '@/utils/constants'
import { getAllPrompts, setAllPrompts } from '@/utils/promptStore'

// ==================== 常量 ====================

export const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis'

export const FEISHU_STORAGE_KEYS = {
  /** browser.storage.sync — 用户配置（app 凭据 + 多维表格定位） */
  CONFIG: 'feishuSyncConfig',
  /** browser.storage.local — tenant_access_token 缓存（不参与账号同步） */
  TOKEN_CACHE: 'feishuTenantTokenCache',
  /** browser.storage.sync — 是否启用飞书拉取 */
  ENABLED: 'feishuSyncEnabled',
} as const

/** 每页拉取的记录数（飞书 Bitable list records 上限为 500，取保守值） */
export const FEISHU_PAGE_SIZE = 100

/** token 剩余有效期低于该值时强制刷新（毫秒） */
export const FEISHU_TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000

// ==================== 错误 ====================

export const FEISHU_SYNC_ERRORS = {
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  AUTH_FAILED: 'AUTH_FAILED',
  HTTP_ERROR: 'HTTP_ERROR',
  API_ERROR: 'API_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INVALID_FORMAT: 'INVALID_FORMAT',
} as const

export type FeishuSyncErrorCode =
  typeof FEISHU_SYNC_ERRORS[keyof typeof FEISHU_SYNC_ERRORS]

export class FeishuSyncException extends Error {
  code: FeishuSyncErrorCode

  constructor(code: FeishuSyncErrorCode, message: string) {
    super(message)
    this.name = 'FeishuSyncException'
    this.code = code
  }
}

// ==================== 类型 ====================

export interface FeishuSyncConfig {
  /** 飞书自建应用 App ID */
  appId: string
  /** 飞书自建应用 App Secret */
  appSecret: string
  /** 多维表格 app_token（Bitable 文档标识） */
  appToken: string
  /** 数据表 table_id */
  tableId: string
}

export interface FeishuTenantTokenCache {
  token: string
  /** 过期时刻（epoch 毫秒） */
  expiresAt: number
}

/** 飞书文本字段的富文本段 */
export interface FeishuTextSegment {
  type?: string
  text?: string
  [key: string]: unknown
}

export type FeishuFieldValue =
  | string
  | number
  | boolean
  | FeishuTextSegment[]
  | null
  | undefined

export interface FeishuBitableRecord {
  record_id: string
  fields: Record<string, FeishuFieldValue>
}

interface FeishuTenantTokenResponse {
  code: number
  msg: string
  tenant_access_token?: string
  /** 剩余有效期（秒） */
  expire?: number
}

interface FeishuListRecordsResponse {
  code: number
  msg: string
  data?: {
    has_more?: boolean
    page_token?: string
    total?: number
    items?: FeishuBitableRecord[]
  }
}

// ==================== 阶段一：认证（staged auth） ====================

/**
 * 判断缓存的 tenant_access_token 是否已过期（或临近过期）。
 */
export const isFeishuTokenExpired = (
  cache: FeishuTenantTokenCache | null | undefined,
  now: number = Date.now()
): boolean => {
  if (!cache || !cache.token) return true
  return now >= cache.expiresAt - FEISHU_TOKEN_REFRESH_MARGIN_MS
}

/**
 * 用 app_id / app_secret 换取 tenant_access_token。
 * https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal
 */
export const requestTenantAccessToken = async (
  config: Pick<FeishuSyncConfig, 'appId' | 'appSecret'>,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now()
): Promise<FeishuTenantTokenCache> => {
  if (!config.appId || !config.appSecret) {
    throw new FeishuSyncException(
      FEISHU_SYNC_ERRORS.NOT_CONFIGURED,
      '飞书 App ID 或 App Secret 未配置'
    )
  }

  let response: Response
  try {
    response = await fetchImpl(
      `${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          app_id: config.appId,
          app_secret: config.appSecret,
        }),
      }
    )
  } catch (error) {
    throw new FeishuSyncException(
      FEISHU_SYNC_ERRORS.NETWORK_ERROR,
      `飞书认证请求失败: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  if (!response.ok) {
    throw new FeishuSyncException(
      FEISHU_SYNC_ERRORS.HTTP_ERROR,
      `飞书认证接口返回 HTTP ${response.status}`
    )
  }

  const data = (await response.json()) as FeishuTenantTokenResponse
  if (data.code !== 0 || !data.tenant_access_token) {
    throw new FeishuSyncException(
      FEISHU_SYNC_ERRORS.AUTH_FAILED,
      `飞书认证失败 (code ${data.code}): ${data.msg || 'unknown error'}`
    )
  }

  return {
    token: data.tenant_access_token,
    expiresAt: now + (data.expire ?? 0) * 1000,
  }
}

/**
 * 确保拿到一个有效 token：缓存有效则复用，过期则刷新。
 * 返回新的缓存对象，调用方负责持久化。
 */
export const ensureTenantAccessToken = async (
  config: Pick<FeishuSyncConfig, 'appId' | 'appSecret'>,
  cache: FeishuTenantTokenCache | null | undefined,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now()
): Promise<{ token: string; cache: FeishuTenantTokenCache; refreshed: boolean }> => {
  if (!isFeishuTokenExpired(cache, now)) {
    const validCache = cache as FeishuTenantTokenCache
    return { token: validCache.token, cache: validCache, refreshed: false }
  }
  const freshCache = await requestTenantAccessToken(config, fetchImpl, now)
  return { token: freshCache.token, cache: freshCache, refreshed: true }
}

// ==================== 阶段一：单向拉取（one-way pull） ====================

/**
 * 读取飞书文本字段。多维表格文本字段可能是纯字符串，也可能是富文本段数组；
 * 段数组会被完整拼接 —— 与 Notion 只读取 rich_text[0]（上限 2000 字符）不同，
 * 长提示词不会被截断。
 */
export const readFeishuTextField = (value: FeishuFieldValue): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value
      .map((segment) => (typeof segment?.text === 'string' ? segment.text : ''))
      .join('')
  }
  return ''
}

/**
 * 分页拉取多维表格记录（page_token 翻页，聚合所有页）。
 * https://open.feishu.cn/open-apis/bitable/v1/apps/:app_token/tables/:table_id/records
 */
export const fetchFeishuBitableRecords = async (
  token: string,
  config: Pick<FeishuSyncConfig, 'appToken' | 'tableId'>,
  fetchImpl: typeof fetch = fetch
): Promise<FeishuBitableRecord[]> => {
  if (!config.appToken || !config.tableId) {
    throw new FeishuSyncException(
      FEISHU_SYNC_ERRORS.NOT_CONFIGURED,
      '飞书多维表格 app_token 或 table_id 未配置'
    )
  }

  const records: FeishuBitableRecord[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({ page_size: String(FEISHU_PAGE_SIZE) })
    if (pageToken) params.set('page_token', pageToken)

    const url =
      `${FEISHU_API_BASE}/bitable/v1/apps/${encodeURIComponent(config.appToken)}` +
      `/tables/${encodeURIComponent(config.tableId)}/records?${params.toString()}`

    let response: Response
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch (error) {
      throw new FeishuSyncException(
        FEISHU_SYNC_ERRORS.NETWORK_ERROR,
        `飞书记录拉取请求失败: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    if (!response.ok) {
      throw new FeishuSyncException(
        FEISHU_SYNC_ERRORS.HTTP_ERROR,
        `飞书记录接口返回 HTTP ${response.status}`
      )
    }

    const data = (await response.json()) as FeishuListRecordsResponse
    if (data.code !== 0) {
      throw new FeishuSyncException(
        FEISHU_SYNC_ERRORS.API_ERROR,
        `飞书记录接口错误 (code ${data.code}): ${data.msg || 'unknown error'}`
      )
    }

    records.push(...(data.data?.items ?? []))
    pageToken = data.data?.has_more ? data.data?.page_token : undefined
  } while (pageToken)

  return records
}

/**
 * 把一条多维表格记录映射为 PromptItem。
 * 字段约定与 Notion 后端保持一致：Title / Content / Tags / Enabled /
 * PromptID / CategoryID / Notes / CreatedAt / LastModified。
 */
export const mapFeishuRecordToPrompt = (
  record: FeishuBitableRecord
): PromptItem | null => {
  const fields = record.fields || {}
  const title = readFeishuTextField(fields['Title']).trim()
  const content = readFeishuTextField(fields['Content']).trim()

  if (!title && !content) return null

  const rawTags = fields['Tags']
  const tags = Array.isArray(rawTags)
    ? rawTags
        .map((segment) =>
          typeof segment === 'string' ? segment : readFeishuTextField([segment])
        )
        .map((tag) => tag.trim())
        .filter(Boolean)
    : readFeishuTextField(rawTags)
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)

  const promptId =
    readFeishuTextField(fields['PromptID']).trim() || `feishu-${record.record_id}`
  const nowIso = new Date().toISOString()
  const lastModified = readFeishuTextField(fields['LastModified']).trim() || nowIso
  const createdAt = readFeishuTextField(fields['CreatedAt']).trim() || lastModified
  const enabledRaw = fields['Enabled']

  return {
    id: promptId,
    title,
    content,
    tags,
    enabled: typeof enabledRaw === 'boolean' ? enabledRaw : true,
    categoryId: readFeishuTextField(fields['CategoryID']).trim() || DEFAULT_CATEGORY_ID,
    notes: readFeishuTextField(fields['Notes']).trim() || undefined,
    createdAt,
    lastModified,
  }
}

/**
 * 纯函数合并：replace 用拉取结果整体替换；append 只追加本地不存在的 id。
 * 语义与 syncPromptsFromNotion 的 mode 参数一致。
 */
export const applyPulledPrompts = (
  existing: PromptItem[],
  pulled: PromptItem[],
  mode: 'replace' | 'append' = 'replace'
): PromptItem[] => {
  if (mode === 'replace') return [...pulled]
  const existingIds = new Set(existing.map((prompt) => prompt.id))
  return [...existing, ...pulled.filter((prompt) => !existingIds.has(prompt.id))]
}

// ==================== 存储接线（浏览器环境） ====================

export const getFeishuSyncConfig = async (): Promise<FeishuSyncConfig | null> => {
  try {
    const result = await browser.storage.sync.get(FEISHU_STORAGE_KEYS.CONFIG)
    const config = result[FEISHU_STORAGE_KEYS.CONFIG] as FeishuSyncConfig | undefined
    if (!config?.appId || !config?.appSecret || !config?.appToken || !config?.tableId) {
      return null
    }
    return config
  } catch (error) {
    console.error('Error retrieving Feishu sync config:', error)
    return null
  }
}

const getCachedTenantToken = async (): Promise<FeishuTenantTokenCache | null> => {
  try {
    const result = await browser.storage.local.get(FEISHU_STORAGE_KEYS.TOKEN_CACHE)
    return (result[FEISHU_STORAGE_KEYS.TOKEN_CACHE] as FeishuTenantTokenCache) || null
  } catch {
    return null
  }
}

const setCachedTenantToken = async (cache: FeishuTenantTokenCache): Promise<void> => {
  try {
    await browser.storage.local.set({ [FEISHU_STORAGE_KEYS.TOKEN_CACHE]: cache })
  } catch (error) {
    console.error('Error caching Feishu tenant token:', error)
  }
}

/**
 * 阶段一入口：飞书 → 本地 单向拉取。
 * 不含推送、不含冲突处理（阶段二）、不含分类同步与设置 UI（阶段三）。
 */
export const syncPromptsFromFeishu = async (
  mode: 'replace' | 'append' = 'replace'
): Promise<boolean> => {
  const config = await getFeishuSyncConfig()
  if (!config) {
    console.error('Feishu sync is not configured.')
    return false
  }

  try {
    const cached = await getCachedTenantToken()
    const { token, cache, refreshed } = await ensureTenantAccessToken(config, cached)
    if (refreshed) await setCachedTenantToken(cache)

    const records = await fetchFeishuBitableRecords(token, config)
    const pulled = records
      .map(mapFeishuRecordToPrompt)
      .filter((prompt): prompt is PromptItem => prompt !== null)

    const existing = await getAllPrompts()
    await setAllPrompts(applyPulledPrompts(existing, pulled, mode))
    console.log(`Feishu sync pulled ${pulled.length} prompts (mode: ${mode}).`)
    return true
  } catch (error) {
    console.error('Feishu sync failed:', error)
    return false
  }
}
