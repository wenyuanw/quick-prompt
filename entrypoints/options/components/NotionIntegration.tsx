import React, { useState, useEffect, useRef } from 'react';
import { Switch } from '@headlessui/react';
import { browser } from '#imports';

interface NotionIntegrationProps {
  // onSyncStatusChange 不再需要，因為總的同步開關已移除
}

const NotionIntegration: React.FC<NotionIntegrationProps> = () => {
  const [apiKey, setApiKey] = useState<string>('');
  const [databaseId, setDatabaseId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [testMessage, setTestMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isSyncToNotionEnabled, setIsSyncToNotionEnabled] = useState<boolean>(false); // 從本地到 Notion 的同步，默認關閉
  const messageTimerRef = useRef<number | null>(null);

  // 設置訊息並在指定時間後自動清除
  const showMessage = (type: 'success' | 'error', text: string, timeout: number = 2000) => {
    // 清除先前的計時器（如果有）
    if (messageTimerRef.current !== null) {
      window.clearTimeout(messageTimerRef.current);
      messageTimerRef.current = null;
    }
    
    // 設置新訊息
    setTestMessage({ type, text });
    
    // 設置新計時器
    messageTimerRef.current = window.setTimeout(() => {
      setTestMessage(null);
      messageTimerRef.current = null;
    }, timeout);
  };

  // 清理計時器
  useEffect(() => {
    return () => {
      if (messageTimerRef.current !== null) {
        window.clearTimeout(messageTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await browser.storage.sync.get([
          'notionApiKey',
          'notionDatabaseId',
          'notionSyncToNotionEnabled'
        ]);
        
        if (settings.notionApiKey) {
          setApiKey(settings.notionApiKey);
        }
        if (settings.notionDatabaseId) {
          setDatabaseId(settings.notionDatabaseId);
        }
        
        setIsSyncToNotionEnabled(settings.notionSyncToNotionEnabled !== undefined
          ? !!settings.notionSyncToNotionEnabled
          : false);
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading Notion settings:', error);
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const saveNotionApiKey = async (key: string): Promise<boolean> => {
    try { await browser.storage.sync.set({ notionApiKey: key }); return true; }
    catch (error) { console.error('Error saving API key:', error); return false; }
  };

  const saveNotionDatabaseId = async (id: string): Promise<boolean> => {
    try { await browser.storage.sync.set({ notionDatabaseId: id }); return true; }
    catch (error) { console.error('Error saving Database ID:', error); return false; }
  };

  const saveSyncToNotionEnabled = async (enabled: boolean): Promise<boolean> => {
    try { 
      await browser.storage.sync.set({ notionSyncToNotionEnabled: enabled }); 
      return true; 
    }
    catch (error) { console.error('Error saving sync to Notion status:', error); return false; }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 清除任何現有訊息和計時器
    if (messageTimerRef.current !== null) {
      window.clearTimeout(messageTimerRef.current);
      messageTimerRef.current = null;
    }
    setTestMessage(null);
    
    const apiKeySaved = await saveNotionApiKey(apiKey);
    const databaseIdSaved = await saveNotionDatabaseId(databaseId);
    const syncToNotionSaved = await saveSyncToNotionEnabled(isSyncToNotionEnabled);
    
    if (apiKeySaved && databaseIdSaved && syncToNotionSaved) {
      try {
        const response = await testNotionConnection(apiKey, databaseId);
        if (response.success) {
          showMessage('success', '連接成功！Notion 設置已保存並驗證。');
        } else {
          showMessage('error', `連接失敗: ${response.error}`);
        }
      } catch (error) {
        showMessage('error', '測試連接時發生錯誤，請檢查網絡連接。');
      }
    } else {
      showMessage('error', '保存部分設置時發生錯誤。');
    }
  };

  const testNotionConnection = async (key: string, dbId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
        method: 'GET', headers: { 'Authorization': `Bearer ${key}`, 'Notion-Version': '2022-06-28' }
      });
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.message || `API 回應錯誤: ${response.status}` };
      }
      return { success: true };
    } catch (error) {
      console.error('Error testing Notion connection:', error);
      return { success: false, error: error instanceof Error ? error.message : '未知錯誤' };
    }
  };

  const handleSyncToNotionToggle = async (enabled: boolean) => {
    setIsSyncToNotionEnabled(enabled);
    await saveSyncToNotionEnabled(enabled);
  };

  if (isLoading) return <div className="animate-pulse p-4">載入 Notion 設置中...</div>;

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Notion 整合</h2>
      
      <div className="mb-6 border-b pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-md font-medium text-gray-700 dark:text-gray-300">啟用同步到 Notion (本地 → Notion)</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">當本地提示詞變更時，自動更新到 Notion</p>
          </div>
          <Switch
            checked={isSyncToNotionEnabled}
            onChange={handleSyncToNotionToggle}
            className={`${isSyncToNotionEnabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}
          >
            <span className={`${isSyncToNotionEnabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}/>
          </Switch>
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notion API 密鑰</label>
          <input type="password" id="apiKey" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="secret_xxxxxxxxxxxxx" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"/>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">在 <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Notion 整合頁面</a> 創建一個新的整合並獲取 API 密鑰</p>
        </div>
        <div>
          <label htmlFor="databaseId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notion 數據庫 ID</label>
          <input type="text" id="databaseId" value={databaseId} onChange={(e) => setDatabaseId(e.target.value)} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"/>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">您可以從 Notion 數據庫頁面 URL 中獲取 ID</p>
        </div>
        {testMessage && <div className={`p-3 rounded ${testMessage.type === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-100' : 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-100'}`}>{testMessage.text}</div>}
        <div className="flex justify-end">
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800">保存設置 & 測試連接</button>
        </div>
      </form>
      
      <div className="mt-4 border-t pt-4 text-sm text-gray-500 dark:text-gray-400">
        <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">注意事項:</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>您的 API 密鑰將安全地存儲在瀏覽器同步存儲中。</li>
          <li>"同步到 Notion"會在您於插件中修改提示詞時，將變動推送到 Notion。</li>
          <li>您需要確保 Notion 整合具有對數據庫的讀取和寫入權限。</li>
        </ul>
      </div>
      
      <div className="mt-6 border-t pt-4">
        <h3 className="text-md font-medium text-gray-700 dark:text-gray-300 mb-3">手動同步操作</h3>
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">從 Notion 同步到本地</h4>
            <div className="flex space-x-2">
              <button 
                type="button"
                onClick={async () => {
                  try {
                    const response = await browser.runtime.sendMessage({ 
                      action: 'syncFromNotionToLocal', 
                      mode: 'replace' 
                    });
                    if (response && response.success) {
                      showMessage('success', '已成功從 Notion 覆蓋本地提示詞！');
                    } else {
                      showMessage('error', `同步失敗: ${response?.error || '未知錯誤'}`);
                    }
                  } catch (error) {
                    console.error('Error triggering Notion to local sync:', error);
                    showMessage('error', '觸發同步時發生錯誤');
                  }
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              >
                覆蓋本地數據
              </button>
              <button 
                type="button"
                onClick={async () => {
                  try {
                    const response = await browser.runtime.sendMessage({ 
                      action: 'syncFromNotionToLocal', 
                      mode: 'append' 
                    });
                    if (response && response.success) {
                      showMessage('success', '已成功將 Notion 提示詞追加到本地！');
                    } else {
                      showMessage('error', `同步失敗: ${response?.error || '未知錯誤'}`);
                    }
                  } catch (error) {
                    console.error('Error triggering Notion to local sync:', error);
                    showMessage('error', '觸發同步時發生錯誤');
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              >
                追加到本地
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              <strong>覆蓋模式</strong>：完全用 Notion 數據替換本地數據（會刪除本地獨有的提示詞）<br/>
              <strong>追加模式</strong>：只添加 Notion 中有但本地沒有的提示詞（安全模式）<br/>
              <span className="text-red-500 font-medium">注意：這是一次性操作</span>
            </p>
          </div>
          
          <div className="pt-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">從本地同步到 Notion</h4>
            <button 
              type="button"
              onClick={async () => {
                try {
                  const response = await browser.runtime.sendMessage({ action: 'syncLocalToNotion' });
                  if (response && response.success) {
                    showMessage('success', '已成功將本地提示詞同步到 Notion！');
                  } else {
                    showMessage('error', `同步失敗: ${response?.error || '未知錯誤'}`);
                  }
                } catch (error) {
                  console.error('Error triggering local to Notion sync:', error);
                  showMessage('error', '觸發同步時發生錯誤');
                }
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            >
              同步到 Notion
            </button>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              此操作會將本地提示詞同步到 Notion，包括：<br/>
              - 創建 Notion 中不存在的提示詞<br/>
              - 更新 Notion 中已存在但內容有變化的提示詞<br/>
              - 處理已在本地刪除的提示詞（在 Notion 中歸檔）<br/>
              <span className="text-red-500 font-medium">注意：這是一次性操作</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotionIntegration; 