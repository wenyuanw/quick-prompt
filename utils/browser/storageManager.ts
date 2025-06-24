import { BROWSER_STORAGE_KEY } from "@/utils/constants"
import { syncLocalDataToNotion } from "@/utils/sync/notionSync"

// Setup storage change listeners for auto-sync
export const setupStorageChangeListeners = (): void => {
  // Added: storage.onChanged listener for auto-sync Local -> Notion
  browser.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'local' && changes[BROWSER_STORAGE_KEY]) {
      console.log('Local prompts data changed, checking if Notion sync (Local -> Notion) is needed...');
      const syncSettings = await browser.storage.sync.get('notionSyncToNotionEnabled');
      if (syncSettings.notionSyncToNotionEnabled) {
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
