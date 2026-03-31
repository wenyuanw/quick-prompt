/**
 * Gist 同步核心模块
 * 提供通用的 Gist 同步功能，支持 GitHub 和 Gitee
 */

import type { PromptItem, Category } from '@/utils/types'

// ==================== 类型定义 ====================

export type GistPlatform = 'github' | 'gitee'

/**
 * Gist 导出数据格式
 */
export interface GistExportData {
  version: string
  exportedAt: string
  prompts: PromptItem[]
  categories: Category[]
}

/**
 * Gist URL 解析结果
 */
export interface ParsedGistUrl {
  platform: GistPlatform
  gistId: string
}

/**
 * Gist 同步配置
 */
export interface GistSyncConfig {
  platform: GistPlatform
  accessToken: string
  gistId?: string
  isPublic: boolean
  autoSync: boolean
}

/**
 * 同步状态
 */
export interface GistSyncStatus {
  id: string
  status: 'in_progress' | 'success' | 'error'
  startTime?: number
  completedTime?: number
  message?: string
  error?: string
}

// ==================== 错误处理 ====================

export const GIST_SYNC_ERRORS = {
  INVALID_FORMAT: 'INVALID_FORMAT',
  MISSING_DATA: 'MISSING_DATA',
  NETWORK_ERROR: 'NETWORK_ERROR',
  AUTH_FAILED: 'AUTH_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  UNKNOWN: 'UNKNOWN',
} as const

export type GistSyncErrorCode = typeof GIST_SYNC_ERRORS[keyof typeof GIST_SYNC_ERRORS]

export class GistSyncException extends Error {
  code: GistSyncErrorCode

  constructor(code: GistSyncErrorCode, message: string) {
    super(message)
    this.name = 'GistSyncException'
    this.code = code
  }
}

// ==================== 存储键常量 ====================

export const GIST_STORAGE_KEYS = {
  CONFIG: 'gistSyncConfig',
  GITHUB_TOKEN: 'githubAccessToken',
  GITEE_TOKEN: 'giteeAccessToken',
  GITHUB_GIST_ID: 'githubGistId',
  GITEE_GIST_ID: 'giteeGistId',
  GITHUB_AUTO_SYNC: 'githubAutoSync',
  GITEE_AUTO_SYNC: 'giteeAutoSync',
  GITHUB_PUBLIC: 'githubGistPublic',
  GITEE_PUBLIC: 'giteeGistPublic',
  SYNC_STATUS: 'gist_sync_status',
} as const

export const GIST_FILENAME = 'quick-prompt-backup.json'
export const GIST_DESCRIPTION = 'Quick Prompt - Prompts Backup'
export const CURRENT_VERSION = '1.0'

// ==================== 序列化/反序列化 ====================

/**
 * 将 prompts 和 categories 序列化为 Gist 内容
 */
export const serializeToGistContent = (
  prompts: PromptItem[],
  categories: Category[]
): string => {
  const data: GistExportData = {
    version: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    prompts,
    categories,
  }
  return JSON.stringify(data, null, 2)
}

/**
 * 从 Gist 内容反序列化数据
 */
export const deserializeFromGistContent = (content: string): GistExportData => {
  let data: any

  try {
    data = JSON.parse(content)
  } catch {
    throw new GistSyncException(
      GIST_SYNC_ERRORS.INVALID_FORMAT,
      '无法解析 Gist 内容，JSON 格式无效'
    )
  }

  // 验证必需字段
  if (!data.prompts) {
    throw new GistSyncException(
      GIST_SYNC_ERRORS.MISSING_DATA,
      'Gist 数据缺少 prompts 字段'
    )
  }

  if (!Array.isArray(data.prompts)) {
    throw new GistSyncException(
      GIST_SYNC_ERRORS.INVALID_FORMAT,
      'prompts 字段必须是数组'
    )
  }

  return {
    version: data.version || '1.0',
    exportedAt: data.exportedAt || new Date().toISOString(),
    prompts: data.prompts,
    categories: Array.isArray(data.categories) ? data.categories : [],
  }
}

// ==================== URL 解析 ====================

/**
 * 解析 Gist URL，提取平台和 Gist ID
 * 支持的格式：
 * - GitHub: https://gist.github.com/username/gistid
 * - GitHub: https://gist.github.com/gistid
 * - GitHub Raw: https://gist.githubusercontent.com/username/gistid/raw/...
 * - Gitee: https://gitee.com/username/codes/gistid
 * - Gitee: https://gitee.com/codes/gistid
 */
export const parseGistUrl = (
  urlOrId: string,
  defaultPlatform?: GistPlatform
): ParsedGistUrl | null => {
  if (!urlOrId || typeof urlOrId !== 'string') {
    return null
  }

  const trimmed = urlOrId.trim()

  // GitHub Gist URL 模式
  const githubPatterns = [
    // https://gist.github.com/username/gistid
    /^https?:\/\/gist\.github\.com\/[\w-]+\/([a-f0-9]+)/i,
    // https://gist.github.com/gistid
    /^https?:\/\/gist\.github\.com\/([a-f0-9]+)/i,
    // https://gist.githubusercontent.com/username/gistid/raw/...
    /^https?:\/\/gist\.githubusercontent\.com\/[\w-]+\/([a-f0-9]+)/i,
  ]

  for (const pattern of githubPatterns) {
    const match = trimmed.match(pattern)
    if (match && match[1]) {
      return {
        platform: 'github',
        gistId: match[1],
      }
    }
  }

  // Gitee Gist URL 模式
  const giteePatterns = [
    // https://gitee.com/username/codes/gistid
    /^https?:\/\/gitee\.com\/[\w-]+\/codes\/([a-zA-Z0-9]+)/i,
    // https://gitee.com/codes/gistid
    /^https?:\/\/gitee\.com\/codes\/([a-zA-Z0-9]+)/i,
  ]

  for (const pattern of giteePatterns) {
    const match = trimmed.match(pattern)
    if (match && match[1]) {
      return {
        platform: 'gitee',
        gistId: match[1],
      }
    }
  }

  // 如果是纯 ID 且指定了默认平台
  if (defaultPlatform && /^[a-f0-9]{20,}$/i.test(trimmed)) {
    return {
      platform: defaultPlatform,
      gistId: trimmed,
    }
  }

  return null
}

/**
 * 构建 Gist URL
 */
export const buildGistUrl = (platform: GistPlatform, gistId: string): string => {
  if (platform === 'github') {
    return `https://gist.github.com/${gistId}`
  } else {
    return `https://gitee.com/codes/${gistId}`
  }
}

// ==================== 通用接口 ====================

/**
 * 通用 Gist 响应接口
 */
export interface GistResponse {
  id: string
  description?: string
  public: boolean
  files: Record<string, { filename: string; content: string }>
  html_url: string
  created_at: string
  updated_at: string
}

/**
 * 连接测试结果
 */
export interface ConnectionTestResult {
  success: boolean
  username?: string
  error?: string
}

/**
 * 同步结果
 */
export interface SyncResult {
  success: boolean
  gistId?: string
  gistUrl?: string
  message?: string
  error?: string
}
