import React, { useEffect, useRef, useState } from "react";
import { Check, FolderOpen, Loader2, Plus, RefreshCcw, UploadCloud } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { LoadingState } from "@/components/common/LoadingState";
import { SectionCard } from "@/components/common/SectionCard";
import { SettingsRow } from "@/components/common/SettingsRow";
import { browser } from "#imports";
import { CATEGORIES_STORAGE_KEY } from "@/utils/constants";
import type { Category, PromptItem } from "@/utils/types";
import { getAllPrompts, setAllPrompts } from "@/utils/promptStore";
import {
  applyImportedGlobalSettings,
  getGlobalSettings,
} from "@/utils/globalSettings";
import {
  type AttachmentStorageRootHandle,
  getAttachmentRootHandle,
  pickAndStoreAttachmentRoot,
  verifyReadWritePermission,
} from "@/utils/attachments/fileSystem";
import {
  downloadWebDavBackup,
  uploadWebDavBackup,
  type WebDavBackupDownloadMode,
} from "@/utils/sync/webdavBackup";
import { WEBDAV_STORAGE_KEYS, testWebDavConnection, type WebDavConfig } from "@/utils/sync/webdavSync";
import { t } from "../../../utils/i18n";

type MessageType = "success" | "error" | "info";

const DEFAULT_REMOTE_DIR = "quick-prompt";

const getErrorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : String(error)
);

const WebDavIntegration: React.FC = () => {
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remoteDir, setRemoteDir] = useState(DEFAULT_REMOTE_DIR);
  const [autoSync, setAutoSync] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoSyncSaving, setIsAutoSyncSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [needsAttachmentReauthorization, setNeedsAttachmentReauthorization] = useState(false);
  const [isReauthorizing, setIsReauthorizing] = useState(false);
  const [message, setMessage] = useState<{ type: MessageType; text: string } | null>(null);
  const messageTimeoutRef = useRef<number | null>(null);
  const saveRequestIdRef = useRef(0);
  const autoSyncRequestIdRef = useRef(0);

  useEffect(() => {
    loadSettings();

    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
    };
  }, []);

  const showMessage = (type: MessageType, text: string) => {
    setMessage({ type, text });

    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }

    messageTimeoutRef.current = window.setTimeout(() => {
      setMessage(null);
      messageTimeoutRef.current = null;
    }, 5000);
  };

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const result = await browser.storage.sync.get([
        WEBDAV_STORAGE_KEYS.SERVER_URL,
        WEBDAV_STORAGE_KEYS.USERNAME,
        WEBDAV_STORAGE_KEYS.PASSWORD,
        WEBDAV_STORAGE_KEYS.REMOTE_DIR,
        WEBDAV_STORAGE_KEYS.AUTO_SYNC,
      ]);

      setServerUrl(result[WEBDAV_STORAGE_KEYS.SERVER_URL] || "");
      setUsername(result[WEBDAV_STORAGE_KEYS.USERNAME] || "");
      setPassword(result[WEBDAV_STORAGE_KEYS.PASSWORD] || "");
      setRemoteDir(result[WEBDAV_STORAGE_KEYS.REMOTE_DIR] || DEFAULT_REMOTE_DIR);
      setAutoSync(result[WEBDAV_STORAGE_KEYS.AUTO_SYNC] ?? false);
    } catch (error) {
      console.error("Error loading WebDAV settings:", error);
      showMessage("error", t("webdavLoadSettingsFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const buildConfig = (): WebDavConfig | null => {
    const normalizedServerUrl = serverUrl.trim();
    const normalizedUsername = username.trim();
    const normalizedRemoteDir = remoteDir.trim();

    if (!normalizedServerUrl || !normalizedUsername || !password) {
      showMessage("error", t("webdavRequiredFields"));
      return null;
    }

    try {
      const parsedUrl = new URL(normalizedServerUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        showMessage("error", t("webdavInvalidServerUrl"));
        return null;
      }
    } catch {
      showMessage("error", t("webdavInvalidServerUrl"));
      return null;
    }

    if (!normalizedRemoteDir || normalizedRemoteDir.includes("..")) {
      showMessage("error", t("webdavInvalidRemoteDirectory"));
      return null;
    }

    return {
      serverUrl: normalizedServerUrl,
      username: normalizedUsername,
      password,
      remoteDir: normalizedRemoteDir,
      autoSync,
    };
  };

  const handleSaveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    const config = buildConfig();

    if (!config) {
      return;
    }

    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;
    setIsSaving(true);
    showMessage("info", t("testingConnection"));

    let connectionTestSucceeded = false;
    try {
      await testWebDavConnection(config);
      connectionTestSucceeded = true;
      await browser.storage.sync.set({
        [WEBDAV_STORAGE_KEYS.SERVER_URL]: config.serverUrl,
        [WEBDAV_STORAGE_KEYS.USERNAME]: config.username,
        [WEBDAV_STORAGE_KEYS.PASSWORD]: config.password,
        [WEBDAV_STORAGE_KEYS.REMOTE_DIR]: config.remoteDir,
        [WEBDAV_STORAGE_KEYS.AUTO_SYNC]: config.autoSync,
      });
      if (requestId !== saveRequestIdRef.current) {
        return;
      }
      setRemoteDir(config.remoteDir);
      showMessage("success", `${t("webdavConnectionSuccess")} ${t("webdavSettingsSaved")}`);
    } catch (error) {
      if (requestId !== saveRequestIdRef.current) {
        return;
      }
      console.error("Error saving WebDAV settings:", error);
      const messageKey = connectionTestSucceeded ? "webdavSaveSettingsFailed" : "webdavConnectionFailed";
      showMessage("error", `${t(messageKey)}: ${getErrorMessage(error)}`);
    } finally {
      if (requestId === saveRequestIdRef.current) {
        setIsSaving(false);
      }
    }
  };

  const handleAutoSyncToggle = async (enabled: boolean) => {
    if (isAutoSyncSaving) {
      return;
    }

    const requestId = autoSyncRequestIdRef.current + 1;
    autoSyncRequestIdRef.current = requestId;
    setAutoSync(enabled);
    setIsAutoSyncSaving(true);

    try {
      await browser.storage.sync.set({ [WEBDAV_STORAGE_KEYS.AUTO_SYNC]: enabled });
      if (requestId !== autoSyncRequestIdRef.current) {
        return;
      }
    } catch (error) {
      if (requestId !== autoSyncRequestIdRef.current) {
        return;
      }
      console.error("Error saving WebDAV auto upload setting:", error);
      const result = await browser.storage.sync.get(WEBDAV_STORAGE_KEYS.AUTO_SYNC);
      setAutoSync(result[WEBDAV_STORAGE_KEYS.AUTO_SYNC] ?? false);
      showMessage("error", `${t("webdavSaveSettingsFailed")}: ${getErrorMessage(error)}`);
    } finally {
      if (requestId === autoSyncRequestIdRef.current) {
        setIsAutoSyncSaving(false);
      }
    }
  };

  const getAuthorizedRootHandle = async (): Promise<AttachmentStorageRootHandle | null> => {
    const rootHandle = await getAttachmentRootHandle();

    if (!rootHandle || !(await verifyReadWritePermission(rootHandle))) {
      setNeedsAttachmentReauthorization(true);
      showMessage("error", t("attachmentPermissionLost"));
      return null;
    }

    setNeedsAttachmentReauthorization(false);
    return rootHandle;
  };

  const handleReauthorizeAttachmentDirectory = async () => {
    if (isReauthorizing) {
      return;
    }

    setIsReauthorizing(true);
    try {
      await pickAndStoreAttachmentRoot();
      setNeedsAttachmentReauthorization(false);
      showMessage("success", t("attachmentStorageReauthorized"));
    } catch (error) {
      console.error("Error reauthorizing attachment directory:", error);
      showMessage("error", `${t("attachmentStoragePermissionRequired")}: ${getErrorMessage(error)}`);
    } finally {
      setIsReauthorizing(false);
    }
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

  const handleUpload = async () => {
    const config = buildConfig();
    if (!config || isSyncing) {
      return;
    }

    setIsSyncing(true);
    try {
      const rootHandle = await getAuthorizedRootHandle();
      if (!rootHandle) {
        return;
      }

      const { prompts, categories } = await getPromptsAndCategories();
      const globalSettings = await getGlobalSettings();
      const result = await uploadWebDavBackup(config, rootHandle, prompts, categories, globalSettings);

      if (result.success) {
        showMessage("success", t("webdavUploadSuccess", [
          String(result.uploadedFiles.length),
          String(result.deletedFiles.length),
        ]));
      } else {
        showMessage("error", `${t("webdavUploadFailed")}: ${result.errors.join("; ")}`);
      }
    } catch (error) {
      console.error("Error uploading WebDAV backup:", error);
      showMessage("error", `${t("webdavUploadFailed")}: ${getErrorMessage(error)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDownload = async (mode: WebDavBackupDownloadMode) => {
    const config = buildConfig();
    if (!config || isSyncing) {
      return;
    }

    setIsSyncing(true);
    try {
      const rootHandle = await getAuthorizedRootHandle();
      if (!rootHandle) {
        return;
      }

      const { prompts, categories } = await getPromptsAndCategories();
      const result = await downloadWebDavBackup(config, rootHandle, prompts, categories, mode);

      if (!result.success) {
        showMessage("error", `${t("webdavDownloadFailed")}: ${result.errors.join("; ")}`);
        return;
      }

      await setAllPrompts(result.prompts);
      await browser.storage.local.set({
        [CATEGORIES_STORAGE_KEY]: result.categories,
      });
      await applyImportedGlobalSettings(result.globalSettings);
      showMessage("success", t("webdavDownloadSuccess", [String(result.downloadedFiles.length)]));
    } catch (error) {
      console.error("Error downloading WebDAV backup:", error);
      showMessage("error", `${t("webdavDownloadFailed")}: ${getErrorMessage(error)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const Spinner = () => (
    <Loader2 className="size-4 animate-spin" />
  );

  if (isLoading) {
    return <LoadingState title={t("loading")} description={t("loadingMessage")} />;
  }

  return (
    <div className="space-y-5">
      {message && (
        <Alert variant={message.type === "error" ? "destructive" : message.type}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <SectionCard title={t("webdavConnectionSettings")}>
        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div>
            <label htmlFor="webdav-server-url" className="mb-1.5 block text-sm font-medium text-foreground">
              {t("webdavServerUrl")}
            </label>
            <Input
              id="webdav-server-url"
              type="url"
              value={serverUrl}
              onChange={(event) => setServerUrl(event.target.value)}
              placeholder={t("webdavServerUrlPlaceholder")}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="webdav-username" className="mb-1.5 block text-sm font-medium text-foreground">
                {t("webdavUsername")}
              </label>
              <Input
                id="webdav-username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={t("webdavUsernamePlaceholder")}
              />
            </div>

            <div>
              <label htmlFor="webdav-password" className="mb-1.5 block text-sm font-medium text-foreground">
                {t("webdavPassword")}
              </label>
              <Input
                id="webdav-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("webdavPasswordPlaceholder")}
              />
            </div>
          </div>

          <div>
            <label htmlFor="webdav-remote-directory" className="mb-1.5 block text-sm font-medium text-foreground">
              {t("webdavRemoteDirectory")}
            </label>
            <Input
              id="webdav-remote-directory"
              type="text"
              value={remoteDir}
              onChange={(event) => setRemoteDir(event.target.value)}
              placeholder={DEFAULT_REMOTE_DIR}
            />
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              {t("webdavRemoteDirectoryHelp")}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? <Spinner /> : <Check className="size-4" />}
              {t("saveAndTestWebdavSettings")}
            </Button>
          </div>
        </form>
      </SectionCard>

      {needsAttachmentReauthorization && (
        <Alert variant="warning">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <AlertDescription>
              <span className="block font-medium">{t("attachmentPermissionLost")}</span>
              <span className="mt-1 block">{t("webdavReauthorizeDescription")}</span>
            </AlertDescription>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReauthorizeAttachmentDirectory}
              disabled={isReauthorizing}
              className="shrink-0"
            >
              {isReauthorizing ? <Spinner /> : <FolderOpen className="size-4" />}
              {t("reauthorizeAttachmentDirectory")}
            </Button>
          </div>
        </Alert>
      )}

      <SectionCard contentClassName="p-0">
        <SettingsRow
          title={t("webdavAutoUpload")}
          description={t("webdavAutoUploadDescription")}
          control={(
            <Switch
              checked={autoSync}
              onCheckedChange={handleAutoSyncToggle}
              aria-label={t("webdavAutoUpload")}
              disabled={isAutoSyncSaving}
            />
          )}
        />
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SectionCard title={t("webdavUploadTitle")} description={t("webdavUploadDescription")}>
          <Button
            type="button"
            onClick={handleUpload}
            disabled={isSyncing}
            className="w-full"
          >
            {isSyncing ? <Spinner /> : <UploadCloud className="size-4" />}
            {t("uploadWebdavBackup")}
          </Button>
        </SectionCard>

        <SectionCard title={t("webdavDownloadTitle")}>
          <div className="space-y-2">
            <Button
              type="button"
              onClick={() => handleDownload("append")}
              disabled={isSyncing}
              variant="outline"
              className="w-full"
            >
              {isSyncing ? <Spinner /> : <Plus className="size-4" />}
              {t("appendWebdavBackup")}
            </Button>
            <Button
              type="button"
              onClick={() => handleDownload("replace")}
              disabled={isSyncing}
              variant="outline"
              className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {isSyncing ? <Spinner /> : <RefreshCcw className="size-4" />}
              {t("replaceWebdavBackup")}
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
        <p>{t("webdavAttachmentPermissionNote")}</p>
        <p>{t("webdavAutoUploadTaskNote")}</p>
      </div>
    </div>
  );
};

export default WebDavIntegration;
