import React, { useState, useEffect, useRef } from "react";
import { Switch } from "@headlessui/react";
import { browser } from "#imports";
import NotionLogo from "./NotionLogo";
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
        "syncToNotionEnabled",
      ]);
      setApiKey(result.notionApiKey || "");
      setDatabaseId(result.notionDatabaseId || "");
      setIsSyncToNotionEnabled(result.syncToNotionEnabled || false);
    } catch (error) {
      console.error(t("loadSettingsError"), error);
    } finally {
      setIsLoading(false);
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
      await browser.storage.sync.set({ syncToNotionEnabled: enabled });
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
      const response = await browser.runtime.sendMessage({
        action: "testNotionConnection",
        apiKey: key,
        databaseId: dbId,
      });

      if (response.success) {
        console.log(t("notionConnectionSuccessful"));
        return { success: true };
      } else {
        console.error(t("notionConnectionFailed"), response.error);
        return {
          success: false,
          error: response.error || t("invalidNotionAPIKeyOrDatabase"),
        };
      }
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
      <div className="p-4 font-medium text-center animate-pulse">
        {t("loadingNotionSettings")}
      </div>
    );

  return (
    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 shadow-xl rounded-2xl p-8 mx-auto max-w-6xl">
      {testMessage && (
        <div
          className={`mb-6 p-4 rounded-md border-l-4 shadow-sm ${
            testMessage.type === "success"
              ? "bg-green-50 border-green-500 text-green-800 dark:bg-green-900/30 dark:text-green-200 dark:border-green-500"
              : testMessage.type === "error"
              ? "bg-red-50 border-red-500 text-red-800 dark:bg-red-900/30 dark:text-red-200 dark:border-red-500"
              : "bg-blue-50 border-blue-500 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-500"
          } flex items-center`}
        >
          <span
            className={`mr-2 flex-shrink-0 ${
              testMessage.type === "success"
                ? "text-green-600"
                : testMessage.type === "error"
                ? "text-red-600"
                : "text-blue-600"
            }`}
          >
            {testMessage.type === "success" ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            ) : testMessage.type === "error" ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </span>
          <span className="flex-1">{testMessage.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 mb-8 md:grid-cols-3">
        <div className="md:col-span-2 p-6 space-y-5 bg-gray-50/80 dark:bg-gray-700/80 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-600/50 shadow-lg">
          <form onSubmit={handleSubmit} className="">
            <div className="pb-4 mb-4">
              <div className="flex justify-between items-center">
                <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-200">
                  {t("basicSettings")}
                </h3>
                <a
                  href="https://github.com/wenyuanw/quick-prompt/blob/main/docs/notion-sync-guide.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-800/40 px-3 py-1.5 rounded-full transition-colors font-medium"
                >
                  <svg
                    className="w-4 h-4 mr-1.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    ></path>
                  </svg>
                  {t("configurationGuide")}
                </a>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label
                    htmlFor="apiKey"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("notionAPIKey")}
                  </label>
                  <input
                    type="password"
                    id="apiKey"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={t("notionAPIKeyPlaceholder")}
                    required
                    className="block px-3 py-2 mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
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

                <div className="space-y-1">
                  <label
                    htmlFor="databaseId"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("notionDatabaseID")}
                  </label>
                  <input
                    type="text"
                    id="databaseId"
                    value={databaseId}
                    onChange={(e) => setDatabaseId(e.target.value)}
                    placeholder={t("notionDatabaseIDPlaceholder")}
                    required
                    className="block px-3 py-2 mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {t("notionDatabaseIDHelp")}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="flex items-center px-4 py-2 font-medium text-white bg-blue-600 rounded-md transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              >
                <svg
                  className="w-4 h-4 mr-1.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {t("saveSettingsAndTest")}
              </button>
            </div>
          </form>
        </div>

        <div className="flex flex-col p-6 bg-gray-50/80 dark:bg-gray-700/80 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-600/50 shadow-lg">
          <h3 className="pb-2 mb-3 text-lg font-semibold text-gray-800">
            {t("autoSyncSettings")}
          </h3>

          <div className="flex justify-between items-center mb-3">
            <div>
              <h4 className="font-medium text-gray-700 text-md dark:text-gray-300">
                {t("enableAutoSync")}
              </h4>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("autoSyncDescription")}
              </p>
            </div>
            <Switch
              checked={isSyncToNotionEnabled}
              onChange={handleSyncToNotionToggle}
              className={`${
                isSyncToNotionEnabled
                  ? "bg-blue-600"
                  : "bg-gray-200 dark:bg-gray-700"
              } 
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800`}
            >
              <span className="sr-only">{t("enableSync")}</span>
              <span
                className={`${
                  isSyncToNotionEnabled ? "translate-x-6" : "translate-x-1"
                } 
                inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
              />
            </Switch>
          </div>

          <div className="mt-4 p-3 text-xs text-gray-600 bg-white/70 dark:bg-gray-700/70 backdrop-blur-sm rounded-md border border-gray-200/50 dark:border-gray-600/50 shadow-sm dark:text-gray-400">
            <h4 className="mb-2 font-medium text-gray-700 dark:text-gray-300">
              {t("importantNotes")}
            </h4>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>{t("apiKeyStorageNote")}</li>
              <li>{t("permissionsNote")}</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 mb-6 md:grid-cols-2">
        <div className="p-6 bg-indigo-50/80 dark:bg-indigo-900/30 backdrop-blur-sm rounded-xl border border-indigo-200/50 dark:border-indigo-800/50 shadow-lg">
          <div className="flex items-center mb-4">
            <svg
              className="mr-2 w-5 h-5 text-indigo-600 dark:text-indigo-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z"
                clipRule="evenodd"
              />
            </svg>
            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              {t("syncFromNotionToLocal")}
            </h4>
          </div>

          <div className="mb-4 space-y-3">
            <button
              type="button"
              onClick={handleSyncFromNotionReplaceClick}
              disabled={currentSyncId !== null}
              className="flex justify-center items-center px-4 py-2 w-full font-medium text-white bg-red-600 rounded-md transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              {t("overwriteLocalData")}
            </button>
            <button
              type="button"
              onClick={handleSyncFromNotionAppendClick}
              disabled={currentSyncId !== null}
              className="flex justify-center items-center px-4 py-2 w-full font-medium text-white bg-blue-600 rounded-md transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              {t("appendToLocal")}
            </button>
          </div>

          <div className="p-3 text-xs text-gray-600 bg-white/70 dark:bg-gray-700/70 backdrop-blur-sm rounded-md border border-gray-200/50 dark:border-gray-600/50 shadow-sm dark:text-gray-400">
            <div className="mb-1.5">
              <span className="inline-block bg-blue-100 dark:bg-blue-800/60 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 rounded font-semibold text-xs mr-1">
                {t("appendMode")}
              </span>
              {t("appendModeDescription")}
            </div>
            <div className="mb-1.5">
              <span className="inline-block bg-red-100 dark:bg-red-800/60 text-red-800 dark:text-red-200 px-1.5 py-0.5 rounded font-semibold text-xs mr-1">
                {t("overwriteMode")}
              </span>
              {t("overwriteModeDescription")}
            </div>
            <div className="flex items-center mt-2 text-xs font-medium text-red-600 dark:text-red-400">
              <svg
                className="w-3.5 h-3.5 mr-1"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              {t("oneTimeOperationNote")}
            </div>
          </div>
        </div>

        <div className="p-6 bg-green-50/80 dark:bg-green-900/30 backdrop-blur-sm rounded-xl border border-green-200/50 dark:border-green-800/50 shadow-lg">
          <div className="flex items-center mb-4">
            <svg
              className="mr-2 w-5 h-5 text-green-600 dark:text-green-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z"
                clipRule="evenodd"
              />
            </svg>
            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              {t("syncFromLocalToNotion")}
            </h4>
          </div>

          <div className="mb-4">
            <button
              type="button"
              onClick={handleSyncToNotionClick}
              disabled={currentSyncId !== null}
              className="flex justify-center items-center px-4 py-2 w-full font-medium text-white bg-green-600 rounded-md transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {t("syncToNotion")}
            </button>
          </div>

          <div className="p-3 text-xs text-gray-600 bg-white/70 dark:bg-gray-700/70 backdrop-blur-sm rounded-md border border-gray-200/50 dark:border-gray-600/50 shadow-sm dark:text-gray-400">
            <div className="mb-2">
              {t("syncToNotionDescription")}
            </div>
            <ul className="pl-5 space-y-1 list-disc">
              <li>{t("createMissingPrompts")}</li>
              <li>{t("updateChangedPrompts")}</li>
              <li>{t("markDeletedPrompts")}</li>
            </ul>
            <div className="flex items-center mt-2 text-xs font-medium text-red-600 dark:text-red-400">
              <svg
                className="w-3.5 h-3.5 mr-1"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              {t("oneTimeOperationNote")}
            </div>
          </div>
        </div>
      </div>

      {currentSyncId && (
        <div className="flex fixed right-4 bottom-4 items-center px-4 py-2 text-white bg-blue-600 rounded-md shadow-lg">
          <svg
            className="mr-2 -ml-1 w-4 h-4 text-white animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          {t("syncInProgress")}
        </div>
      )}
    </div>
  );
};

export default NotionIntegration;
