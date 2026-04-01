import React, { useState, useEffect, useRef } from "react";
import { Switch } from "@headlessui/react";
import { browser } from "#imports";
import { t } from "../../../utils/i18n";

interface NotionIntegrationProps {
  // 不需要额外的props
}

// 定义同步状态的类型
interface SyncStatus {
  id: string;
  status: "in_progress" | "success" | "error";
  startTime?: number;
  completedTime?: number;
  message?: string;
  error?: string;
  success?: boolean;
}

const NotionIntegration: React.FC<NotionIntegrationProps> = () => {
  const [apiKey, setApiKey] = useState<string>("");
  const [databaseId, setDatabaseId] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [testMessage, setTestMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [isSyncToNotionEnabled, setIsSyncToNotionEnabled] =
    useState<boolean>(false);
  const messageTimeoutRef = useRef<number | null>(null);

  // 新增状态：跟踪同步ID和轮询定时器
  const [currentSyncId, setCurrentSyncId] = useState<string | null>(null);
  const syncCheckIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    loadSettings();
    clearTemporaryMessages();
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
      setIsLoading(true);
      const result = await browser.storage.sync.get([
        "notionApiKey",
        "notionDatabaseId",
        "notionSyncToNotionEnabled",
      ]);
      setApiKey(result.notionApiKey || "");
      setDatabaseId(result.notionDatabaseId || "");
      setIsSyncToNotionEnabled(result.notionSyncToNotionEnabled ?? false);
    } catch (error) {
      console.error(t("loadSettingsError"), error);
    } finally {
      setIsLoading(false);
    }
  };

  const clearTemporaryMessages = async () => {
    try {
      console.log('Clearing temporary messages...');
      // 获取所有本地存储的数据
      const allData = await browser.storage.local.get(null);
      const keysToRemove: string[] = [];

      // 查找所有临时消息键和同步状态键
      Object.keys(allData).forEach(key => {
        if (key.startsWith('temp_notion_message_') || 
            key === 'notion_sync_status' || 
            key === 'notion_from_sync_status') {
          keysToRemove.push(key);
        }
      });

      // 删除所有临时消息和同步状态
      if (keysToRemove.length > 0) {
        await browser.storage.local.remove(keysToRemove);
        console.log(`清理了 ${keysToRemove.length} 个临时消息和同步状态`);
      }
    } catch (error) {
      console.error('清理临时消息和同步状态时出错:', error);
    }
  };

  const showMessage = (type: "success" | "error" | "info", text: string) => {
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
    if (type === "success" || type === "error") {
      const statusKey = `temp_notion_message_${Date.now()}`;
      const statusValue = {
        id: `message_${Date.now()}`,
        status: type === "success" ? "success" : "error",
        message: text,
        completedTime: Date.now(),
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
      console.error("Error saving Notion sync setting:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey || !databaseId) {
      showMessage("error", t("fillAPIKeyAndDatabaseID"));
      return;
    }
    try {
      // 测试连接
      const testResult = await testNotionConnection(apiKey, databaseId);

      if (testResult.success) {
        // 保存设置
        await browser.storage.sync.set({
          notionApiKey: apiKey,
          notionDatabaseId: databaseId,
        });
        showMessage("success", t("connectionSuccessNotionSaved"));
      } else {
        showMessage("error", testResult.error || t("testConnectionError"));
      }
    } catch (error) {
      console.error(t("saveSettingsError"), error);
      showMessage("error", t("testConnectionError"));
    }
  };

  const testNotionConnection = async (
    key: string,
    dbId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(
        `https://api.notion.com/v1/databases/${dbId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${key}`,
            "Notion-Version": "2022-06-28",
          },
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        console.error(t("notionConnectionFailed"), errorData.message);
        return {
          success: false,
          error: errorData.message || t("notionConnectionFailed")
        };
      }
      console.log(t("notionConnectionSuccessful"));
      return { success: true };
    } catch (error) {
      console.error(t("testConnectionError"), error);
      return {
        success: false,
        error: t("testConnectionError"),
      };
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
        const result = (await browser.storage.local.get(storageKey)) as {
          [key: string]: SyncStatus;
        };
        const syncStatus = result[storageKey];

        if (syncStatus && syncStatus.id === syncId) {
          if (
            syncStatus.status === "success" ||
            syncStatus.status === "error"
          ) {
            // 不再显示消息，只清理本地状态
            clearInterval(syncCheckIntervalRef.current!);
            syncCheckIntervalRef.current = null;
            setCurrentSyncId(null);
            // 不再立即清除存储中的状态，让ToastContainer处理
          } else if (syncStatus.status === "in_progress") {
            // 仍在进行中，继续轮询，但不显示消息
            console.log(`Sync ID ${syncId} is still in progress...`);
          }
        } else {
          // 当前 syncStatus 已经被清除，说明同步已经完成
          clearInterval(syncCheckIntervalRef.current!);
          syncCheckIntervalRef.current = null;
          setCurrentSyncId(null);
        }
      } catch (error) {
        console.error("Error polling sync status:", error);
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
      showMessage(
        "error",
        t("notionAPIKeyOrDatabaseNotConfigured")
      );
      return;
    }

    if (currentSyncId) {
      showMessage("info", t("syncTaskInProgress"));
      return;
    }
    try {
      // 只在界面上显示info消息，不将其保存到storage
      showMessage("info", t("startingSyncToNotion"));

      const response = await browser.runtime.sendMessage({
        action: "syncToNotion",
        forceSync: true,
      });

      console.log(t('receivedSyncStartResponse'), response);

      if (response && response.syncInProgress && response.syncId) {
        // 直接将同步状态设置为in_progress，让ToastContainer显示loading状态
        await browser.storage.local.set({
          notion_sync_status: {
            id: response.syncId,
            status: "in_progress",
            message: t("syncingToNotionMessage"),
            startTime: Date.now(),
          },
        });

        // 启动轮询检查同步状态
        startSyncStatusPolling(response.syncId, "notion_sync_status");
      } else {
        showMessage("error", `${t("syncStartFailed")}: ${response?.error || t("unknownError")}`);
      }
    } catch (error) {
      console.error("Error triggering local to Notion sync:", error);
      showMessage("error", t("errorTriggeringSyncToNotion"));
    }
  };

  // 修改从Notion同步（覆盖）的按钮点击处理函数
  const handleSyncFromNotionReplaceClick = async () => {
    // 检查是否已配置Notion
    if (!apiKey || !databaseId) {
      showMessage(
        "error",
        t("notionAPIKeyOrDatabaseNotConfigured")
      );
      return;
    }

    if (currentSyncId) {
      showMessage("info", t("syncTaskInProgress"));
      return;
    }
    try {
      // 只在界面上显示info消息，不将其保存到storage
      showMessage("info", t("startingNotionOverwriteSync"));

      const response = await browser.runtime.sendMessage({
        action: "syncFromNotion",
        mode: "replace",
      });
      console.log(t('receivedNotionOverwriteSyncResponse'), response);

      if (response && response.syncInProgress && response.syncId) {
        // 直接将同步状态设置为in_progress，让ToastContainer显示loading状态
        await browser.storage.local.set({
          notion_from_sync_status: {
            id: response.syncId,
            status: "in_progress",
            message: t("syncingFromNotionOverwriteMessage"),
            startTime: Date.now(),
          },
        });

        // 启动轮询检查同步状态
        startSyncStatusPolling(response.syncId, "notion_from_sync_status");
      } else {
        showMessage("error", `${t("syncStartFailed")}: ${response?.error || t("unknownError")}`);
      }
    } catch (error) {
      console.error("Error triggering Notion to local sync (replace):", error);
      showMessage("error", t("errorTriggeringNotionOverwriteSync"));
    }
  };

  // 修改从Notion同步（追加）的按钮点击处理函数
  const handleSyncFromNotionAppendClick = async () => {
    // 检查是否已配置Notion
    if (!apiKey || !databaseId) {
      showMessage(
        "error",
        t("notionAPIKeyOrDatabaseNotConfigured")
      );
      return;
    }

    if (currentSyncId) {
      showMessage("info", t("syncTaskInProgress"));
      return;
    }
    try {
      // 只在界面上显示info消息，不将其保存到storage
      showMessage("info", t("startingNotionAppendSync"));

      const response = await browser.runtime.sendMessage({
        action: "syncFromNotion",
        mode: "append",
      });
      console.log(t('receivedNotionAppendSyncResponse'), response);

      if (response && response.syncInProgress && response.syncId) {
        // 直接将同步状态设置为in_progress，让ToastContainer显示loading状态
        await browser.storage.local.set({
          notion_from_sync_status: {
            id: response.syncId,
            status: "in_progress",
            message: t("syncingFromNotionAppendMessage"),
            startTime: Date.now(),
          },
        });

        // 启动轮询检查同步状态
        startSyncStatusPolling(response.syncId, "notion_from_sync_status");
      } else {
        showMessage("error", `${t("syncStartFailed")}: ${response?.error || t("unknownError")}`);
      }
    } catch (error) {
      console.error("Error triggering Notion to local sync (append):", error);
      showMessage("error", t("errorTriggeringNotionAppendSync"));
    }
  };

  if (isLoading)
    return (
      <div className="flex justify-center py-12">
        <svg className="animate-spin h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );

  const Spinner = () => (
    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );

  return (
    <div>
      {/* Message */}
      {testMessage && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            testMessage.type === "success"
              ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
              : testMessage.type === "error"
                ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
                : "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
          }`}
        >
          {testMessage.text}
        </div>
      )}

      {/* Configuration */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t("basicSettings")}
          </h3>
          <a
            href="https://github.com/wenyuanw/quick-prompt/blob/main/docs/notion-sync-guide.md"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t("configurationGuide")}
          </a>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("notionAPIKey")}
            </label>
            <input
              type="password"
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t("notionAPIKeyPlaceholder")}
              required
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              {t("notionAPIKeyHelp")}{" "}
              <a
                href="https://www.notion.so/my-integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {t("notionIntegrationsPage")}
              </a>{" "}
              {t("notionAPIKeyHelp2")}
            </p>
          </div>

          <div>
            <label htmlFor="databaseId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("notionDatabaseID")}
            </label>
            <input
              type="text"
              id="databaseId"
              value={databaseId}
              onChange={(e) => setDatabaseId(e.target.value)}
              placeholder={t("notionDatabaseIDPlaceholder")}
              required
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              {t("notionDatabaseIDHelp")}
            </p>
          </div>

          <button
            type="submit"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            {t("saveSettingsAndTest")}
          </button>
        </form>
      </div>

      {/* Options */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {t("enableAutoSync")}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {t("autoSyncDescription")}
            </p>
          </div>
          <Switch
            checked={isSyncToNotionEnabled}
            onChange={handleSyncToNotionToggle}
            className={`${
              isSyncToNotionEnabled ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-600"
            } relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800`}
          >
            <span className="sr-only">{t("enableSync")}</span>
            <span
              className={`${
                isSyncToNotionEnabled ? "translate-x-5" : "translate-x-1"
              } inline-block h-3 w-3 transform rounded-full bg-white transition-transform`}
            />
          </Switch>
        </div>
      </div>

      {/* Sync Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Upload */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            {t("syncFromLocalToNotion")}
          </h4>
          <button
            type="button"
            onClick={handleSyncToNotionClick}
            disabled={currentSyncId !== null}
            className="w-full flex justify-center items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {currentSyncId !== null ? <Spinner /> : <><svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>{t("syncToNotion")}</>}
          </button>
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            <p className="mb-1">{t("syncToNotionDescription")}</p>
            <ul className="pl-4 list-disc space-y-0.5">
              <li>{t("createMissingPrompts")}</li>
              <li>{t("updateChangedPrompts")}</li>
              <li>{t("markDeletedPrompts")}</li>
            </ul>
          </div>
        </div>

        {/* Download */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            {t("syncFromNotionToLocal")}
          </h4>
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleSyncFromNotionAppendClick}
              disabled={currentSyncId !== null}
              className="w-full flex justify-center items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {currentSyncId !== null ? <Spinner /> : <><svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>{t("appendToLocal")}</>}
            </button>
            <button
              type="button"
              onClick={handleSyncFromNotionReplaceClick}
              disabled={currentSyncId !== null}
              className="w-full flex justify-center items-center px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-white dark:bg-gray-700 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {currentSyncId !== null ? <Spinner /> : <><svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>{t("overwriteLocalData")}</>}
            </button>
          </div>
          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <p>
              <span className="font-medium text-green-600 dark:text-green-400">{t("appendMode")}</span>{" "}
              {t("appendModeDescription")}
            </p>
            <p>
              <span className="font-medium text-red-600 dark:text-red-400">{t("overwriteMode")}</span>{" "}
              {t("overwriteModeDescription")}
            </p>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <p>• {t("apiKeyStorageNote")}</p>
        <p>• {t("permissionsNote")}</p>
        <p>• {t("oneTimeOperationNote")}</p>
      </div>
    </div>
  );
};

export default NotionIntegration;
