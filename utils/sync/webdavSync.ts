import type { Category, PromptItem } from "@/utils/types";
import {
  parseBackupGlobalSettings,
  type GlobalSettings,
} from "@/utils/globalSettings";

export const WEBDAV_FILENAME = "quick-prompt-backup.json";
export const WEBDAV_CURRENT_VERSION = "1.0";
export const WEBDAV_PROMPTS_DIR = "prompts";
export const WEBDAV_PROMPT_FILES_FORMAT = "prompt-files";

export const WEBDAV_STORAGE_KEYS = {
  SERVER_URL: "webdavServerUrl",
  USERNAME: "webdavUsername",
  PASSWORD: "webdavPassword",
  REMOTE_DIR: "webdavRemoteDir",
  AUTO_SYNC: "webdavAutoSync",
  SYNC_STATUS: "webdav_sync_status",
} as const;

export interface WebDavConfig {
  serverUrl: string;
  username: string;
  password: string;
  remoteDir: string;
  autoSync: boolean;
}

export interface WebDavExportData {
  version: string;
  exportedAt: string;
  prompts: PromptItem[];
  promptFiles?: WebDavPromptFileReference[];
  categories: Category[];
  storageFormat?: string;
  /** Optional; absent in older backups for backward compatibility */
  globalSettings?: GlobalSettings;
}

export interface WebDavPromptFileReference {
  id: string;
  path: string;
  checksum: string;
  lastModified?: string;
}

interface WebDavPromptFileContent {
  version: string;
  exportedAt: string;
  prompt: PromptItem;
}

export const normalizeWebDavBaseUrl = (url: string): string => url.trim().replace(/\/+$/, "");

export const joinWebDavPath = (...parts: string[]): string => (
  parts
    .map((part) => part.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/")
);

export const buildWebDavUrl = (serverUrl: string, ...parts: string[]): string => {
  const baseUrl = normalizeWebDavBaseUrl(serverUrl);
  const path = joinWebDavPath(...parts);

  return path ? `${baseUrl}/${path}` : baseUrl;
};

const hashString = (value: string): string => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
};

const encodePromptIdForFileName = (promptId: string): string => (
  encodeURIComponent(promptId).replace(/~/g, "~7E").replace(/%/g, "~")
);

export const buildWebDavPromptFilePath = (promptId: string): string => (
  joinWebDavPath(WEBDAV_PROMPTS_DIR, `${encodePromptIdForFileName(promptId)}.json`)
);

export const getWebDavPromptChecksum = (prompt: PromptItem): string => (
  hashString(JSON.stringify(prompt))
);

export const buildWebDavPromptFileReference = (prompt: PromptItem): WebDavPromptFileReference => ({
  id: prompt.id,
  path: buildWebDavPromptFilePath(prompt.id),
  checksum: getWebDavPromptChecksum(prompt),
  ...(prompt.lastModified ? { lastModified: prompt.lastModified } : {}),
});

const getSafeWebDavPathSegments = (path: string): string[] => {
  const segments = path.trim().replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);

  for (const segment of segments) {
    let decodedSegment: string;
    try {
      decodedSegment = decodeURIComponent(segment);
    } catch {
      throw new Error("WebDAV path is outside the configured WebDAV remote directory");
    }

    if (
      decodedSegment === "." ||
      decodedSegment === ".." ||
      decodedSegment.includes("/") ||
      decodedSegment.includes("\\")
    ) {
      throw new Error("WebDAV path is outside the configured WebDAV remote directory");
    }
  }

  return segments;
};

const buildConfiguredWebDavPath = (config: WebDavConfig, relativePath: string): string => {
  const remoteDirSegments = getSafeWebDavPathSegments(config.remoteDir);
  const relativePathSegments = getSafeWebDavPathSegments(relativePath);

  if (remoteDirSegments.length === 0) {
    throw new Error("WebDAV remote directory is required");
  }

  return joinWebDavPath(...remoteDirSegments, ...relativePathSegments);
};

export const getWebDavHeaders = (
  username: string,
  password: string,
  contentType?: string
): Record<string, string> => {
  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(`${username}:${password}`)}`,
  };

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  return headers;
};

export const serializeToWebDavContent = (
  prompts: PromptItem[],
  categories: Category[],
  globalSettings?: GlobalSettings | null
): string => {
  const data: WebDavExportData = {
    version: WEBDAV_CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    prompts,
    categories,
    ...(globalSettings ? { globalSettings } : {}),
  };

  return JSON.stringify(data, null, 2);
};

export const serializeWebDavManifestContent = (
  prompts: PromptItem[],
  categories: Category[],
  globalSettings?: GlobalSettings | null
): string => {
  // Keep the legacy manifest shape (no inline prompts array) and only
  // append globalSettings when present for backward-compatible readers.
  const data = {
    version: WEBDAV_CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    storageFormat: WEBDAV_PROMPT_FILES_FORMAT,
    promptFiles: prompts.map(buildWebDavPromptFileReference),
    categories,
    ...(globalSettings ? { globalSettings } : {}),
  };

  return JSON.stringify(data, null, 2);
};

export const serializeWebDavPromptContent = (prompt: PromptItem): string => {
  const data: WebDavPromptFileContent = {
    version: WEBDAV_CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    prompt,
  };

  return JSON.stringify(data, null, 2);
};

export const deserializeWebDavPromptContent = (content: string): PromptItem => {
  const data = JSON.parse(content);
  const prompt = data && typeof data === "object" && "prompt" in data
    ? (data as WebDavPromptFileContent).prompt
    : data;

  if (!prompt || typeof prompt !== "object" || typeof (prompt as PromptItem).id !== "string") {
    throw new Error("WebDAV prompt file must include a prompt object");
  }

  return prompt as PromptItem;
};

const normalizePromptFileReferences = (promptFiles: unknown): WebDavPromptFileReference[] => {
  if (!Array.isArray(promptFiles)) {
    return [];
  }

  return promptFiles
    .filter((item): item is Partial<WebDavPromptFileReference> => (
      typeof item === "object" &&
      item !== null &&
      typeof (item as WebDavPromptFileReference).id === "string" &&
      typeof (item as WebDavPromptFileReference).path === "string"
    ))
    .map((item) => ({
      id: item.id!,
      path: item.path!,
      checksum: typeof item.checksum === "string" ? item.checksum : "",
      ...(typeof item.lastModified === "string" ? { lastModified: item.lastModified } : {}),
    }));
};

export const deserializeFromWebDavContent = (content: string): WebDavExportData => {
  const data = JSON.parse(content);
  const promptFiles = normalizePromptFileReferences(data.promptFiles);
  const isPromptFileManifest = data.storageFormat === WEBDAV_PROMPT_FILES_FORMAT || Array.isArray(data.promptFiles);
  const globalSettings = parseBackupGlobalSettings(data.globalSettings);

  if (!Array.isArray(data.prompts) && !isPromptFileManifest) {
    throw new Error("WebDAV backup data must include a prompts array or promptFiles array");
  }

  return {
    version: data.version || WEBDAV_CURRENT_VERSION,
    exportedAt: data.exportedAt || new Date().toISOString(),
    prompts: Array.isArray(data.prompts) ? data.prompts : [],
    promptFiles,
    categories: Array.isArray(data.categories) ? data.categories : [],
    ...(typeof data.storageFormat === "string" ? { storageFormat: data.storageFormat } : {}),
    ...(globalSettings ? { globalSettings } : {}),
  };
};

export const parseWebDavMultiStatus = (xml: string): string[] => {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parseError = document.getElementsByTagName("parsererror")[0];

  if (parseError) {
    throw new Error("Invalid WebDAV multistatus XML");
  }

  const hrefElements = document.getElementsByTagNameNS("DAV:", "href");
  const fallbackHrefElements = hrefElements.length > 0
    ? []
    : Array.from(document.getElementsByTagName("href"));
  const elements = hrefElements.length > 0 ? Array.from(hrefElements) : fallbackHrefElements;

  return elements.map((element) => element.textContent?.trim() || "").filter(Boolean);
};

export const buildConfiguredWebDavUrl = (config: WebDavConfig, relativePath: string): string => (
  buildWebDavUrl(config.serverUrl, buildConfiguredWebDavPath(config, relativePath))
);

const getResponseBodySnippet = async (response: Response): Promise<string> => {
  try {
    const body = await response.clone().text();
    return body.replace(/\s+/g, " ").trim().slice(0, 200);
  } catch {
    return "";
  }
};

const assertWebDavResponse = async (response: Response, action: string): Promise<void> => {
  if (response.ok) {
    return;
  }

  const status = [`HTTP ${response.status}`, response.statusText].filter(Boolean).join(" ");
  const bodySnippet = await getResponseBodySnippet(response);
  const message = bodySnippet ? `${status} - ${bodySnippet}` : status;

  throw new Error(`WebDAV ${action} failed: ${message}`);
};

export const ensureWebDavDirectory = async (
  config: WebDavConfig,
  path: string
): Promise<void> => {
  const remoteDirSegments = getSafeWebDavPathSegments(config.remoteDir);
  const pathSegments = getSafeWebDavPathSegments(path);

  if (remoteDirSegments.length === 0) {
    throw new Error("WebDAV remote directory is required");
  }

  const directoryPaths = [
    joinWebDavPath(...remoteDirSegments),
    ...pathSegments.map((_, index) => (
      joinWebDavPath(...remoteDirSegments, ...pathSegments.slice(0, index + 1))
    )),
  ];

  for (const directoryPath of directoryPaths) {
    const response = await fetch(buildWebDavUrl(config.serverUrl, directoryPath), {
      method: "MKCOL",
      headers: getWebDavHeaders(config.username, config.password),
    });

    if (response.status === 405) {
      continue;
    }

    await assertWebDavResponse(response, "MKCOL");
  }
};

export const testWebDavConnection = async (config: WebDavConfig): Promise<void> => {
  await ensureWebDavDirectory(config, "");

  const response = await fetch(buildConfiguredWebDavUrl(config, ""), {
    method: "PROPFIND",
    headers: {
      ...getWebDavHeaders(config.username, config.password),
      Depth: "0",
    },
  });

  if (response.status === 207 || response.ok) {
    return;
  }

  await assertWebDavResponse(response, "PROPFIND");
};

export const putWebDavFile = async (
  config: WebDavConfig,
  relativePath: string,
  body: BodyInit,
  contentType?: string
): Promise<void> => {
  const response = await fetch(buildConfiguredWebDavUrl(config, relativePath), {
    method: "PUT",
    headers: getWebDavHeaders(config.username, config.password, contentType),
    body,
  });

  await assertWebDavResponse(response, "PUT");
};

export const deleteWebDavFile = async (
  config: WebDavConfig,
  relativePath: string
): Promise<void> => {
  const response = await fetch(buildConfiguredWebDavUrl(config, relativePath), {
    method: "DELETE",
    headers: getWebDavHeaders(config.username, config.password),
  });

  if (response.status === 404) {
    return;
  }

  await assertWebDavResponse(response, "DELETE");
};

export const getWebDavTextFile = async (
  config: WebDavConfig,
  relativePath: string
): Promise<string> => {
  const response = await fetch(buildConfiguredWebDavUrl(config, relativePath), {
    method: "GET",
    headers: getWebDavHeaders(config.username, config.password),
  });

  await assertWebDavResponse(response, "GET");

  return response.text();
};

export const getWebDavBlobFile = async (
  config: WebDavConfig,
  relativePath: string
): Promise<Blob> => {
  const response = await fetch(buildConfiguredWebDavUrl(config, relativePath), {
    method: "GET",
    headers: getWebDavHeaders(config.username, config.password),
  });

  await assertWebDavResponse(response, "GET");

  return response.blob();
};
