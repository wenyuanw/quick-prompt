import React, { useState, useEffect, useRef } from "react";
import { Switch } from "@headlessui/react";
import { browser } from "#imports";
import { t } from "../../../utils/i18n";
import { BROWSER_STORAGE_KEY } from "@/utils/constants";
import type { PromptItem, Category } from "@/utils/types";
import {
  GIST_STORAGE_KEYS,
  serializeToGistContent,
  deserializeFromGistContent,
  GIST_FILENAME,
  buildGistUrl,
} from "@/utils/sync/gistSync";
import {
  testGiteeConnection,
  fetchGiteeGist,
  createGiteeGist,
  updateGiteeGist,
  findQuickPromptGist,
} from "@/utils/sync/giteeGistSync";

const GistIntegration: React.FC = () => {
  const [token, setToken] = useState<string>("");
  const [gistId, setGistId] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [testMessage, setTestMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState<boolean>(false);
  const [isPublic, setIsPublic] = useState<boolean>(false);
  const [lastGistUrl, setLastGistUrl] = useState<string>("");
  const messageTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    loadSettings();
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
    };
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const result = await browser.storage.sync.get([
        GIST_STORAGE_KEYS.GITEE_TOKEN,
        GIST_STORAGE_KEYS.GITEE_GIST_ID,
        GIST_STORAGE_KEYS.GITEE_AUTO_SYNC,
        GIST_STORAGE_KEYS.GITEE_PUBLIC,
      ]);
      setToken(result[GIST_STORAGE_KEYS.GITEE_TOKEN] || "");
      setGistId(result[GIST_STORAGE_KEYS.GITEE_GIST_ID] || "");
      setIsAutoSyncEnabled(result[GIST_STORAGE_KEYS.GITEE_AUTO_SYNC] ?? false);
      setIsPublic(result[GIST_STORAGE_KEYS.GITEE_PUBLIC] ?? false);
      if (result[GIST_STORAGE_KEYS.GITEE_GIST_ID]) {
        setLastGistUrl(buildGistUrl("gitee", result[GIST_STORAGE_KEYS.GITEE_GIST_ID]));
      }
    } catch (error) {
      console.error("Error loading gist settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const showMessage = (type: "success" | "error" | "info", text: string) => {
    setTestMessage({ type, text });
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }
    messageTimeoutRef.current = window.setTimeout(() => {
      setTestMessage(null);
      messageTimeoutRef.current = null;
    }, 5000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      showMessage("error", t("fillGiteeToken"));
      return;
    }
    try {
      showMessage("info", t("testingConnection") || "Testing connection...");
      const testResult = await testGiteeConnection(token);

      if (testResult.success) {
        await browser.storage.sync.set({
          [GIST_STORAGE_KEYS.GITEE_TOKEN]: token,
          [GIST_STORAGE_KEYS.GITEE_GIST_ID]: gistId,
        });
        showMessage("success", t("gistConnectionSuccess", [testResult.username || ""]));
      } else {
        showMessage("error", testResult.error || t("gistConnectionFailed"));
      }
    } catch (error) {
      console.error("Error testing connection:", error);
      showMessage("error", t("gistConnectionFailed"));
    }
  };

  const handleAutoSyncToggle = async (enabled: boolean) => {
    setIsAutoSyncEnabled(enabled);
    await browser.storage.sync.set({
      [GIST_STORAGE_KEYS.GITEE_AUTO_SYNC]: enabled,
    });
  };

  const handlePublicToggle = async (enabled: boolean) => {
    setIsPublic(enabled);
    await browser.storage.sync.set({
      [GIST_STORAGE_KEYS.GITEE_PUBLIC]: enabled,
    });
  };

  const getPromptsAndCategories = async (): Promise<{
    prompts: PromptItem[];
    categories: Category[];
  }> => {
    const promptsResult = await browser.storage.local.get(BROWSER_STORAGE_KEY);
    const categoriesResult = await browser.storage.local.get("categories");
    const prompts = (promptsResult[BROWSER_STORAGE_KEY] as PromptItem[]) || [];
    const categories = (categoriesResult.categories as Category[]) || [];
    return { prompts, categories };
  };

  const resolveGistId = async (): Promise<string | null> => {
    if (gistId) return gistId;
    const found = await findQuickPromptGist(token);
    if (found) {
      setGistId(found.id);
      await browser.storage.sync.set({
        [GIST_STORAGE_KEYS.GITEE_GIST_ID]: found.id,
      });
      return found.id;
    }
    return null;
  };

  const handleSyncToGist = async () => {
    if (!token) {
      showMessage("error", t("gistTokenRequired"));
      return;
    }
    if (isSyncing) {
      showMessage("info", t("syncTaskInProgress"));
      return;
    }

    setIsSyncing(true);
    try {
      const { prompts, categories } = await getPromptsAndCategories();
      const content = serializeToGistContent(prompts, categories);

      let currentGistId = await resolveGistId();

      if (currentGistId) {
        await updateGiteeGist(token, currentGistId, content);
        const url = buildGistUrl("gitee", currentGistId);
        setLastGistUrl(url);
        showMessage("success", t("gistUpdatedSuccess"));
      } else {
        const newGist = await createGiteeGist(token, content, isPublic);
        setGistId(newGist.id);
        await browser.storage.sync.set({
          [GIST_STORAGE_KEYS.GITEE_GIST_ID]: newGist.id,
        });
        const url = buildGistUrl("gitee", newGist.id);
        setLastGistUrl(url);
        showMessage("success", t("gistCreatedSuccess"));
      }
    } catch (error: any) {
      console.error("Error syncing to gist:", error);
      showMessage("error", `${t("gistSyncFailed")}: ${error.message || ""}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncFromGistReplace = async () => {
    if (!token) {
      showMessage("error", t("gistTokenRequired"));
      return;
    }
    if (isSyncing) {
      showMessage("info", t("syncTaskInProgress"));
      return;
    }

    setIsSyncing(true);
    try {
      let currentGistId = await resolveGistId();
      if (!currentGistId) {
        showMessage("error", t("gistNoBackupFound"));
        return;
      }

      const gist = await fetchGiteeGist(token, currentGistId);
      if (!gist || !gist.files[GIST_FILENAME]) {
        showMessage("error", t("gistNotFound"));
        return;
      }

      const data = deserializeFromGistContent(gist.files[GIST_FILENAME].content);
      await browser.storage.local.set({
        [BROWSER_STORAGE_KEY]: data.prompts,
        categories: data.categories,
      });
      showMessage("success", t("gistDownloadSuccess"));
    } catch (error: any) {
      console.error("Error syncing from gist:", error);
      showMessage("error", `${t("gistDownloadFailed")}: ${error.message || ""}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncFromGistAppend = async () => {
    if (!token) {
      showMessage("error", t("gistTokenRequired"));
      return;
    }
    if (isSyncing) {
      showMessage("info", t("syncTaskInProgress"));
      return;
    }

    setIsSyncing(true);
    try {
      let currentGistId = await resolveGistId();
      if (!currentGistId) {
        showMessage("error", t("gistNoBackupFound"));
        return;
      }

      const gist = await fetchGiteeGist(token, currentGistId);
      if (!gist || !gist.files[GIST_FILENAME]) {
        showMessage("error", t("gistNotFound"));
        return;
      }

      const data = deserializeFromGistContent(gist.files[GIST_FILENAME].content);
      const { prompts: localPrompts, categories: localCategories } =
        await getPromptsAndCategories();

      const existingIds = new Set(localPrompts.map((p) => p.id));
      const newPrompts = data.prompts.filter((p) => !existingIds.has(p.id));
      const mergedPrompts = [...localPrompts, ...newPrompts];

      const existingCategoryIds = new Set(localCategories.map((c) => c.id));
      const newCategories = data.categories.filter(
        (c) => !existingCategoryIds.has(c.id)
      );
      const mergedCategories = [...localCategories, ...newCategories];

      await browser.storage.local.set({
        [BROWSER_STORAGE_KEY]: mergedPrompts,
        categories: mergedCategories,
      });
      showMessage("success", t("gistDownloadSuccess"));
    } catch (error: any) {
      console.error("Error appending from gist:", error);
      showMessage("error", `${t("gistDownloadFailed")}: ${error.message || ""}`);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {testMessage && (
        <div
          className={`p-4 rounded-xl border backdrop-blur-sm shadow-lg ${
            testMessage.type === "success"
              ? "bg-green-50/80 dark:bg-green-900/30 border-green-200/50 dark:border-green-800/50 text-green-800 dark:text-green-200"
              : testMessage.type === "error"
              ? "bg-red-50/80 dark:bg-red-900/30 border-red-200/50 dark:border-red-800/50 text-red-800 dark:text-red-200"
              : "bg-blue-50/80 dark:bg-blue-900/30 border-blue-200/50 dark:border-blue-800/50 text-blue-800 dark:text-blue-200"
          }`}
        >
          <div className="flex items-center">
            <svg
              className={`w-5 h-5 mr-2 flex-shrink-0 ${
                testMessage.type === "success"
                  ? "text-green-500"
                  : testMessage.type === "error"
                  ? "text-red-500"
                  : "text-blue-500"
              }`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              {testMessage.type === "success" ? (
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              ) : testMessage.type === "error" ? (
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              ) : (
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              )}
            </svg>
            <span className="text-sm font-medium">{testMessage.text}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="p-6 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl border border-white/20 dark:border-gray-700/50 shadow-lg">
          <h3 className="pb-2 mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">
            {t("giteeGistToken")}
          </h3>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t("giteeGistToken")}
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={t("giteeGistTokenPlaceholder")}
                  required
                  className="block px-3 py-2 mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {t("giteeGistTokenHelp")}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t("giteeGistId")}
                </label>
                <input
                  type="text"
                  value={gistId}
                  onChange={(e) => setGistId(e.target.value)}
                  placeholder={t("giteeGistIdPlaceholder")}
                  className="block px-3 py-2 mt-1 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {t("giteeGistIdHelp")}
                </p>
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button
                type="submit"
                className="flex items-center px-4 py-2 font-medium text-white bg-blue-600/90 dark:bg-blue-500/80 rounded-md transition-colors hover:bg-blue-700 dark:hover:bg-blue-600/90 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
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
          <h3 className="pb-2 mb-3 text-lg font-semibold text-gray-800 dark:text-gray-200">
            {t("autoSyncSettings")}
          </h3>

          <div className="flex justify-between items-center mb-3">
            <div>
              <h4 className="font-medium text-gray-700 text-md dark:text-gray-300">
                {t("gistAutoSyncEnabled")}
              </h4>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("gistAutoSyncDescription")}
              </p>
            </div>
            <Switch
              checked={isAutoSyncEnabled}
              onChange={handleAutoSyncToggle}
              className={`${
                isAutoSyncEnabled
                  ? "bg-blue-600"
                  : "bg-gray-200 dark:bg-gray-700"
              } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800`}
            >
              <span className="sr-only">{t("gistAutoSyncEnabled")}</span>
              <span
                className={`${
                  isAutoSyncEnabled ? "translate-x-6" : "translate-x-1"
                } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
              />
            </Switch>
          </div>

          <div className="flex justify-between items-center mb-3">
            <div>
              <h4 className="font-medium text-gray-700 text-md dark:text-gray-300">
                {t("gistPublicToggle")}
              </h4>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("gistPublicDescription")}
              </p>
            </div>
            <Switch
              checked={isPublic}
              onChange={handlePublicToggle}
              className={`${
                isPublic ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700"
              } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800`}
            >
              <span className="sr-only">{t("gistPublicToggle")}</span>
              <span
                className={`${
                  isPublic ? "translate-x-6" : "translate-x-1"
                } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
              />
            </Switch>
          </div>

          {lastGistUrl && (
            <div className="mt-2 mb-3">
              <a
                href={lastGistUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-sm text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition-colors"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                {t("viewGist")}
              </a>
            </div>
          )}

          <div className="mt-4 p-3 text-xs text-gray-600 bg-white/70 dark:bg-gray-700/70 backdrop-blur-sm rounded-md border border-gray-200/50 dark:border-gray-600/50 shadow-sm dark:text-gray-400">
            <h4 className="mb-2 font-medium text-gray-700 dark:text-gray-300">
              {t("importantNotes")}
            </h4>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>{t("gistTokenStorageNote")}</li>
              <li>{t("gistPermissionsNote")}</li>
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
              {t("syncFromGistToLocal")}
            </h4>
          </div>

          <div className="mb-4 space-y-3">
            <button
              type="button"
              onClick={handleSyncFromGistReplace}
              disabled={isSyncing}
              className="flex justify-center items-center px-4 py-2 w-full font-medium text-white bg-red-600/90 dark:bg-red-500/80 rounded-md transition-colors hover:bg-red-700 dark:hover:bg-red-600/90 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
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
              {isSyncing ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t("syncTaskInProgress")}
                </span>
              ) : (
                t("overwriteLocalData")
              )}
            </button>
            <button
              type="button"
              onClick={handleSyncFromGistAppend}
              disabled={isSyncing}
              className="flex justify-center items-center px-4 py-2 w-full font-medium text-white bg-blue-600/90 dark:bg-blue-500/80 rounded-md transition-colors hover:bg-blue-700 dark:hover:bg-blue-600/90 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
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
              {t("syncFromLocalToGist")}
            </h4>
          </div>

          <div className="mb-4">
            <button
              type="button"
              onClick={handleSyncToGist}
              disabled={isSyncing}
              className="flex justify-center items-center px-4 py-2 w-full font-medium text-white bg-green-600/90 dark:bg-green-500/80 rounded-md transition-colors hover:bg-green-700 dark:hover:bg-green-600/90 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
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
              {isSyncing ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t("syncTaskInProgress")}
                </span>
              ) : (
                t("syncToGist")
              )}
            </button>
          </div>

          <div className="p-3 text-xs text-gray-600 bg-white/70 dark:bg-gray-700/70 backdrop-blur-sm rounded-md border border-gray-200/50 dark:border-gray-600/50 shadow-sm dark:text-gray-400">
            <div className="mb-2">
              {t("gistSyncToDescription")}
            </div>
            <ul className="pl-5 space-y-1 list-disc">
              <li>{t("gistCreateOrUpdatePrompts")}</li>
              <li>{t("gistPreserveCategories")}</li>
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
    </div>
  );
};

export default GistIntegration;
