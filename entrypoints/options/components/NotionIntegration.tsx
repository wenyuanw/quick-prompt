import React, { useState, useEffect, useRef } from 'react';
import { Switch } from '@headlessui/react';
import { browser } from '#imports';

interface NotionIntegrationProps {
  // 不需要额外的props
}

// 定义同步状态的类型
interface SyncStatus {
  id: string;
  status: 'in_progress' | 'success' | 'error';
  startTime?: number;
  completedTime?: number;
  message?: string;
  error?: string;
  success?: boolean;
}

const NotionIntegration: React.FC<NotionIntegrationProps> = () => {
  const [apiKey, setApiKey] = useState<string>('');
  const [databaseId, setDatabaseId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [testMessage, setTestMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  const [isSyncToNotionEnabled, setIsSyncToNotionEnabled] = useState<boolean>(false);
  const messageTimeoutRef = useRef<number | null>(null);
  
  // 新增状态：跟踪同步ID和轮询定时器
  const [currentSyncId, setCurrentSyncId] = useState<string | null>(null);
  const syncCheckIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    loadSettings();
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
      // 清理轮询定时器
      if (syncCheckIntervalRef.current) {
        clearInterval(syncCheckIntervalRef.current);
      }
    };
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await browser.storage.sync.get([
        'notionApiKey',
        'notionDatabaseId',
        'notionSyncToNotionEnabled'
      ]);

      setApiKey(settings.notionApiKey || '');
      setDatabaseId(settings.notionDatabaseId || '');
      setIsSyncToNotionEnabled(settings.notionSyncToNotionEnabled !== undefined 
        ? !!settings.notionSyncToNotionEnabled 
        : false
      );
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading Notion settings:', error);
      setIsLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    // 先设置本地状态
    setTestMessage({ type, text });
    
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }
    
    messageTimeoutRef.current = window.setTimeout(() => {
      setTestMessage(null);
      messageTimeoutRef.current = null;
    }, 5000);
    
    // 只有成功和错误消息才保存到storage，显示为Toast
    if (type === 'success' || type === 'error') {
      const statusKey = `temp_notion_message_${Date.now()}`;
      const statusValue = {
        id: `message_${Date.now()}`,
        status: type === 'success' ? 'success' : 'error',
        message: text,
        completedTime: Date.now()
      };
      
      browser.storage.local.set({ [statusKey]: statusValue }).then(() => {
        // 5秒后自动删除临时消息
        setTimeout(() => {
          browser.storage.local.remove(statusKey);
        }, 5000);
      });
    }
  };

  const saveSyncToNotionEnabled = async (enabled: boolean) => {
    try {
      await browser.storage.sync.set({ notionSyncToNotionEnabled: enabled });
    } catch (error) {
      console.error('Error saving Notion sync setting:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 验证输入
    if (!apiKey || !databaseId) {
      showMessage('error', '请填写 API 密钥和数据库 ID');
      return;
    }
    
    try {
      // 保存设置
      await browser.storage.sync.set({
        notionApiKey: apiKey,
        notionDatabaseId: databaseId
      });
      
      // 测试连接
      const testResult = await testNotionConnection(apiKey, databaseId);
      
      if (testResult.success) {
        showMessage('success', '连接成功! Notion 设置已保存。');
      } else {
        showMessage('error', `连接失败: ${testResult.error}`);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      showMessage('error', '保存设置时发生错误');
    }
  };

  const testNotionConnection = async (key: string, dbId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
        method: 'GET', headers: { 'Authorization': `Bearer ${key}`, 'Notion-Version': '2022-06-28' }
      });
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.message || `API 返回错误: ${response.status}` };
      }
      return { success: true };
    } catch (error) {
      console.error('Error testing Notion connection:', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  };

  const handleSyncToNotionToggle = async (enabled: boolean) => {
    setIsSyncToNotionEnabled(enabled);
    await saveSyncToNotionEnabled(enabled);
  };

  // 修改startSyncStatusPolling函数
  const startSyncStatusPolling = (syncId: string, storageKey: string) => {
    if (syncCheckIntervalRef.current) {
      clearInterval(syncCheckIntervalRef.current);
    }
    setCurrentSyncId(syncId);

    syncCheckIntervalRef.current = window.setInterval(async () => {
      try {
        const result = await browser.storage.local.get(storageKey) as { [key: string]: SyncStatus };
        const syncStatus = result[storageKey];

        if (syncStatus && syncStatus.id === syncId) {
          if (syncStatus.status === 'success' || syncStatus.status === 'error') {
            // 不再显示消息，只清理本地状态
            clearInterval(syncCheckIntervalRef.current!);
            syncCheckIntervalRef.current = null;
            setCurrentSyncId(null);
            // 不再立即清除存储中的状态，让ToastContainer处理
          } else if (syncStatus.status === 'in_progress'){
            // 仍在进行中，继续轮询，但不显示消息
            console.log(`Sync ID ${syncId} is still in progress...`);
          }
        }
      } catch (error) {
        console.error('Error polling sync status:', error);
        clearInterval(syncCheckIntervalRef.current!);
        syncCheckIntervalRef.current = null;
        setCurrentSyncId(null);
      }
    }, 2000); // 每2秒检查一次
  };
  
  // 修改同步到Notion的按钮点击处理函数
  const handleSyncToNotionClick = async () => {
    // 检查是否已配置Notion
    if (!apiKey || !databaseId) {
      showMessage('error', 'Notion API密钥或数据库ID未配置，无法同步。请先完成配置。');
      return;
    }

    if (currentSyncId) {
      showMessage('info', '已有同步任务正在进行中，请稍候。');
      return;
    }
    try {
      // 只在界面上显示info消息，不将其保存到storage
      showMessage('info', '正在启动同步到Notion，请稍候...');
      
      const response = await browser.runtime.sendMessage({ 
        action: 'syncToNotion',
        forceSync: true 
      });
      console.log('收到同步启动响应:', response);
      
      if (response && response.syncInProgress && response.syncId) {
        // 直接将同步状态设置为in_progress，让ToastContainer显示loading状态
        await browser.storage.local.set({
          'notion_sync_status': {
            id: response.syncId,
            status: 'in_progress',
            message: '正在同步到Notion，请稍候...',
            startTime: Date.now()
          }
        });
        
        // 启动轮询检查同步状态
        startSyncStatusPolling(response.syncId, 'notion_sync_status');
      } else {
        showMessage('error', `启动同步失败: ${response?.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Error triggering local to Notion sync:', error);
      showMessage('error', '触发同步到Notion时发生错误');
    }
  };

  // 修改从Notion同步（覆盖）的按钮点击处理函数
  const handleSyncFromNotionReplaceClick = async () => {
    // 检查是否已配置Notion
    if (!apiKey || !databaseId) {
      showMessage('error', 'Notion API密钥或数据库ID未配置，无法同步。请先完成配置。');
      return;
    }

    if (currentSyncId) {
      showMessage('info', '已有同步任务正在进行中，请稍候。');
      return;
    }
    try {
      // 只在界面上显示info消息，不将其保存到storage
      showMessage('info', '正在启动从Notion覆盖本地数据，请稍候...');
      
      const response = await browser.runtime.sendMessage({
        action: 'syncFromNotion',
        mode: 'replace' 
      });
      console.log('收到从Notion覆盖同步启动响应:', response);
      
      if (response && response.syncInProgress && response.syncId) {
        // 直接将同步状态设置为in_progress，让ToastContainer显示loading状态
        await browser.storage.local.set({
          'notion_from_sync_status': {
            id: response.syncId,
            status: 'in_progress',
            message: '正在从Notion覆盖同步到本地，请稍候...',
            startTime: Date.now()
          }
        });
        
        // 启动轮询检查同步状态
        startSyncStatusPolling(response.syncId, 'notion_from_sync_status');
      } else {
        showMessage('error', `启动同步失败: ${response?.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Error triggering Notion to local sync (replace):', error);
      showMessage('error', '触发从Notion覆盖同步时发生错误');
    }
  };

  // 修改从Notion同步（追加）的按钮点击处理函数
  const handleSyncFromNotionAppendClick = async () => {
    // 检查是否已配置Notion
    if (!apiKey || !databaseId) {
      showMessage('error', 'Notion API密钥或数据库ID未配置，无法同步。请先完成配置。');
      return;
    }

    if (currentSyncId) {
      showMessage('info', '已有同步任务正在进行中，请稍候。');
      return;
    }
    try {
      // 只在界面上显示info消息，不将其保存到storage
      showMessage('info', '正在启动从Notion追加数据到本地，请稍候...');
      
      const response = await browser.runtime.sendMessage({
        action: 'syncFromNotion',
        mode: 'append'
      });
      console.log('收到从Notion追加同步启动响应:', response);
      
      if (response && response.syncInProgress && response.syncId) {
        // 直接将同步状态设置为in_progress，让ToastContainer显示loading状态
        await browser.storage.local.set({
          'notion_from_sync_status': {
            id: response.syncId,
            status: 'in_progress',
            message: '正在从Notion追加同步到本地，请稍候...',
            startTime: Date.now()
          }
        });
        
        // 启动轮询检查同步状态
        startSyncStatusPolling(response.syncId, 'notion_from_sync_status');
      } else {
        showMessage('error', `启动同步失败: ${response?.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Error triggering Notion to local sync (append):', error);
      showMessage('error', '触发从Notion追加同步时发生错误');
    }
  };

  if (isLoading) return <div className="animate-pulse p-4">加载 Notion 设置中...</div>;

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Notion 整合</h2>
        <a 
          href="https://gist.github.com/Alphamancer/4d0b76311d71225ac1fb85d11e82cdef"
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          查看配置指南
        </a>
      </div>
      
      <div className="mb-6 border-b pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-md font-medium text-gray-700 dark:text-gray-300">启用同步到 Notion (本地 → Notion)</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">当本地提示词变更时，自动更新到 Notion</p>
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
          <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notion API 密钥</label>
          <input 
            type="password" 
            id="apiKey" 
            value={apiKey} 
            onChange={(e) => setApiKey(e.target.value)} 
            placeholder="secret_xxxxxxxxxxxxx" 
            required 
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">在 <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Notion 整合页面</a> 创建一个新的整合并获取 API 密钥</p>
        </div>
        <div>
          <label htmlFor="databaseId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notion 数据库 ID</label>
          <input 
            type="text" 
            id="databaseId" 
            value={databaseId} 
            onChange={(e) => setDatabaseId(e.target.value)} 
            placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" 
            required 
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">您可以从 Notion 数据库页面 URL 中提取 ID</p>
        </div>
        <div className="flex justify-end">
          <button 
            type="submit" 
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
          >
            保存设置 & 测试连接
          </button>
        </div>
      </form>

      <div className="mt-4 border-t pt-4 text-sm text-gray-500 dark:text-gray-400">
        <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">注意事项:</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>您的 API 密钥将安全地存储在浏览器同步存储中。</li>
          <li>"同步到 Notion"会在您于插件中修改提示词时，将变动推送到 Notion。</li>
          <li>您需要确保 Notion 整合具有对数据库的读取和写入权限。</li>
        </ul>
      </div>

      <div className="mt-6 border-t pt-4">
        <h3 className="text-md font-medium text-gray-700 dark:text-gray-300 mb-3">手动同步操作</h3>
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">从 Notion 同步到本地</h4>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={handleSyncFromNotionReplaceClick}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              >
                覆盖本地数据
              </button>
              <button
                type="button"
                onClick={handleSyncFromNotionAppendClick}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              >
                追加到本地
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              <strong>覆盖模式</strong>：完全用 Notion 数据替换本地数据（会删除本地独有的提示词）<br/>
              <strong>追加模式</strong>：只添加 Notion 中有但本地没有的提示词（安全模式）<br/>
              <span className="text-red-500 font-medium">注意：这是一次性操作</span>
            </p>
          </div>

          <div className="pt-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">从本地同步到 Notion</h4>
            <button
              type="button"
              onClick={handleSyncToNotionClick}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            >
              同步到 Notion
            </button>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              此操作会将本地提示词同步到 Notion，包括：<br/>
              - 创建 Notion 中不存在的提示词<br/>
              - 更新 Notion 中已存在但内容有变化的提示词<br/>
              - 处理已在本地删除的提示词（在 Notion 中标记）<br/>
              <span className="text-red-500 font-medium">注意：这是一次性操作</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotionIntegration; 