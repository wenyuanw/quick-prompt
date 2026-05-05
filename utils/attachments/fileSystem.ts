import { getAttachmentPathSegments } from "@/utils/attachments/metadata";

const DB_NAME = "quick-prompt-attachments";
const DB_VERSION = 2;
const HANDLE_STORE_NAME = "handles";
const FILE_STORE_NAME = "files";
const ATTACHMENT_ROOT_KEY = "attachmentRoot";
const ATTACHMENT_STORAGE_MODE_KEY = "attachmentStorageMode";

export type AttachmentStorageMode = "internal" | "external";

export type InternalAttachmentRootHandle = {
  kind: "directory";
  name: string;
  readonly __quickPromptInternalAttachmentRoot: true;
};

export type AttachmentStorageRootHandle = FileSystemDirectoryHandle | InternalAttachmentRootHandle;

const INTERNAL_ATTACHMENT_ROOT_HANDLE: InternalAttachmentRootHandle = Object.freeze({
  kind: "directory",
  name: "Quick Prompt Built-in Storage",
  __quickPromptInternalAttachmentRoot: true,
});

export const isInternalAttachmentRoot = (
  handle: AttachmentStorageRootHandle | FileSystemHandle
): handle is InternalAttachmentRootHandle => (
  Boolean((handle as Partial<InternalAttachmentRootHandle>).__quickPromptInternalAttachmentRoot)
);

const openAttachmentDatabase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        db.createObjectStore(HANDLE_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(FILE_STORE_NAME)) {
        db.createObjectStore(FILE_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const runHandleStoreRequest = <T>(
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => runStoreRequest(HANDLE_STORE_NAME, mode, createRequest);

const runAttachmentFileStoreRequest = <T>(
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => runStoreRequest(FILE_STORE_NAME, mode, createRequest);

const runStoreRequest = <T>(
  storeName: string,
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  return openAttachmentDatabase().then((db) => {
    return new Promise<T>((resolve, reject) => {
      let requestResult: T | undefined;
      let settled = false;

      const resolveAndClose = () => {
        if (settled) return;
        settled = true;
        db.close();
        resolve(requestResult as T);
      };
      const rejectAndClose = (error: unknown) => {
        if (settled) return;
        settled = true;
        db.close();
        reject(error);
      };

      try {
        const transaction = db.transaction(storeName, mode);
        const request = createRequest(transaction.objectStore(storeName));

        request.onsuccess = () => {
          requestResult = request.result;
        };
        request.onerror = () => rejectAndClose(request.error ?? transaction.error);
        transaction.oncomplete = () => resolveAndClose();
        transaction.onerror = () => rejectAndClose(transaction.error ?? request.error);
        transaction.onabort = () => rejectAndClose(transaction.error ?? request.error);
      } catch (error) {
        rejectAndClose(error);
      }
    });
  });
};

const getAttachmentFilePathParts = (relativePath: string): { parentSegments: string[]; fileName: string } => {
  const segments = getAttachmentPathSegments(relativePath);
  const fileName = segments.at(-1);

  if (!fileName) {
    throw new DOMException("Attachment path is empty", "NotFoundError");
  }

  return {
    parentSegments: segments.slice(0, -1),
    fileName,
  };
};

const withTextReader = (file: File): File => {
  if ("text" in file && typeof file.text === "function") {
    return file;
  }

  Object.defineProperty(file, "text", {
    value: () =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      }),
  });

  return file;
};

const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
};

const createInternalAttachmentSnapshot = async (file: File): Promise<Blob> => {
  const buffer = await readFileAsArrayBuffer(file);
  return new Blob([buffer], { type: file.type || "application/octet-stream" });
};

const getFileNameFromRelativePath = (relativePath: string): string => (
  getAttachmentFilePathParts(relativePath).fileName
);

const getAttachmentDirectoryPathParts = (relativePath: string): { parentSegments: string[]; directoryName: string } => {
  const segments = getAttachmentPathSegments(relativePath);
  const directoryName = segments.at(-1);

  if (!directoryName) {
    throw new DOMException("Attachment directory path is empty", "NotFoundError");
  }

  return {
    parentSegments: segments.slice(0, -1),
    directoryName,
  };
};

const isNotFoundError = (error: unknown): boolean => (
  error instanceof DOMException && error.name === "NotFoundError"
);

const removeInternalAttachmentDirectory = async (relativePath: string): Promise<void> => {
  getAttachmentDirectoryPathParts(relativePath);
  const directoryPrefix = `${relativePath.replace(/\/+$/g, "")}/`;
  const keys = await runAttachmentFileStoreRequest<IDBValidKey[]>("readonly", (store) =>
    store.getAllKeys()
  );
  const matchingKeys = keys.filter((key): key is string => (
    typeof key === "string" && key.startsWith(directoryPrefix)
  ));

  if (matchingKeys.length === 0) {
    return;
  }

  await runAttachmentFileStoreRequest("readwrite", (store) => {
    let request: IDBRequest<undefined> | undefined;

    matchingKeys.forEach((key) => {
      request = store.delete(key);
    });

    return request!;
  });
};

const getInternalAttachmentFile = async (relativePath: string): Promise<File> => {
  getAttachmentFilePathParts(relativePath);

  const storedFile = await runAttachmentFileStoreRequest<File | Blob | undefined>("readonly", (store) =>
    store.get(relativePath)
  );

  if (!storedFile) {
    throw new DOMException("Attachment file not found", "NotFoundError");
  }

  if (storedFile instanceof File) {
    return withTextReader(storedFile);
  }

  return withTextReader(new File([storedFile], getFileNameFromRelativePath(relativePath), {
    type: storedFile.type || "application/octet-stream",
  }));
};

export const saveAttachmentRootHandle = (handle: FileSystemDirectoryHandle): Promise<void> => {
  return runHandleStoreRequest("readwrite", (store) => store.put(handle, ATTACHMENT_ROOT_KEY)).then(() => {});
};

const getStoredAttachmentRootHandle = (): Promise<FileSystemDirectoryHandle | undefined> => {
  return runHandleStoreRequest<FileSystemDirectoryHandle | undefined>("readonly", (store) =>
    store.get(ATTACHMENT_ROOT_KEY)
  );
};

export const getAttachmentStorageMode = async (): Promise<AttachmentStorageMode | undefined> => {
  const mode = await runHandleStoreRequest<AttachmentStorageMode | undefined>("readonly", (store) =>
    store.get(ATTACHMENT_STORAGE_MODE_KEY)
  );

  return mode === "internal" || mode === "external" ? mode : undefined;
};

export const saveAttachmentStorageMode = (mode: AttachmentStorageMode): Promise<void> => {
  return runHandleStoreRequest("readwrite", (store) => store.put(mode, ATTACHMENT_STORAGE_MODE_KEY)).then(() => {});
};

export const useInternalAttachmentStorage = async (): Promise<InternalAttachmentRootHandle> => {
  await saveAttachmentStorageMode("internal");
  return INTERNAL_ATTACHMENT_ROOT_HANDLE;
};

export const getInternalAttachmentRootHandle = (): InternalAttachmentRootHandle => {
  return INTERNAL_ATTACHMENT_ROOT_HANDLE;
};

export const getAttachmentRootHandle = async (): Promise<AttachmentStorageRootHandle | undefined> => {
  const mode = await getAttachmentStorageMode();

  if (mode === "internal") {
    return INTERNAL_ATTACHMENT_ROOT_HANDLE;
  }

  const handle = await getStoredAttachmentRootHandle();
  if (handle && !mode) {
    await saveAttachmentStorageMode("external");
  }

  return handle;
};

const READ_WRITE_PERMISSION: FileSystemHandlePermissionDescriptor = { mode: "readwrite" };

export const hasReadWritePermission = async (handle: AttachmentStorageRootHandle | FileSystemHandle): Promise<boolean> => {
  if (isInternalAttachmentRoot(handle)) {
    return true;
  }

  return (await handle.queryPermission(READ_WRITE_PERMISSION)) === "granted";
};

export const verifyReadWritePermission = async (handle: AttachmentStorageRootHandle | FileSystemHandle): Promise<boolean> => {
  if (await hasReadWritePermission(handle)) {
    return true;
  }

  if (isInternalAttachmentRoot(handle)) {
    return true;
  }

  return (await handle.requestPermission(READ_WRITE_PERMISSION)) === "granted";
};

export const pickAndStoreAttachmentRoot = async (): Promise<FileSystemDirectoryHandle> => {
  if (typeof window.showDirectoryPicker !== "function") {
    throw new DOMException("File System Access API is not available", "NotSupportedError");
  }

  const handle = await window.showDirectoryPicker({ mode: "readwrite" });

  if (!(await verifyReadWritePermission(handle))) {
    throw new DOMException("Read/write permission denied", "NotAllowedError");
  }

  await saveAttachmentRootHandle(handle);
  await saveAttachmentStorageMode("external");
  return handle;
};

export const getDirectoryForSegments = async (
  rootHandle: FileSystemDirectoryHandle,
  segments: string[],
  create: boolean
): Promise<FileSystemDirectoryHandle> => {
  let current = rootHandle;

  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create });
  }

  return current;
};

export const copyFileToAttachmentRoot = async (
  rootHandle: AttachmentStorageRootHandle,
  relativePath: string,
  file: File
): Promise<void> => {
  if (isInternalAttachmentRoot(rootHandle)) {
    getAttachmentFilePathParts(relativePath);
    const snapshot = await createInternalAttachmentSnapshot(file);
    await runAttachmentFileStoreRequest("readwrite", (store) => store.put(snapshot, relativePath));
    return;
  }

  const { parentSegments, fileName } = getAttachmentFilePathParts(relativePath);

  const directory = await getDirectoryForSegments(rootHandle, parentSegments, true);
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();

  await writable.write(file);
  await writable.close();
};

export const getFileFromAttachmentRoot = async (
  rootHandle: AttachmentStorageRootHandle,
  relativePath: string
): Promise<File> => {
  if (isInternalAttachmentRoot(rootHandle)) {
    return getInternalAttachmentFile(relativePath);
  }

  const { parentSegments, fileName } = getAttachmentFilePathParts(relativePath);

  const directory = await getDirectoryForSegments(rootHandle, parentSegments, false);
  const fileHandle = await directory.getFileHandle(fileName);
  return withTextReader(await fileHandle.getFile());
};

export const removeAttachmentFileFromRoot = async (
  rootHandle: AttachmentStorageRootHandle,
  relativePath: string
): Promise<void> => {
  if (isInternalAttachmentRoot(rootHandle)) {
    await getInternalAttachmentFile(relativePath);
    await runAttachmentFileStoreRequest("readwrite", (store) => store.delete(relativePath));
    return;
  }

  const { parentSegments, fileName } = getAttachmentFilePathParts(relativePath);

  const directory = await getDirectoryForSegments(rootHandle, parentSegments, false);
  await directory.removeEntry(fileName);
};

export const removeAttachmentDirectoryFromRoot = async (
  rootHandle: AttachmentStorageRootHandle,
  relativePath: string
): Promise<void> => {
  if (isInternalAttachmentRoot(rootHandle)) {
    await removeInternalAttachmentDirectory(relativePath);
    return;
  }

  const { parentSegments, directoryName } = getAttachmentDirectoryPathParts(relativePath);

  try {
    const directory = await getDirectoryForSegments(rootHandle, parentSegments, false);
    await directory.removeEntry(directoryName, { recursive: true });
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }

    throw error;
  }
};
