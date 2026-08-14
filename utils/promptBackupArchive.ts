import type { Category, PromptAttachment, PromptItem } from "@/utils/types";
import type { GlobalSettings } from "@/utils/globalSettings";
import { ATTACHMENTS_DIR_NAME } from "@/utils/attachments/metadata";
import {
  type AttachmentStorageRootHandle,
  copyFileToAttachmentRoot,
  getFileFromAttachmentRoot,
} from "@/utils/attachments/fileSystem";
import {
  WEBDAV_FILENAME,
  buildWebDavPromptFileReference,
  deserializeFromWebDavContent,
  deserializeWebDavPromptContent,
  serializeWebDavManifestContent,
  serializeWebDavPromptContent,
} from "@/utils/sync/webdavSync";
import { validateAndNormalizePrompts } from "@/utils/promptUtils";
import {
  createZipArchive,
  isZipArchiveData,
  readBlobAsUint8Array,
  readZipArchive,
  type ZipArchiveEntry,
  type ZipArchiveInputEntry,
} from "@/utils/zipArchive";

export type PromptBackupSourceFormat = "json" | "zip";

export interface PromptBackupAttachmentFile {
  relativePath: string;
  file: File;
}

export interface ParsedPromptBackup {
  sourceFormat: PromptBackupSourceFormat;
  prompts: PromptItem[];
  categories: Category[];
  attachmentFiles: PromptBackupAttachmentFile[];
  /** Optional; absent in older backups for backward compatibility */
  globalSettings?: GlobalSettings;
}

export interface CategoryMergeResult {
  categories: Category[];
  addedCount: number;
  updatedCount: number;
}

const textDecoder = new TextDecoder();

const getErrorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : String(error)
);

const getPromptAttachments = (prompt: PromptItem): PromptAttachment[] => (
  Array.isArray(prompt.attachments) ? prompt.attachments : []
);

const normalizeBackupPath = (path: string): string => {
  const normalizedPath = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalizedPath.split("/").filter(Boolean);

  if (segments.length === 0) {
    throw new Error("Backup path is empty");
  }

  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Backup path is outside the archive root");
  }

  return `${segments.join("/")}${normalizedPath.endsWith("/") ? "/" : ""}`;
};

const isDirectoryEntry = (path: string): boolean => path.endsWith("/");

const isAttachmentPath = (path: string): boolean => (
  path.startsWith(`${ATTACHMENTS_DIR_NAME}/`) && !isDirectoryEntry(path)
);

const getFileNameFromPath = (path: string): string => (
  path.split("/").filter(Boolean).at(-1) || "attachment"
);

const createFileFromBytes = (path: string, data: Uint8Array, type?: string): File => (
  new File([data], getFileNameFromPath(path), {
    type: type || "application/octet-stream",
  })
);

const normalizeBackupCategories = (categories: unknown): Category[] => {
  if (!Array.isArray(categories)) {
    return [];
  }

  return categories
    .filter((category): category is Partial<Category> => (
      typeof category === "object" &&
      category !== null &&
      typeof (category as Category).id === "string" &&
      typeof (category as Category).name === "string"
    ))
    .map((category) => {
      const now = new Date().toISOString();

      return {
        id: category.id!,
        name: category.name!,
        description: typeof category.description === "string" ? category.description : "",
        color: typeof category.color === "string" ? category.color : "#6366f1",
        enabled: typeof category.enabled === "boolean" ? category.enabled : true,
        createdAt: typeof category.createdAt === "string" ? category.createdAt : now,
        updatedAt: typeof category.updatedAt === "string" ? category.updatedAt : now,
      };
    });
};

export const mergePromptBackupCategories = (
  existingCategories: Category[],
  importedCategories: Category[]
): CategoryMergeResult => {
  const categoriesMap = new Map(existingCategories.map((category) => [category.id, category]));
  let addedCount = 0;
  let updatedCount = 0;

  importedCategories.forEach((category) => {
    const existingCategory = categoriesMap.get(category.id);

    if (!existingCategory) {
      categoriesMap.set(category.id, category);
      addedCount += 1;
      return;
    }

    const updatedCategory = { ...existingCategory, ...category };
    const { updatedAt: _existingUpdatedAt, ...existingComparable } = existingCategory;
    const { updatedAt: _updatedAt, ...updatedComparable } = updatedCategory;

    if (JSON.stringify(existingComparable) !== JSON.stringify(updatedComparable)) {
      categoriesMap.set(category.id, updatedCategory);
      updatedCount += 1;
    }
  });

  return {
    categories: Array.from(categoriesMap.values()),
    addedCount,
    updatedCount,
  };
};

const getAttachmentTypeByPath = (prompts: PromptItem[]): Map<string, string> => (
  new Map(
    prompts
      .flatMap(getPromptAttachments)
      .map((attachment) => [normalizeBackupPath(attachment.relativePath), attachment.type])
  )
);

const getReferencedAttachmentPaths = (prompts: PromptItem[]): string[] => (
  Array.from(new Set(
    prompts
      .flatMap(getPromptAttachments)
      .map((attachment) => normalizeBackupPath(attachment.relativePath))
      .filter(isAttachmentPath)
  ))
);

export const createPromptBackupZip = async (
  rootHandle: AttachmentStorageRootHandle | undefined,
  prompts: PromptItem[],
  categories: Category[],
  globalSettings?: GlobalSettings | null
): Promise<Blob> => {
  const entries: ZipArchiveInputEntry[] = [
    { path: "prompts/", data: new Uint8Array() },
  ];
  const attachmentPaths = getReferencedAttachmentPaths(prompts);

  if (attachmentPaths.length > 0) {
    if (!rootHandle) {
      throw new Error("Attachment root is required to export attachment files");
    }

    entries.push({ path: `${ATTACHMENTS_DIR_NAME}/`, data: new Uint8Array() });

    for (const relativePath of attachmentPaths) {
      try {
        entries.push({
          path: relativePath,
          data: await getFileFromAttachmentRoot(rootHandle, relativePath),
        });
      } catch (error) {
        throw new Error(`${relativePath}: ${getErrorMessage(error)}`);
      }
    }
  }

  prompts.forEach((prompt) => {
    const promptFile = buildWebDavPromptFileReference(prompt);
    entries.push({
      path: promptFile.path,
      data: serializeWebDavPromptContent(prompt),
    });
  });

  entries.push({
    path: WEBDAV_FILENAME,
    data: serializeWebDavManifestContent(prompts, categories, globalSettings),
  });

  return createZipArchive(entries);
};

const buildEntryMap = (entries: ZipArchiveEntry[]): Map<string, ZipArchiveEntry> => (
  new Map(entries.map((entry) => [normalizeBackupPath(entry.path), {
    ...entry,
    path: normalizeBackupPath(entry.path),
  }]))
);

const parseJsonBackup = (content: string): ParsedPromptBackup => {
  const data = JSON.parse(content);

  if (Array.isArray(data)) {
    return {
      sourceFormat: "json",
      prompts: validateAndNormalizePrompts(data),
      categories: [],
      attachmentFiles: [],
    };
  }

  const backup = deserializeFromWebDavContent(content);

  return {
    sourceFormat: "json",
    prompts: validateAndNormalizePrompts(backup.prompts),
    categories: normalizeBackupCategories(backup.categories),
    attachmentFiles: [],
    ...(backup.globalSettings ? { globalSettings: backup.globalSettings } : {}),
  };
};

const parseZipBackup = async (bytes: Uint8Array): Promise<ParsedPromptBackup> => {
  const entries = await readZipArchive(bytes);
  const entryMap = buildEntryMap(entries);
  const manifestEntry = entryMap.get(WEBDAV_FILENAME);

  if (!manifestEntry) {
    throw new Error(`Backup zip is missing ${WEBDAV_FILENAME}`);
  }

  const backup = deserializeFromWebDavContent(textDecoder.decode(manifestEntry.data));
  const prompts = backup.promptFiles?.length
    ? backup.promptFiles.map((promptFile) => {
      const promptPath = normalizeBackupPath(promptFile.path);
      const promptEntry = entryMap.get(promptPath);

      if (!promptEntry) {
        throw new Error(`Backup zip is missing ${promptPath}`);
      }

      return deserializeWebDavPromptContent(textDecoder.decode(promptEntry.data));
    })
    : backup.prompts;
  const normalizedPrompts = validateAndNormalizePrompts(prompts);
  const attachmentTypeByPath = getAttachmentTypeByPath(normalizedPrompts);
  const attachmentFiles = getReferencedAttachmentPaths(normalizedPrompts).map((relativePath) => {
    const attachmentEntry = entryMap.get(relativePath);

    if (!attachmentEntry) {
      throw new Error(`Backup zip is missing ${relativePath}`);
    }

    return {
      relativePath,
      file: createFileFromBytes(relativePath, attachmentEntry.data, attachmentTypeByPath.get(relativePath)),
    };
  });

  return {
    sourceFormat: "zip",
    prompts: normalizedPrompts,
    categories: normalizeBackupCategories(backup.categories),
    attachmentFiles,
    ...(backup.globalSettings ? { globalSettings: backup.globalSettings } : {}),
  };
};

export const parsePromptBackupBlob = async (source: Blob | ArrayBuffer | Uint8Array): Promise<ParsedPromptBackup> => {
  const bytes = source instanceof Blob
    ? await readBlobAsUint8Array(source)
    : ArrayBuffer.isView(source)
      ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
      : new Uint8Array(source);

  if (isZipArchiveData(bytes)) {
    return parseZipBackup(bytes);
  }

  return parseJsonBackup(textDecoder.decode(bytes));
};

export const restorePromptBackupAttachments = async (
  rootHandle: AttachmentStorageRootHandle,
  attachmentFiles: PromptBackupAttachmentFile[]
): Promise<void> => {
  for (const attachmentFile of attachmentFiles) {
    await copyFileToAttachmentRoot(rootHandle, attachmentFile.relativePath, attachmentFile.file);
  }
};
