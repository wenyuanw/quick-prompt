import {
  WEBDAV_FILENAME,
  WEBDAV_PROMPTS_DIR,
  buildWebDavPromptFileReference,
  deleteWebDavFile,
  deserializeFromWebDavContent,
  deserializeWebDavPromptContent,
  ensureWebDavDirectory,
  getWebDavBlobFile,
  getWebDavTextFile,
  putWebDavFile,
  serializeWebDavManifestContent,
  serializeWebDavPromptContent,
  type WebDavConfig,
  type WebDavPromptFileReference,
} from "@/utils/sync/webdavSync";
import {
  type AttachmentStorageRootHandle,
  copyFileToAttachmentRoot,
  getFileFromAttachmentRoot,
} from "@/utils/attachments/fileSystem";
import { buildPromptAttachmentDirectoryPath } from "@/utils/attachments/metadata";
import type { GlobalSettings } from "@/utils/globalSettings";
import type { Category, PromptAttachment, PromptItem } from "@/utils/types";

export type WebDavBackupDownloadMode = "append" | "replace";

export interface WebDavBackupUploadResult {
  success: boolean;
  uploadedFiles: string[];
  deletedFiles: string[];
  errors: string[];
}

export interface WebDavBackupDownloadResult {
  success: boolean;
  prompts: PromptItem[];
  categories: Category[];
  downloadedFiles: string[];
  errors: string[];
  globalSettings?: GlobalSettings;
}

const getErrorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : String(error)
);

const getPromptAttachments = (prompt: PromptItem): PromptAttachment[] => (
  Array.isArray(prompt.attachments) ? prompt.attachments : []
);

const getAttachmentPaths = (prompts: PromptItem[]): Set<string> => (
  new Set(prompts.flatMap(getPromptAttachments).map((attachment) => attachment.relativePath))
);

interface WebDavRemoteBackupSnapshot {
  prompts: PromptItem[];
  categories: Category[];
  promptFiles: WebDavPromptFileReference[];
  globalSettings?: GlobalSettings;
}

const readRemoteBackupSnapshot = async (config: WebDavConfig): Promise<WebDavRemoteBackupSnapshot> => {
  const content = await getWebDavTextFile(config, WEBDAV_FILENAME);
  const data = deserializeFromWebDavContent(content);

  if (!data.promptFiles?.length) {
    return {
      prompts: data.prompts,
      categories: data.categories,
      promptFiles: [],
      ...(data.globalSettings ? { globalSettings: data.globalSettings } : {}),
    };
  }

  const prompts: PromptItem[] = [];

  for (const promptFile of data.promptFiles) {
    try {
      const promptContent = await getWebDavTextFile(config, promptFile.path);
      prompts.push(deserializeWebDavPromptContent(promptContent));
    } catch (error) {
      throw new Error(`${promptFile.path}: ${getErrorMessage(error)}`);
    }
  }

  return {
    prompts,
    categories: data.categories,
    promptFiles: data.promptFiles,
    ...(data.globalSettings ? { globalSettings: data.globalSettings } : {}),
  };
};

const getRemoteBackupSnapshotForUpload = async (config: WebDavConfig): Promise<WebDavRemoteBackupSnapshot> => {
  try {
    return await readRemoteBackupSnapshot(config);
  } catch {
    return {
      prompts: [],
      categories: [],
      promptFiles: [],
    };
  }
};

const getRemoteParentPath = (relativePath: string): string => {
  const segments = relativePath.split("/").filter(Boolean);
  return segments.slice(0, -1).join("/");
};

const getAttachmentFileName = (attachment: PromptAttachment): string => {
  const pathFileName = attachment.relativePath.split("/").filter(Boolean).at(-1);
  return attachment.name || pathFileName || "attachment";
};

const createFileFromBlob = (blob: Blob, attachment: PromptAttachment): File => (
  new File([blob], getAttachmentFileName(attachment), {
    type: blob.type || attachment.type || "application/octet-stream",
  })
);

const uploadAttachment = async (
  config: WebDavConfig,
  rootHandle: AttachmentStorageRootHandle,
  attachment: PromptAttachment
): Promise<void> => {
  const file = await getFileFromAttachmentRoot(rootHandle, attachment.relativePath);
  await putWebDavFile(
    config,
    attachment.relativePath,
    file,
    file.type || attachment.type || "application/octet-stream"
  );
};

const uploadPromptFile = async (
  config: WebDavConfig,
  prompt: PromptItem
): Promise<string> => {
  const promptFile = buildWebDavPromptFileReference(prompt);
  await putWebDavFile(
    config,
    promptFile.path,
    serializeWebDavPromptContent(prompt),
    "application/json"
  );
  return promptFile.path;
};

const downloadAttachment = async (
  config: WebDavConfig,
  rootHandle: AttachmentStorageRootHandle,
  attachment: PromptAttachment
): Promise<void> => {
  const blob = await getWebDavBlobFile(config, attachment.relativePath);
  await copyFileToAttachmentRoot(rootHandle, attachment.relativePath, createFileFromBlob(blob, attachment));
};

export const uploadWebDavBackup = async (
  config: WebDavConfig,
  rootHandle: AttachmentStorageRootHandle,
  prompts: PromptItem[],
  categories: Category[],
  globalSettings?: GlobalSettings | null
): Promise<WebDavBackupUploadResult> => {
  const uploadedFiles: string[] = [];
  const deletedFiles: string[] = [];
  const errors: string[] = [];
  const remoteSnapshot = await getRemoteBackupSnapshotForUpload(config);
  const remotePromptFilesById = new Map(remoteSnapshot.promptFiles.map((promptFile) => [promptFile.id, promptFile]));
  const currentPromptFileReferences = prompts.map(buildWebDavPromptFileReference);
  const currentPromptFilePaths = new Set(currentPromptFileReferences.map((promptFile) => promptFile.path));
  const promptsToUpload = prompts.filter((prompt) => {
    const localPromptFile = buildWebDavPromptFileReference(prompt);
    const remotePromptFile = remotePromptFilesById.get(prompt.id);

    return (
      !remotePromptFile ||
      remotePromptFile.path !== localPromptFile.path ||
      remotePromptFile.checksum !== localPromptFile.checksum
    );
  });
  const attachments = promptsToUpload.flatMap(getPromptAttachments);
  const currentAttachmentPaths = getAttachmentPaths(prompts);
  const localPromptsById = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const staleRemoteAttachmentPaths = Array.from(getAttachmentPaths(remoteSnapshot.prompts))
    .filter((relativePath) => !currentAttachmentPaths.has(relativePath));
  const staleRemoteAttachmentDirectoryPaths = Array.from(new Set(
    remoteSnapshot.prompts
      .filter((remotePrompt) => {
        const localPrompt = localPromptsById.get(remotePrompt.id);
        return !localPrompt || (
          getPromptAttachments(remotePrompt).length > 0 &&
          getPromptAttachments(localPrompt).length === 0
        );
      })
      .map((remotePrompt) => buildPromptAttachmentDirectoryPath(remotePrompt.id))
  ));
  const staleRemotePromptFilePaths = remoteSnapshot.promptFiles
    .map((promptFile) => promptFile.path)
    .filter((path) => !currentPromptFilePaths.has(path));
  const attachmentParentPaths = Array.from(
    new Set(attachments.map((attachment) => getRemoteParentPath(attachment.relativePath)))
  );

  try {
    await ensureWebDavDirectory(config, "");
  } catch (error) {
    return {
      success: false,
      uploadedFiles,
      deletedFiles,
      errors: [getErrorMessage(error)],
    };
  }

  for (const parentPath of attachmentParentPaths) {
    try {
      await ensureWebDavDirectory(config, parentPath);
    } catch (error) {
      errors.push(`${parentPath || "remote root"}: ${getErrorMessage(error)}`);
    }
  }

  try {
    await ensureWebDavDirectory(config, WEBDAV_PROMPTS_DIR);
  } catch (error) {
    errors.push(`${WEBDAV_PROMPTS_DIR}: ${getErrorMessage(error)}`);
  }

  if (errors.length === 0) {
    for (const attachment of attachments) {
      try {
        await uploadAttachment(config, rootHandle, attachment);
        uploadedFiles.push(attachment.relativePath);
      } catch (error) {
        errors.push(`${attachment.relativePath}: ${getErrorMessage(error)}`);
      }
    }
  }

  if (errors.length === 0) {
    for (const prompt of promptsToUpload) {
      const promptFilePath = buildWebDavPromptFileReference(prompt).path;
      try {
        uploadedFiles.push(await uploadPromptFile(config, prompt));
      } catch (error) {
        errors.push(`${promptFilePath}: ${getErrorMessage(error)}`);
      }
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      uploadedFiles,
      deletedFiles,
      errors,
    };
  }

  try {
    await putWebDavFile(
      config,
      WEBDAV_FILENAME,
      serializeWebDavManifestContent(prompts, categories, globalSettings),
      "application/json"
    );
    uploadedFiles.push(WEBDAV_FILENAME);
  } catch (error) {
    return {
      success: false,
      uploadedFiles,
      deletedFiles,
      errors: [`${WEBDAV_FILENAME}: ${getErrorMessage(error)}`],
    };
  }

  for (const relativePath of staleRemotePromptFilePaths) {
    try {
      await deleteWebDavFile(config, relativePath);
      deletedFiles.push(relativePath);
    } catch (error) {
      errors.push(`${relativePath}: ${getErrorMessage(error)}`);
    }
  }

  const errorsBeforeAttachmentDeletes = errors.length;

  for (const relativePath of staleRemoteAttachmentPaths) {
    try {
      await deleteWebDavFile(config, relativePath);
      deletedFiles.push(relativePath);
    } catch (error) {
      errors.push(`${relativePath}: ${getErrorMessage(error)}`);
    }
  }

  if (errors.length === errorsBeforeAttachmentDeletes) {
    for (const relativePath of staleRemoteAttachmentDirectoryPaths) {
      try {
        await deleteWebDavFile(config, relativePath);
        deletedFiles.push(relativePath);
      } catch (error) {
        errors.push(`${relativePath}: ${getErrorMessage(error)}`);
      }
    }
  }

  return {
    success: errors.length === 0,
    uploadedFiles,
    deletedFiles,
    errors,
  };
};

export const downloadWebDavBackup = async (
  config: WebDavConfig,
  rootHandle: AttachmentStorageRootHandle,
  localPrompts: PromptItem[],
  localCategories: Category[],
  mode: WebDavBackupDownloadMode
): Promise<WebDavBackupDownloadResult> => {
  const downloadedFiles: string[] = [];
  const errors: string[] = [];

  let remoteSnapshot: WebDavRemoteBackupSnapshot;

  try {
    remoteSnapshot = await readRemoteBackupSnapshot(config);
  } catch (error) {
    return {
      success: false,
      prompts: localPrompts,
      categories: localCategories,
      downloadedFiles,
      errors: [getErrorMessage(error)],
    };
  }

  const remotePrompts = remoteSnapshot.prompts;
  const remoteCategories = remoteSnapshot.categories;
  const promptsToDownload = mode === "replace"
    ? remotePrompts
    : remotePrompts.filter((prompt) => !localPrompts.some((localPrompt) => localPrompt.id === prompt.id));

  for (const prompt of promptsToDownload) {
    for (const attachment of getPromptAttachments(prompt)) {
      try {
        await downloadAttachment(config, rootHandle, attachment);
        downloadedFiles.push(attachment.relativePath);
      } catch (error) {
        errors.push(`${attachment.relativePath}: ${getErrorMessage(error)}`);
      }
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      prompts: localPrompts,
      categories: localCategories,
      downloadedFiles,
      errors,
    };
  }

  if (mode === "replace") {
    return {
      success: true,
      prompts: remotePrompts,
      categories: remoteCategories,
      downloadedFiles,
      errors,
      ...(remoteSnapshot.globalSettings
        ? { globalSettings: remoteSnapshot.globalSettings }
        : {}),
    };
  }

  const localPromptIds = new Set(localPrompts.map((prompt) => prompt.id));
  const localCategoryIds = new Set(localCategories.map((category) => category.id));

  return {
    success: true,
    prompts: [
      ...localPrompts,
      ...remotePrompts.filter((prompt) => !localPromptIds.has(prompt.id)),
    ],
    categories: [
      ...localCategories,
      ...remoteCategories.filter((category) => !localCategoryIds.has(category.id)),
    ],
    downloadedFiles,
    errors,
    ...(remoteSnapshot.globalSettings
      ? { globalSettings: remoteSnapshot.globalSettings }
      : {}),
  };
};
