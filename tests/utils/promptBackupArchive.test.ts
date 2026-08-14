import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Category, PromptItem } from "@/utils/types";
import { WEBDAV_FILENAME } from "@/utils/sync/webdavSync";
import {
  createPromptBackupZip,
  mergePromptBackupCategories,
  parsePromptBackupBlob,
  restorePromptBackupAttachments,
} from "@/utils/promptBackupArchive";
import { readZipArchive } from "@/utils/zipArchive";

vi.mock("@/utils/attachments/fileSystem", () => ({
  copyFileToAttachmentRoot: vi.fn(),
  getFileFromAttachmentRoot: vi.fn(),
}));

const fileSystem = await import("@/utils/attachments/fileSystem");
const textDecoder = new TextDecoder();

const rootHandle = { name: "attachments" } as FileSystemDirectoryHandle;

const createCategory = (overrides: Partial<Category> = {}): Category => ({
  id: "default",
  name: "Default",
  enabled: true,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  ...overrides,
});

const createPrompt = (overrides: Partial<PromptItem> = {}): PromptItem => ({
  id: "prompt-1",
  title: "Prompt",
  content: "Content",
  tags: ["tag"],
  enabled: true,
  categoryId: "default",
  lastModified: "2024-01-01T00:00:00.000Z",
  attachments: [
    {
      id: "attachment-1",
      name: "guide.pdf",
      type: "application/pdf",
      size: 11,
      relativePath: "attachments/prompt-1/attachment-1-guide.pdf",
      createdAt: "2024-01-01T00:00:00.000Z",
    },
  ],
  ...overrides,
});

describe("prompt backup archive helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports a full zip backup with manifest, prompt files, categories, and attachments", async () => {
    const prompt = createPrompt();
    const categories = [createCategory()];
    vi.mocked(fileSystem.getFileFromAttachmentRoot).mockResolvedValue(
      new File(["pdf content"], "guide.pdf", { type: "application/pdf" })
    );

    const archive = await createPromptBackupZip(rootHandle, [prompt], categories);
    const entries = await readZipArchive(archive);
    const entryPaths = entries.map((entry) => entry.path);

    expect(entryPaths).toEqual([
      "prompts/",
      "attachments/",
      "attachments/prompt-1/attachment-1-guide.pdf",
      "prompts/prompt-1.json",
      WEBDAV_FILENAME,
    ]);

    const manifest = JSON.parse(textDecoder.decode(entries.find((entry) => entry.path === WEBDAV_FILENAME)?.data));
    expect(manifest).toMatchObject({
      storageFormat: "prompt-files",
      categories,
      promptFiles: [expect.objectContaining({ id: "prompt-1", path: "prompts/prompt-1.json" })],
    });
    expect(manifest.globalSettings).toBeUndefined();

    const promptFile = JSON.parse(textDecoder.decode(entries.find((entry) => entry.path === "prompts/prompt-1.json")?.data));
    expect(promptFile).toMatchObject({ prompt });
    expect(textDecoder.decode(entries.find((entry) => entry.path === "attachments/prompt-1/attachment-1-guide.pdf")?.data)).toBe("pdf content");
  });

  it("exports and parses globalSettings in zip backups while accepting legacy archives", async () => {
    const settings = {
      closeModalOnOutsideClick: true,
      quickInjectEnabled: true,
      quickInjectOnFocus: true,
      quickInjectMode: "append" as const,
      quickInjectRules: [{ domain: "claude.ai", promptId: "prompt-1" }],
    };
    const archive = await createPromptBackupZip(
      undefined,
      [createPrompt({ attachments: [] })],
      [createCategory()],
      settings
    );
    const parsed = await parsePromptBackupBlob(archive);
    expect(parsed.globalSettings).toEqual(settings);

    const legacyJson = JSON.stringify({
      version: "1.0",
      exportedAt: "2024-01-01T00:00:00.000Z",
      prompts: [createPrompt({ attachments: [] })],
      categories: [createCategory()],
    });
    const legacyParsed = await parsePromptBackupBlob(new Blob([legacyJson], { type: "application/json" }));
    expect(legacyParsed.globalSettings).toBeUndefined();
    expect(legacyParsed.prompts).toEqual([expect.objectContaining({ id: "prompt-1" })]);
  });

  it("parses a zip backup and restores attachment files", async () => {
    const prompt = createPrompt();
    vi.mocked(fileSystem.getFileFromAttachmentRoot).mockResolvedValue(
      new File(["pdf content"], "guide.pdf", { type: "application/pdf" })
    );
    const archive = await createPromptBackupZip(rootHandle, [prompt], [createCategory()]);

    const parsed = await parsePromptBackupBlob(archive);
    expect(parsed.prompts).toEqual([expect.objectContaining({ id: "prompt-1", attachments: prompt.attachments })]);
    expect(parsed.categories).toEqual([expect.objectContaining({ id: "default" })]);
    expect(parsed.attachmentFiles).toHaveLength(1);

    await restorePromptBackupAttachments(rootHandle, parsed.attachmentFiles);

    expect(fileSystem.copyFileToAttachmentRoot).toHaveBeenCalledWith(
      rootHandle,
      "attachments/prompt-1/attachment-1-guide.pdf",
      expect.any(File)
    );
  });

  it("parses legacy prompt JSON arrays and migrates thumbnailUrl to promptSourceUrl", async () => {
    const legacyJson = JSON.stringify([
      {
        id: "legacy-prompt",
        title: "Legacy",
        content: "Content",
        tags: [],
        enabled: true,
        categoryId: "default",
        thumbnailUrl: "https://example.com/source.png",
      },
    ]);

    const parsed = await parsePromptBackupBlob(new Blob([legacyJson], { type: "application/json" }));

    expect(parsed.sourceFormat).toBe("json");
    expect(parsed.prompts).toEqual([
      expect.objectContaining({
        id: "legacy-prompt",
        promptSourceUrl: "https://example.com/source.png",
      }),
    ]);
    expect(parsed.categories).toEqual([]);
    expect(parsed.attachmentFiles).toEqual([]);
  });

  it("merges backup categories by id and reports added and updated counts", () => {
    const existing = createCategory({ id: "default", name: "Default" });
    const result = mergePromptBackupCategories(
      [existing],
      [
        createCategory({ id: "default", name: "Default updated" }),
        createCategory({ id: "painting", name: "Painting" }),
      ]
    );

    expect(result.addedCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(result.categories).toEqual([
      expect.objectContaining({ id: "default", name: "Default updated" }),
      expect.objectContaining({ id: "painting", name: "Painting" }),
    ]);
  });
});
