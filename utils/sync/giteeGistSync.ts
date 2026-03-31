/**
 * Gitee Gist (代码片段) 同步模块
 */

import {
  GistSyncException,
  GIST_SYNC_ERRORS,
  GIST_FILENAME,
  GIST_DESCRIPTION,
  type ConnectionTestResult,
  type GistResponse,
} from './gistSync'

// ==================== 类型定义 ====================

export interface GiteeGistResponse extends GistResponse {
  owner?: {
    login: string
    id: number
    name?: string
  }
}

interface GiteeUserResponse {
  login: string
  id: number
  name?: string
}

// ==================== API 常量 ====================

const GITEE_API_BASE = 'https://gitee.com/api/v5'

// ==================== 连接测试 ====================

/**
 * 测试 Gitee 连接
 */
export const testGiteeConnection = async (
  token: string
): Promise<ConnectionTestResult> => {
  try {
    const response = await fetch(
      `${GITEE_API_BASE}/user?access_token=${encodeURIComponent(token)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      if (response.status === 401) {
        return {
          success: false,
          error: 'Token 无效或已过期，请检查您的私人令牌',
        }
      }
      if (response.status === 403) {
        return {
          success: false,
          error: 'Token 权限不足，请确保 Token 具有 gists 权限',
        }
      }
      return {
        success: false,
        error: errorData.message || `请求失败: ${response.status}`,
      }
    }

    const userData: GiteeUserResponse = await response.json()
    return {
      success: true,
      username: userData.login,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || '网络连接失败',
    }
  }
}

// ==================== Gist 操作 ====================

/**
 * 获取 Gitee Gist
 */
export const fetchGiteeGist = async (
  token: string,
  gistId: string
): Promise<GiteeGistResponse | null> => {
  try {
    const response = await fetch(
      `${GITEE_API_BASE}/gists/${gistId}?access_token=${encodeURIComponent(token)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      if (response.status === 404) {
        return null
      }
      if (response.status === 401) {
        throw new GistSyncException(
          GIST_SYNC_ERRORS.AUTH_FAILED,
          'Gitee Token 无效或已过期'
        )
      }
      const errorData = await response.json().catch(() => ({}))
      throw new GistSyncException(
        GIST_SYNC_ERRORS.NETWORK_ERROR,
        errorData.message || `获取代码片段失败: ${response.status}`
      )
    }

    return await response.json()
  } catch (error: any) {
    if (error instanceof GistSyncException) {
      throw error
    }
    throw new GistSyncException(
      GIST_SYNC_ERRORS.NETWORK_ERROR,
      error.message || '网络请求失败'
    )
  }
}

/**
 * 创建 Gitee Gist
 * 注意：Gitee API 的 files 参数格式与 GitHub 不同
 */
export const createGiteeGist = async (
  token: string,
  content: string,
  isPublic: boolean = false,
  description: string = GIST_DESCRIPTION
): Promise<GiteeGistResponse> => {
  try {
    // Gitee API 需要将 files 作为 JSON 字符串
    const filesData: Record<string, { content: string }> = {
      [GIST_FILENAME]: {
        content,
      },
    }

    const response = await fetch(`${GITEE_API_BASE}/gists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access_token: token,
        description,
        public: isPublic ? 'true' : 'false',
        files: filesData,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      if (response.status === 401) {
        throw new GistSyncException(
          GIST_SYNC_ERRORS.AUTH_FAILED,
          'Gitee Token 无效或已过期'
        )
      }
      if (response.status === 422) {
        throw new GistSyncException(
          GIST_SYNC_ERRORS.INVALID_FORMAT,
          '创建代码片段失败: 数据格式无效'
        )
      }
      throw new GistSyncException(
        GIST_SYNC_ERRORS.NETWORK_ERROR,
        errorData.message || `创建代码片段失败: ${response.status}`
      )
    }

    return await response.json()
  } catch (error: any) {
    if (error instanceof GistSyncException) {
      throw error
    }
    throw new GistSyncException(
      GIST_SYNC_ERRORS.NETWORK_ERROR,
      error.message || '网络请求失败'
    )
  }
}

/**
 * 更新 Gitee Gist
 */
export const updateGiteeGist = async (
  token: string,
  gistId: string,
  content: string,
  description?: string
): Promise<GiteeGistResponse> => {
  try {
    const filesData: Record<string, { content: string }> = {
      [GIST_FILENAME]: {
        content,
      },
    }

    const body: any = {
      access_token: token,
      files: filesData,
    }

    if (description) {
      body.description = description
    }

    const response = await fetch(`${GITEE_API_BASE}/gists/${gistId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      if (response.status === 401) {
        throw new GistSyncException(
          GIST_SYNC_ERRORS.AUTH_FAILED,
          'Gitee Token 无效或已过期'
        )
      }
      if (response.status === 404) {
        throw new GistSyncException(
          GIST_SYNC_ERRORS.NOT_FOUND,
          '代码片段不存在或您没有权限访问'
        )
      }
      throw new GistSyncException(
        GIST_SYNC_ERRORS.NETWORK_ERROR,
        errorData.message || `更新代码片段失败: ${response.status}`
      )
    }

    return await response.json()
  } catch (error: any) {
    if (error instanceof GistSyncException) {
      throw error
    }
    throw new GistSyncException(
      GIST_SYNC_ERRORS.NETWORK_ERROR,
      error.message || '网络请求失败'
    )
  }
}

/**
 * 删除 Gitee Gist
 */
export const deleteGiteeGist = async (
  token: string,
  gistId: string
): Promise<boolean> => {
  try {
    const response = await fetch(
      `${GITEE_API_BASE}/gists/${gistId}?access_token=${encodeURIComponent(token)}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      if (response.status === 404) {
        return true // 已经不存在，视为删除成功
      }
      if (response.status === 401) {
        throw new GistSyncException(
          GIST_SYNC_ERRORS.AUTH_FAILED,
          'Gitee Token 无效或已过期'
        )
      }
      return false
    }

    return true
  } catch (error: any) {
    if (error instanceof GistSyncException) {
      throw error
    }
    throw new GistSyncException(
      GIST_SYNC_ERRORS.NETWORK_ERROR,
      error.message || '网络请求失败'
    )
  }
}

/**
 * 获取用户的所有 Gist 列表
 */
export const listGiteeGists = async (
  token: string,
  perPage: number = 30
): Promise<GiteeGistResponse[]> => {
  try {
    const response = await fetch(
      `${GITEE_API_BASE}/gists?access_token=${encodeURIComponent(token)}&per_page=${perPage}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      if (response.status === 401) {
        throw new GistSyncException(
          GIST_SYNC_ERRORS.AUTH_FAILED,
          'Gitee Token 无效或已过期'
        )
      }
      const errorData = await response.json().catch(() => ({}))
      throw new GistSyncException(
        GIST_SYNC_ERRORS.NETWORK_ERROR,
        errorData.message || `获取代码片段列表失败: ${response.status}`
      )
    }

    return await response.json()
  } catch (error: any) {
    if (error instanceof GistSyncException) {
      throw error
    }
    throw new GistSyncException(
      GIST_SYNC_ERRORS.NETWORK_ERROR,
      error.message || '网络请求失败'
    )
  }
}

/**
 * 查找 Quick Prompt 备份 Gist
 */
export const findQuickPromptGist = async (
  token: string
): Promise<GiteeGistResponse | null> => {
  try {
    const gists = await listGiteeGists(token, 100)

    // 查找包含 quick-prompt-backup.json 文件的 Gist
    const found = gists.find(gist =>
      gist.files && GIST_FILENAME in gist.files
    )

    if (found) {
      // 获取完整的 Gist 内容
      return await fetchGiteeGist(token, found.id)
    }

    return null
  } catch (error) {
    console.error('查找 Quick Prompt 代码片段失败:', error)
    return null
  }
}
