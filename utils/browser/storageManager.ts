import { BROWSER_STORAGE_KEY, CATEGORIES_STORAGE_KEY } from "@/utils/constants"
import { syncLocalDataToNotion } from "@/utils/sync/notionSync"
import { GIST_STORAGE_KEYS, serializeToGistContent, buildGistUrl } from "@/utils/sync/gistSync"
import { updateGiteeGist, createGiteeGist, findQuickPromptGist as findGiteeGist } from "@/utils/sync/giteeGistSync"
import { updateGitHubGist, createGitHubGist, findQuickPromptGist as findGitHubGist } from "@/utils/sync/githubGistSync"
import type { PromptItem, Category } from "@/utils/types"

// Debounce timer for Gist auto-sync
let gistSyncTimer: ReturnType<typeof setTimeout> | null = null

// Setup storage change listeners for auto-sync
export const setupStorageChangeListeners = (): void => {
  // Added: storage.onChanged listener for auto-sync Local -> Notion
  browser.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'local' && (changes[BROWSER_STORAGE_KEY] || changes[CATEGORIES_STORAGE_KEY])) {
      // Gist auto-sync
      handleGistAutoSync()

      if (!changes[BROWSER_STORAGE_KEY]) return
      console.log('Local prompts data changed, checking if Notion sync (Local -> Notion) is needed...');
      const syncSettings = await browser.storage.sync.get('notionSyncToNotionEnabled');
      if (!!syncSettings.notionSyncToNotionEnabled) {
        console.log('Local data changed, Notion sync (Local -> Notion) is enabled. Triggering sync...');

        // 创建唯一的同步ID用于自动同步
        const syncId = `auto_${Date.now()}`;

        // 存储同步状态为进行中
        await browser.storage.local.set({
          'notion_sync_status': {
            id: syncId,
            status: 'in_progress',
            message: '正在自动同步到Notion，请稍候...',
            startTime: Date.now()
          }
        });

        try {
          // 执行同步并获取结果
          const result = await syncLocalDataToNotion(true);
          console.log(`[AUTO_SYNC_COMPLETE] Auto sync to Notion ${result.success ? 'successful' : 'failed'}`, result.errors || '');

          // 保存同步结果
          if (result.success && !result.errors?.length) {
            // 完全成功
            await browser.storage.local.set({
              'notion_sync_status': {
                id: syncId,
                status: 'success',
                success: true,
                message: '自动同步成功!',
                completedTime: Date.now()
              }
            });
          } else if (result.success && result.errors?.length) {
            // 部分成功，有一些错误
            await browser.storage.local.set({
              'notion_sync_status': {
                id: syncId,
                status: 'error',
                success: true, // 仍然标记为有一定程度的成功
                message: '部分自动同步成功，但有错误发生',
                error: result.errors.join('\n'),
                completedTime: Date.now()
              }
            });
          } else {
            // 完全失败
            await browser.storage.local.set({
              'notion_sync_status': {
                id: syncId,
                status: 'error',
                success: false,
                message: '自动同步失败',
                error: result.errors ? result.errors.join('\n') : '未知错误',
                completedTime: Date.now()
              }
            });
          }
        } catch (error: any) {
          console.error('[AUTO_SYNC_ERROR] Error during automatic sync to Notion:', error);

          // 存储错误信息
          await browser.storage.local.set({
            'notion_sync_status': {
              id: syncId,
              status: 'error',
              success: false,
              message: '自动同步失败',
              error: error?.message || '自动同步过程中发生未知错误',
              completedTime: Date.now()
            }
          });
        }
      } else {
        console.log('Local data changed, but Notion sync (Local -> Notion) is disabled.');
      }
    }
  });
};

// Handle Gist auto-sync with debounce
const handleGistAutoSync = () => {
  if (gistSyncTimer) clearTimeout(gistSyncTimer)
  gistSyncTimer = setTimeout(async () => {
    try {
      const settings = await browser.storage.sync.get([
        GIST_STORAGE_KEYS.GITEE_AUTO_SYNC,
        GIST_STORAGE_KEYS.GITEE_TOKEN,
        GIST_STORAGE_KEYS.GITEE_GIST_ID,
        GIST_STORAGE_KEYS.GITEE_PUBLIC,
        GIST_STORAGE_KEYS.GITHUB_AUTO_SYNC,
        GIST_STORAGE_KEYS.GITHUB_TOKEN,
        GIST_STORAGE_KEYS.GITHUB_GIST_ID,
        GIST_STORAGE_KEYS.GITHUB_PUBLIC,
      ])

      const promptsResult = await browser.storage.local.get(BROWSER_STORAGE_KEY)
      const categoriesResult = await browser.storage.local.get(CATEGORIES_STORAGE_KEY)
      const prompts = (promptsResult[BROWSER_STORAGE_KEY] as PromptItem[]) || []
      const categories = (categoriesResult[CATEGORIES_STORAGE_KEY] as Category[]) || []
      const content = serializeToGistContent(prompts, categories)

      // Gitee auto-sync
      if (settings[GIST_STORAGE_KEYS.GITEE_AUTO_SYNC] && settings[GIST_STORAGE_KEYS.GITEE_TOKEN]) {
        syncToGistPlatform('gitee', settings[GIST_STORAGE_KEYS.GITEE_TOKEN], settings[GIST_STORAGE_KEYS.GITEE_GIST_ID], settings[GIST_STORAGE_KEYS.GITEE_PUBLIC] ?? false, content)
      }

      // GitHub auto-sync
      if (settings[GIST_STORAGE_KEYS.GITHUB_AUTO_SYNC] && settings[GIST_STORAGE_KEYS.GITHUB_TOKEN]) {
        syncToGistPlatform('github', settings[GIST_STORAGE_KEYS.GITHUB_TOKEN], settings[GIST_STORAGE_KEYS.GITHUB_GIST_ID], settings[GIST_STORAGE_KEYS.GITHUB_PUBLIC] ?? false, content)
      }
    } catch (error) {
      console.error('[GIST_AUTO_SYNC] Error:', error)
    }
  }, 3000)
}

const syncToGistPlatform = async (
  platform: 'gitee' | 'github',
  token: string,
  gistId: string | undefined,
  isPublic: boolean,
  content: string,
) => {
  const label = platform === 'gitee' ? 'Gitee' : 'GitHub'
  try {
    if (gistId) {
      const updateFn = platform === 'gitee' ? updateGiteeGist : updateGitHubGist
      await updateFn(token, gistId, content)
      console.log(`[GIST_AUTO_SYNC] ${label} Gist updated successfully`)
    } else {
      const findFn = platform === 'gitee' ? findGiteeGist : findGitHubGist
      const existing = await findFn(token)
      if (existing) {
        const updateFn = platform === 'gitee' ? updateGiteeGist : updateGitHubGist
        await updateFn(token, existing.id, content)
        const storageKey = platform === 'gitee' ? GIST_STORAGE_KEYS.GITEE_GIST_ID : GIST_STORAGE_KEYS.GITHUB_GIST_ID
        await browser.storage.sync.set({ [storageKey]: existing.id })
        console.log(`[GIST_AUTO_SYNC] ${label} Gist found and updated`)
      } else {
        const createFn = platform === 'gitee' ? createGiteeGist : createGitHubGist
        const newGist = await createFn(token, content, isPublic)
        const storageKey = platform === 'gitee' ? GIST_STORAGE_KEYS.GITEE_GIST_ID : GIST_STORAGE_KEYS.GITHUB_GIST_ID
        await browser.storage.sync.set({ [storageKey]: newGist.id })
        console.log(`[GIST_AUTO_SYNC] ${label} Gist created: ${newGist.id}`)
      }
    }
  } catch (error) {
    console.error(`[GIST_AUTO_SYNC] ${label} sync failed:`, error)
  }
}
