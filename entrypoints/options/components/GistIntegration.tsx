import React, { useState, useEffect, useRef } from "react";
import { Check, ExternalLink, Loader2, Plus, RefreshCcw, UploadCloud } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { LoadingState } from "@/components/common/LoadingState";
import { SectionCard } from "@/components/common/SectionCard";
import { SettingsRow } from "@/components/common/SettingsRow";
import { cn } from "@/lib/utils";
import { browser } from "#imports";
import { t } from "../../../utils/i18n";
import { CATEGORIES_STORAGE_KEY } from "@/utils/constants";
import type { PromptItem, Category } from "@/utils/types";
import { getAllPrompts, setAllPrompts } from "@/utils/promptStore";
import {
  applyImportedGlobalSettings,
  getGlobalSettings,
} from "@/utils/globalSettings";
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
    const categoriesResult = await browser.storage.local.get(CATEGORIES_STORAGE_KEY);
    return {
      prompts: await getAllPrompts(),
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
      const globalSettings = await getGlobalSettings();
      const content = serializeToGistContent(prompts, categories, globalSettings);
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
      await setAllPrompts(data.prompts);
      await browser.storage.local.set({
        [CATEGORIES_STORAGE_KEY]: data.categories,
      });
      await applyImportedGlobalSettings(data.globalSettings);
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
      await setAllPrompts(mergedPrompts);
      await browser.storage.local.set({
        [CATEGORIES_STORAGE_KEY]: mergedCategories,
      });
      await applyImportedGlobalSettings(data.globalSettings);
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
    return <LoadingState title={t("loading")} description={t("loadingMessage")} />;
  }

  const Spinner = () => (
    <Loader2 className="size-4 animate-spin" />
  );

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-2xl border border-border bg-muted/50 p-1">
        {(["github", "gitee"] as Platform[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => handleTabChange(p)}
            aria-pressed={platform === p}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:text-foreground",
              platform === p && "bg-background text-foreground shadow-sm ring-1 ring-border",
            )}
          >
            {p === "github" ? "GitHub Gist" : "Gitee Gist"}
          </button>
        ))}
      </div>

      {testMessage && (
        <Alert variant={testMessage.type === "error" ? "destructive" : testMessage.type}>
          <AlertDescription>{testMessage.text}</AlertDescription>
        </Alert>
      )}

      <SectionCard title={config.tokenLabel()} description={config.tokenHelp()}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor={`${platform}-gist-token`} className="mb-1.5 block text-sm font-medium text-foreground">
              {config.tokenLabel()}
            </label>
            <Input
              id={`${platform}-gist-token`}
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={config.tokenPlaceholder()}
            />
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              {config.tokenHelp()}
            </p>
          </div>

          <div>
            <label htmlFor={`${platform}-gist-id`} className="mb-1.5 block text-sm font-medium text-foreground">
              {config.gistIdLabel()}
            </label>
            <Input
              id={`${platform}-gist-id`}
              type="text"
              value={gistId}
              onChange={(e) => setGistId(e.target.value)}
              placeholder={config.gistIdPlaceholder()}
            />
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              {config.gistIdHelp()}
            </p>
          </div>

          <Button type="submit">
            <Check className="size-4" />
            {t("saveAndTest")}
          </Button>
        </form>
      </SectionCard>

      <SectionCard contentClassName="divide-y divide-border p-0">
        <SettingsRow
          title={t("gistAutoSyncEnabled")}
          description={t("gistAutoSyncDescription")}
          control={(
            <Switch
              checked={isAutoSyncEnabled}
              onCheckedChange={handleAutoSyncToggle}
              aria-label={t("gistAutoSyncEnabled")}
            />
          )}
        />

        <SettingsRow
          title={t("gistPublicToggle")}
          description={t("gistPublicDescription")}
          control={(
            <Switch
              checked={isPublic}
              onCheckedChange={handlePublicToggle}
              aria-label={t("gistPublicToggle")}
            />
          )}
        />

        {lastGistUrl && (
          <SettingsRow
            title={t("viewGist")}
            description={lastGistUrl}
            control={(
              <Button asChild variant="outline" size="sm">
                <a href={lastGistUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  {t("viewGist")}
                </a>
              </Button>
            )}
          />
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SectionCard title={t("syncFromLocalToGist")} description={t("gistSyncToDescription")}>
          <Button
            type="button"
            onClick={handleSyncToGist}
            disabled={isSyncing}
            className="w-full"
          >
            {isSyncing ? <Spinner /> : <UploadCloud className="size-4" />}
            {t("syncToGist")}
          </Button>
        </SectionCard>

        <SectionCard title={t("syncFromGistToLocal")}>
          <div className="space-y-2">
            <Button
              type="button"
              onClick={handleSyncFromGistAppend}
              disabled={isSyncing}
              variant="outline"
              className="w-full"
            >
              {isSyncing ? <Spinner /> : <Plus className="size-4" />}
              {t("appendToLocal")}
            </Button>
            <Button
              type="button"
              onClick={handleSyncFromGistReplace}
              disabled={isSyncing}
              variant="outline"
              className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {isSyncing ? <Spinner /> : <RefreshCcw className="size-4" />}
              {t("overwriteLocalData")}
            </Button>
          </div>
          <div className="mt-4 space-y-1 text-xs leading-5 text-muted-foreground">
            <p>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">{t("appendMode")}</span>{" "}
              {t("appendModeDescription")}
            </p>
            <p>
              <span className="font-medium text-destructive">{t("overwriteMode")}</span>{" "}
              {t("overwriteModeDescription")}
            </p>
          </div>
        </SectionCard>
      </div>

      <div className="space-y-1 text-xs leading-5 text-muted-foreground">
        <p>• {t("gistTokenStorageNote")}</p>
        <p>• {t("gistPermissionsNote")}</p>
        <p>• {t("oneTimeOperationNote")}</p>
      </div>
    </div>
  );
};

export default GistIntegration;
