/**
 * GitHub Gist 同步模块
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

export interface GitHubGistResponse extends GistResponse {
  owner?: {
    login: string
    id: number
  }
}

interface GitHubUserResponse {
  login: string
  id: number
  name?: string
}

// ==================== API 常量 ====================

const GITHUB_API_BASE = 'https://api.github.com'

const getHeaders = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'X-GitHub-Api-Version': '2022-11-28',
})

// ==================== 连接测试 ====================

/**
 * 测试 GitHub 连接
 */
export const testGitHubConnection = async (
  token: string
): Promise<ConnectionTestResult> => {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/user`, {
      method: 'GET',
      headers: getHeaders(token),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      if (response.status === 401) {
        return {
          success: false,
          error: 'Token 无效或已过期，请检查您的 Personal Access Token',
        }
      }
      if (response.status === 403) {
        return {
          success: false,
          error: 'Token 权限不足，请确保 Token 具有 gist 权限',
        }
      }
      return {
        success: false,
        error: errorData.message || `请求失败: ${response.status}`,
      }
    }

    const userData: GitHubUserResponse = await response.json()
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
 * 获取 GitHub Gist
 */
export const fetchGitHubGist = async (
  token: string,
  gistId: string
): Promise<GitHubGistResponse | null> => {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/gists/${gistId}`, {
      method: 'GET',
      headers: getHeaders(token),
    })

    if (!response.ok) {
      if (response.status === 404) {
        return null
      }
      if (response.status === 401) {
        throw new GistSyncException(
          GIST_SYNC_ERRORS.AUTH_FAILED,
          'GitHub Token 无效或已过期'
        )
      }
      const errorData = await response.json().catch(() => ({}))
      throw new GistSyncException(
        GIST_SYNC_ERRORS.NETWORK_ERROR,
        errorData.message || `获取 Gist 失败: ${response.status}`
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
 * 创建 GitHub Gist
 */
export const createGitHubGist = async (
  token: string,
  content: string,
  isPublic: boolean = false,
  description: string = GIST_DESCRIPTION
): Promise<GitHubGistResponse> => {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/gists`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({
        description,
        public: isPublic,
        files: {
          [GIST_FILENAME]: {
            content,
          },
        },
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      if (response.status === 401) {
        throw new GistSyncException(
          GIST_SYNC_ERRORS.AUTH_FAILED,
          'GitHub Token 无效或已过期'
        )
      }
      if (response.status === 422) {
        throw new GistSyncException(
          GIST_SYNC_ERRORS.INVALID_FORMAT,
          '创建 Gist 失败: 数据格式无效'
        )
      }
      throw new GistSyncException(
        GIST_SYNC_ERRORS.NETWORK_ERROR,
        errorData.message || `创建 Gist 失败: ${response.status}`
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
 * 更新 GitHub Gist
 */
export const updateGitHubGist = async (
  token: string,
  gistId: string,
  content: string,
  description?: string
): Promise<GitHubGistResponse> => {
  try {
    const body: any = {
      files: {
        [GIST_FILENAME]: {
          content,
        },
      },
    }

    if (description) {
      body.description = description
    }

    const response = await fetch(`${GITHUB_API_BASE}/gists/${gistId}`, {
      method: 'PATCH',
      headers: getHeaders(token),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      if (response.status === 401) {
        throw new GistSyncException(
          GIST_SYNC_ERRORS.AUTH_FAILED,
          'GitHub Token 无效或已过期'
        )
      }
      if (response.status === 404) {
        throw new GistSyncException(
          GIST_SYNC_ERRORS.NOT_FOUND,
          'Gist 不存在或您没有权限访问'
        )
      }
      throw new GistSyncException(
        GIST_SYNC_ERRORS.NETWORK_ERROR,
        errorData.message || `更新 Gist 失败: ${response.status}`
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
 * 删除 GitHub Gist
 */
export const deleteGitHubGist = async (
  token: string,
  gistId: string
): Promise<boolean> => {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/gists/${gistId}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    })

    if (!response.ok) {
      if (response.status === 404) {
        return true // 已经不存在，视为删除成功
      }
      if (response.status === 401) {
        throw new GistSyncException(
          GIST_SYNC_ERRORS.AUTH_FAILED,
          'GitHub Token 无效或已过期'
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
export const listGitHubGists = async (
  token: string,
  perPage: number = 30
): Promise<GitHubGistResponse[]> => {
  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/gists?per_page=${perPage}`,
      {
        method: 'GET',
        headers: getHeaders(token),
      }
    )

    if (!response.ok) {
      if (response.status === 401) {
        throw new GistSyncException(
          GIST_SYNC_ERRORS.AUTH_FAILED,
          'GitHub Token 无效或已过期'
        )
      }
      const errorData = await response.json().catch(() => ({}))
      throw new GistSyncException(
        GIST_SYNC_ERRORS.NETWORK_ERROR,
        errorData.message || `获取 Gist 列表失败: ${response.status}`
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
): Promise<GitHubGistResponse | null> => {
  try {
    const gists = await listGitHubGists(token, 100)

    // 查找包含 quick-prompt-backup.json 文件的 Gist
    const found = gists.find(gist =>
      gist.files && GIST_FILENAME in gist.files
    )

    if (found) {
      // 获取完整的 Gist 内容
      return await fetchGitHubGist(token, found.id)
    }

    return null
  } catch (error) {
    console.error('查找 Quick Prompt Gist 失败:', error)
    return null
  }
}
