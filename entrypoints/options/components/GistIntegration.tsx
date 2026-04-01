import React, { useState, useEffect, useRef } from "react";
import { Switch } from "@headlessui/react";
import { browser } from "#imports";
import { t } from "../../../utils/i18n";
import { BROWSER_STORAGE_KEY, CATEGORIES_STORAGE_KEY } from "@/utils/constants";
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
  findQuickPromptGist as findGiteeGist,
} from "@/utils/sync/giteeGistSync";
import {
  testGitHubConnection,
  fetchGitHubGist,
  createGitHubGist,
  updateGitHubGist,
  findQuickPromptGist as findGitHubGist,
} from "@/utils/sync/githubGistSync";

type Platform = "gitee" | "github";

const PLATFORM_CONFIG = {
  gitee: {
    tokenKey: GIST_STORAGE_KEYS.GITEE_TOKEN,
    gistIdKey: GIST_STORAGE_KEYS.GITEE_GIST_ID,
    autoSyncKey: GIST_STORAGE_KEYS.GITEE_AUTO_SYNC,
    publicKey: GIST_STORAGE_KEYS.GITEE_PUBLIC,
    tokenLabel: () => t("giteeGistToken"),
    tokenPlaceholder: () => t("giteeGistTokenPlaceholder"),
    tokenHelp: () => t("giteeGistTokenHelp"),
    gistIdLabel: () => t("giteeGistId"),
    gistIdPlaceholder: () => t("giteeGistIdPlaceholder"),
    gistIdHelp: () => t("giteeGistIdHelp"),
    fillTokenMsg: () => t("fillGiteeToken"),
    testConnection: testGiteeConnection,
    fetchGist: fetchGiteeGist,
    createGist: createGiteeGist,
    updateGist: updateGiteeGist,
    findGist: findGiteeGist,
  },
  github: {
    tokenKey: GIST_STORAGE_KEYS.GITHUB_TOKEN,
    gistIdKey: GIST_STORAGE_KEYS.GITHUB_GIST_ID,
    autoSyncKey: GIST_STORAGE_KEYS.GITHUB_AUTO_SYNC,
    publicKey: GIST_STORAGE_KEYS.GITHUB_PUBLIC,
    tokenLabel: () => t("githubGistToken"),
    tokenPlaceholder: () => t("githubGistTokenPlaceholder"),
    tokenHelp: () => t("githubGistTokenHelp"),
    gistIdLabel: () => t("githubGistId"),
    gistIdPlaceholder: () => t("githubGistIdPlaceholder"),
    gistIdHelp: () => t("githubGistIdHelp"),
    fillTokenMsg: () => t("fillGithubToken"),
    testConnection: testGitHubConnection,
    fetchGist: fetchGitHubGist,
    createGist: createGitHubGist,
    updateGist: updateGitHubGist,
    findGist: findGitHubGist,
  },
};

const GistIntegration: React.FC = () => {
  const [platform, setPlatform] = useState<Platform>("github");
  const [token, setToken] = useState("");
  const [gistId, setGistId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [testMessage, setTestMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [lastGistUrl, setLastGistUrl] = useState("");
  const messageTimeoutRef = useRef<number | null>(null);

  const config = PLATFORM_CONFIG[platform];

  useEffect(() => {
    loadSettings();
    return () => {
      if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    };
  }, [platform]);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      setTestMessage(null);
      const result = await browser.storage.sync.get([
        config.tokenKey,
        config.gistIdKey,
        config.autoSyncKey,
        config.publicKey,
      ]);
      setToken(result[config.tokenKey] || "");
      setGistId(result[config.gistIdKey] || "");
      setIsAutoSyncEnabled(result[config.autoSyncKey] ?? false);
      setIsPublic(result[config.publicKey] ?? false);
      if (result[config.gistIdKey]) {
        setLastGistUrl(buildGistUrl(platform, result[config.gistIdKey]));
      } else {
        setLastGistUrl("");
      }
    } catch (error) {
      console.error("Error loading gist settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const showMessage = (type: "success" | "error" | "info", text: string) => {
    setTestMessage({ type, text });
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
    messageTimeoutRef.current = window.setTimeout(() => {
      setTestMessage(null);
      messageTimeoutRef.current = null;
    }, 5000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      showMessage("error", config.fillTokenMsg());
      return;
    }
    try {
      showMessage("info", t("testingConnection"));
      const testResult = await config.testConnection(token);
      if (testResult.success) {
        await browser.storage.sync.set({
          [config.tokenKey]: token,
          [config.gistIdKey]: gistId,
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
    await browser.storage.sync.set({ [config.autoSyncKey]: enabled });
  };

  const handlePublicToggle = async (enabled: boolean) => {
    setIsPublic(enabled);
    await browser.storage.sync.set({ [config.publicKey]: enabled });
  };

  const getPromptsAndCategories = async (): Promise<{
    prompts: PromptItem[];
    categories: Category[];
  }> => {
    const promptsResult = await browser.storage.local.get(BROWSER_STORAGE_KEY);
    const categoriesResult = await browser.storage.local.get(CATEGORIES_STORAGE_KEY);
    return {
      prompts: (promptsResult[BROWSER_STORAGE_KEY] as PromptItem[]) || [],
      categories: (categoriesResult[CATEGORIES_STORAGE_KEY] as Category[]) || [],
    };
  };

  const resolveGistId = async (): Promise<string | null> => {
    if (gistId) return gistId;
    const found = await config.findGist(token);
    if (found) {
      setGistId(found.id);
      await browser.storage.sync.set({ [config.gistIdKey]: found.id });
      return found.id;
    }
    return null;
  };

  const handleSyncToGist = async () => {
    if (!token) {
      showMessage("error", t("gistTokenRequired"));
      return;
    }
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const { prompts, categories } = await getPromptsAndCategories();
      const content = serializeToGistContent(prompts, categories);
      let currentGistId = await resolveGistId();
      if (currentGistId) {
        await config.updateGist(token, currentGistId, content);
        setLastGistUrl(buildGistUrl(platform, currentGistId));
        showMessage("success", t("gistUpdatedSuccess"));
      } else {
        const newGist = await config.createGist(token, content, isPublic);
        setGistId(newGist.id);
        await browser.storage.sync.set({ [config.gistIdKey]: newGist.id });
        setLastGistUrl(buildGistUrl(platform, newGist.id));
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
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const currentGistId = await resolveGistId();
      if (!currentGistId) {
        showMessage("error", t("gistNoBackupFound"));
        return;
      }
      const gist = await config.fetchGist(token, currentGistId);
      if (!gist || !gist.files[GIST_FILENAME]) {
        showMessage("error", t("gistNotFound"));
        return;
      }
      const data = deserializeFromGistContent(gist.files[GIST_FILENAME].content);
      await browser.storage.local.set({
        [BROWSER_STORAGE_KEY]: data.prompts,
        [CATEGORIES_STORAGE_KEY]: data.categories,
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
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const currentGistId = await resolveGistId();
      if (!currentGistId) {
        showMessage("error", t("gistNoBackupFound"));
        return;
      }
      const gist = await config.fetchGist(token, currentGistId);
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
        [CATEGORIES_STORAGE_KEY]: mergedCategories,
      });
      showMessage(
        "success",
        `${t("gistDownloadSuccess")} (+${newPrompts.length} prompts, +${newCategories.length} categories)`
      );
    } catch (error: any) {
      console.error("Error syncing from gist:", error);
      showMessage("error", `${t("gistDownloadFailed")}: ${error.message || ""}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTabChange = (p: Platform) => {
    if (p !== platform) {
      setPlatform(p);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <svg className="animate-spin h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  const Spinner = () => (
    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        {(["github", "gitee"] as Platform[]).map((p) => (
          <button
            key={p}
            onClick={() => handleTabChange(p)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              platform === p
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
            }`}
          >
            {p === "github" ? "GitHub Gist" : "Gitee Gist"}
          </button>
        ))}
      </div>

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
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {config.tokenLabel()}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={config.tokenPlaceholder()}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              {config.tokenHelp()}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {config.gistIdLabel()}
            </label>
            <input
              type="text"
              value={gistId}
              onChange={(e) => setGistId(e.target.value)}
              placeholder={config.gistIdPlaceholder()}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              {config.gistIdHelp()}
            </p>
          </div>

          <button
           type="submit"
           className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
          >
           <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
           </svg>
           {t("saveAndTest")}
          </button>
        </form>
      </div>

      {/* Options */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 mb-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {t("gistAutoSyncEnabled")}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {t("gistAutoSyncDescription")}
            </p>
          </div>
          <Switch
            checked={isAutoSyncEnabled}
            onChange={handleAutoSyncToggle}
            className={`${
              isAutoSyncEnabled ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-600"
            } relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800`}
          >
            <span
              className={`${
                isAutoSyncEnabled ? "translate-x-5" : "translate-x-1"
              } inline-block h-3 w-3 transform rounded-full bg-white transition-transform`}
            />
          </Switch>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700" />

        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {t("gistPublicToggle")}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {t("gistPublicDescription")}
            </p>
          </div>
          <Switch
            checked={isPublic}
            onChange={handlePublicToggle}
            className={`${
              isPublic ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-600"
            } relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800`}
          >
            <span
              className={`${
                isPublic ? "translate-x-5" : "translate-x-1"
              } inline-block h-3 w-3 transform rounded-full bg-white transition-transform`}
            />
          </Switch>
        </div>

        {lastGistUrl && (
          <>
            <div className="border-t border-gray-100 dark:border-gray-700" />
            <a
              href={lastGistUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              {t("viewGist")}
            </a>
          </>
        )}
      </div>

      {/* Sync Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Upload */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            {t("syncFromLocalToGist")}
          </h4>
          <button
            type="button"
            onClick={handleSyncToGist}
            disabled={isSyncing}
            className="w-full flex justify-center items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSyncing ? <Spinner /> : <><svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>{t("syncToGist")}</>}
          </button>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {t("gistSyncToDescription")}
          </p>
        </div>

        {/* Download */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            {t("syncFromGistToLocal")}
          </h4>
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleSyncFromGistAppend}
              disabled={isSyncing}
              className="w-full flex justify-center items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSyncing ? <Spinner /> : <><svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>{t("appendToLocal")}</>}
            </button>
            <button
              type="button"
              onClick={handleSyncFromGistReplace}
              disabled={isSyncing}
              className="w-full flex justify-center items-center px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-white dark:bg-gray-700 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSyncing ? <Spinner /> : <><svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>{t("overwriteLocalData")}</>}
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
        <p>• {t("gistTokenStorageNote")}</p>
        <p>• {t("gistPermissionsNote")}</p>
        <p>• {t("oneTimeOperationNote")}</p>
      </div>
    </div>
  );
};

export default GistIntegration;
