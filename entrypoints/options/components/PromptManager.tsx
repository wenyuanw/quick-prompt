import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  Download,
  FileInput,
  FilePenLine,
  FileText,
  FolderOpen,
  Grid2X2,
  HardDrive,
  Library,
  Link2,
  List,
  Loader2,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import PromptForm from "./PromptForm";
import PromptList from "./PromptList";
import Modal from "./Modal";
import ConfirmModal from "./ConfirmModal";
import "../App.css";
import "~/assets/tailwind.css";
import { PromptItem, Category } from "@/utils/types";
import { getCategories, migratePromptsWithCategory, saveCategories } from "@/utils/categoryUtils";
import { getAllPrompts, setAllPrompts } from "@/utils/promptStore";
import {
  type AttachmentStorageRootHandle,
  getAttachmentRootHandle,
  verifyReadWritePermission,
  pickAndStoreAttachmentRoot,
  useInternalAttachmentStorage,
} from "@/utils/attachments/fileSystem";
import {
  deletePromptAttachmentFiles,
  duplicatePromptAttachmentFiles,
} from "@/utils/attachments/promptAttachmentOperations";
import {
  sortPrompts,
  filterPrompts,
  mergePrompts,
  PromptValidationException,
  PROMPT_VALIDATION_ERRORS,
  SortType,
} from "@/utils/promptUtils";
import {
  createPromptBackupZip,
  mergePromptBackupCategories,
  parsePromptBackupBlob,
  restorePromptBackupAttachments,
  type PromptBackupAttachmentFile,
} from "@/utils/promptBackupArchive";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { PageSurface } from "@/components/layout/AppShell";
import { t } from "../../../utils/i18n";

const getAuthorizedAttachmentRoot = async (): Promise<AttachmentStorageRootHandle> => {
  const root = await getAttachmentRootHandle();

  if (!root || !(await verifyReadWritePermission(root))) {
    throw new Error(t('attachmentPermissionLost'));
  }

  return root;
};

const hasPromptAttachments = (prompts: PromptItem[]): boolean => (
  prompts.some((prompt) => Array.isArray(prompt.attachments) && prompt.attachments.length > 0)
);

const padDatePart = (value: number): string => value.toString().padStart(2, "0");

export const formatPromptBackupFileName = (date: Date = new Date()): string => {
  const timestamp = [
    date.getFullYear().toString(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    padDatePart(date.getSeconds()),
  ].join("");

  return `quick-prompt-backup-${timestamp}.zip`;
};

export const deletePromptWithAttachments = async (
  root: AttachmentStorageRootHandle,
  prompts: PromptItem[],
  id: string
): Promise<PromptItem[]> => {
  const prompt = prompts.find((p) => p.id === id);

  if (!prompt) {
    return prompts;
  }

  await deletePromptAttachmentFiles(root, prompt);
  return prompts.filter((p) => p.id !== id);
};

export const buildPromptDuplicate = async (
  root: AttachmentStorageRootHandle,
  prompt: PromptItem,
  copyLabel: string
): Promise<PromptItem> => {
  const newPromptId = crypto.randomUUID();
  const attachments = await duplicatePromptAttachmentFiles(root, prompt, newPromptId);
  const now = new Date().toISOString();

  return {
    ...prompt,
    id: newPromptId,
    title: `${prompt.title} (${copyLabel})`,
    createdAt: now,
    lastModified: now,
    pinned: false, // 副本默认不置顶
    attachments,
  };
};

const PromptManager = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFromUrl = searchParams.get("category");
  const tagFromUrl = searchParams.get("tag");
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingPrompt, setEditingPrompt] = useState<PromptItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialContent, setInitialContent] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 添加远程导入相关状态
  const [isRemoteImportModalOpen, setIsRemoteImportModalOpen] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [isRemoteImporting, setIsRemoteImporting] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [promptToDelete, setPromptToDelete] = useState<string | null>(null);
  const [isReauthorizing, setIsReauthorizing] = useState(false);

  // 布局模式
  const [compactLayout, setCompactLayout] = useState<boolean>(() => {
    try {
      return localStorage.getItem('promptLayoutCompact') === 'true'
    } catch {
      return false
    }
  });

  // 添加分类相关状态
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(() => categoryFromUrl || null);
  const [selectedTag, setSelectedTag] = useState<string | null>(() => tagFromUrl || null);

  const availableTags = useMemo(() => {
    const tagsByKey = new Map<string, string>();

    prompts.forEach((prompt) => {
      (prompt.tags || []).forEach((rawTag) => {
        const tag = rawTag.trim();
        const key = tag.toLocaleLowerCase();

        if (tag && !tagsByKey.has(key)) {
          tagsByKey.set(key, tag);
        }
      });
    });

    return Array.from(tagsByKey.values()).sort((left, right) => left.localeCompare(right));
  }, [prompts]);

  // 排序方式
  const [sortType, setSortType] = useState<SortType>(() => {
    try {
      return (localStorage.getItem('promptSortType') as SortType) || 'custom'
    } catch {
      return 'custom'
    }
  });

  // 从URL获取查询参数
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const action = queryParams.get("action");
    const content = queryParams.get("content");

    // 如果是从右键菜单打开并带有文本内容
    if (action === "new" && content) {
      setInitialContent(content);
      // 稍微延迟打开模态框，确保组件已完全加载
      setTimeout(() => {
        setIsModalOpen(true);
      }, 100);
    }
  }, []);

  useEffect(() => {
    setSelectedCategoryId(categoryFromUrl || null);
  }, [categoryFromUrl]);

  useEffect(() => {
    setSelectedTag(tagFromUrl || null);
  }, [tagFromUrl]);

  const updateFilters = (nextFilters: { categoryId?: string | null; tag?: string | null }) => {
    const nextCategoryId = nextFilters.categoryId !== undefined ? nextFilters.categoryId : selectedCategoryId;
    const nextTag = nextFilters.tag !== undefined ? nextFilters.tag : selectedTag;

    setSelectedCategoryId(nextCategoryId);
    setSelectedTag(nextTag);

    const nextSearchParams = new URLSearchParams(searchParams);
    if (nextCategoryId) {
      nextSearchParams.set("category", nextCategoryId);
    } else {
      nextSearchParams.delete("category");
    }

    if (nextTag) {
      nextSearchParams.set("tag", nextTag);
    } else {
      nextSearchParams.delete("tag");
    }

    setSearchParams(nextSearchParams, { replace: true });
  };

  const updateSelectedCategory = (categoryId: string | null) => {
    updateFilters({ categoryId });
  };

  const updateSelectedTag = (tag: string | null) => {
    updateFilters({ tag });
  };

  // Load prompts and categories from storage
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);

        // 先迁移旧数据
        await migratePromptsWithCategory();

        // 加载提示词
        const storedPrompts = await getAllPrompts();

        setPrompts(storedPrompts);

        // 加载分类
        const storedCategories = await getCategories();
        setCategories(storedCategories);

        console.log(t('optionsPageLoadPrompts'), storedPrompts.length);
        console.log(t('optionsPageLoadCategories'), storedCategories.length);
      } catch (err) {
        console.error(t('optionsPageLoadDataError'), err);
        setError(t('loadDataFailed'));
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // 使用 useMemo 计算筛选和排序后的提示词
  const filteredPrompts = useMemo(() => {
    const filtered = filterPrompts(prompts, { searchTerm, categoryId: selectedCategoryId, tag: selectedTag });
    return sortPrompts(filtered, sortType);
  }, [prompts, searchTerm, selectedCategoryId, selectedTag, sortType]);

  // Save prompts to storage
  const savePrompts = async (newPrompts: PromptItem[]) => {
    try {
      await setAllPrompts(newPrompts);
      console.log(t('optionsPagePromptsSaved'));
      setPrompts(newPrompts);
    } catch (err) {
      console.error(t('optionsPageSavePromptsError'), err);
      setError(t('savePromptsFailed'));
    }
  };

  const savePromptCategories = async (newCategories: Category[]) => {
    await saveCategories(newCategories);
    setCategories(newCategories);
  };

  // 处理导入结果
  const handleImportResult = async (
    validPrompts: PromptItem[],
    confirmMessageKey: string,
    onSuccess?: () => void,
    importedCategories: Category[] = [],
    attachmentFiles: PromptBackupAttachmentFile[] = []
  ): Promise<boolean> => {
    const shouldConfirmImport = prompts.length > 0 || (categories.length > 0 && importedCategories.length > 0);

    if (shouldConfirmImport) {
      const shouldImport = window.confirm(
        t(confirmMessageKey, [prompts.length.toString(), validPrompts.length.toString()])
      );

      if (!shouldImport) {
        onSuccess?.();
        return false;
      }

      const { merged, addedCount, updatedCount } = mergePrompts(prompts, validPrompts);
      const categoryMerge = mergePromptBackupCategories(categories, importedCategories);
      const categoryChangeCount = categoryMerge.addedCount + categoryMerge.updatedCount;
      const changedCount = addedCount + updatedCount + categoryChangeCount;

      if (changedCount === 0) {
        alert(t('noNewPromptsFound'));
        onSuccess?.();
        return false;
      }

      if (attachmentFiles.length > 0) {
        const root = await getAuthorizedAttachmentRoot();
        await restorePromptBackupAttachments(root, attachmentFiles);
      }

      await savePrompts(merged);
      if (categoryChangeCount > 0) {
        await savePromptCategories(categoryMerge.categories);
      }
      alert(t('importSuccessful', [changedCount.toString()]));
    } else {
      if (attachmentFiles.length > 0) {
        const root = await getAuthorizedAttachmentRoot();
        await restorePromptBackupAttachments(root, attachmentFiles);
      }

      await savePrompts(validPrompts);
      if (importedCategories.length > 0) {
        await savePromptCategories(importedCategories);
      }
      alert(t('importSuccessful', [(validPrompts.length + importedCategories.length).toString()]));
    }

    onSuccess?.();
    return true;
  };

  // Add a new prompt
  const addPrompt = async (prompt: Omit<PromptItem, "id"> | PromptItem) => {
    const submittedId = "id" in prompt ? prompt.id : undefined;
    const now = new Date().toISOString();
    const newPrompt: PromptItem = {
      ...prompt,
      id: submittedId || crypto.randomUUID(),
      enabled: prompt.enabled !== undefined ? prompt.enabled : true, // 确保新建的提示词默认启用
      createdAt: prompt.createdAt || now,
      lastModified: prompt.lastModified || now, // 确保有lastModified字段
    };

    const newPrompts = [newPrompt, ...prompts];
    await savePrompts(newPrompts);
  };

  // Update an existing prompt
  const updatePrompt = async (updatedPrompt: PromptItem) => {
    const newPrompts = prompts.map((p) =>
      p.id === updatedPrompt.id ? updatedPrompt : p
    );

    await savePrompts(newPrompts);
    setEditingPrompt(null);
  };

  // Handle form submission for both add and update operations
  const handlePromptSubmit = async (
    prompt: PromptItem | Omit<PromptItem, "id">
  ) => {
    if ("id" in prompt && prompt?.id && prompts.some((item) => item.id === prompt.id)) {
      // It's an update operation
      await updatePrompt(prompt as PromptItem);
    } else {
      // It's an add operation
      await addPrompt(prompt);
    }

    // 清除 URL 中的查询参数
    if (window.location.search) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    closeModal();
  };

  // Re-authorize attachment directory
  const handleReauthorizeExternal = async () => {
    if (isReauthorizing) return;
    setIsReauthorizing(true);
    try {
      await pickAndStoreAttachmentRoot();
      setError(null);
    } catch (err) {
      console.error("Error reauthorizing attachment directory:", err);
    } finally {
      setIsReauthorizing(false);
    }
  };

  const handleSwitchToInternal = async () => {
    if (isReauthorizing) return;

    if (hasPromptAttachments(prompts)) {
      alert(t('switchToInternalStorageBlockedByAttachments'));
      return;
    }

    setIsReauthorizing(true);
    try {
      await useInternalAttachmentStorage();
      setError(null);
    } catch (err) {
      console.error("Error switching to internal storage:", err);
    } finally {
      setIsReauthorizing(false);
    }
  };

  // Delete a prompt
  const deletePrompt = async (id: string) => {
    setPromptToDelete(id);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (promptToDelete) {
      try {
        const prompt = prompts.find((p) => p.id === promptToDelete);
        if (!prompt) return;

        const hasAttachments = Array.isArray(prompt.attachments) && prompt.attachments.length > 0;
        const newPrompts = hasAttachments
          ? await deletePromptWithAttachments(await getAuthorizedAttachmentRoot(), prompts, promptToDelete)
          : prompts.filter((p) => p.id !== promptToDelete);

        await savePrompts(newPrompts);

        if (editingPrompt?.id === promptToDelete) {
          setEditingPrompt(null);
        }
      } catch (err) {
        console.error(t('attachmentRemoveFailed'), err);
        setError(err instanceof Error ? err.message : t('attachmentRemoveFailed'));
      }
    }
  };

  // Start editing a prompt
  const startEdit = (id: string) => {
    const prompt = prompts.find((p) => p.id === id);
    if (prompt) {
      setEditingPrompt(prompt);
      setIsModalOpen(true);
    }
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingPrompt(null);
    setInitialContent(null);

    // 清除 URL 中的查询参数
    if (window.location.search) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    closeModal();
  };

  // Open modal for adding a new prompt
  const openAddModal = () => {
    setEditingPrompt(null);
    setIsModalOpen(true);
  };

  // Close modal
  const closeModal = () => {
    setIsModalOpen(false);
    setInitialContent(null);
  };

  const toggleCompactLayout = () => {
    setCompactLayout(prev => {
      const next = !prev
      try { localStorage.setItem('promptLayoutCompact', String(next)) } catch {}
      return next
    })
  };

  // 切换排序方式
  const handleSortChange = (newSortType: SortType) => {
    setSortType(newSortType)
    try { localStorage.setItem('promptSortType', newSortType) } catch {}
  };

  // 添加切换启用状态的函数
  const togglePromptEnabled = async (id: string, enabled: boolean) => {
    const newPrompts = prompts.map((p) =>
      p.id === id ? { ...p, enabled } : p
    );
    await savePrompts(newPrompts);
  };

  // 添加切换置顶状态的函数
  const togglePromptPinned = async (id: string, pinned: boolean) => {
    const newPrompts = prompts.map((p) =>
      p.id === id ? { ...p, pinned } : p
    );
    await savePrompts(newPrompts);
  };

  // 复制提示词
  const duplicatePrompt = async (id: string) => {
    const prompt = prompts.find((p) => p.id === id);
    if (!prompt) return;

    try {
      const root = await getAuthorizedAttachmentRoot();
      const newPrompt = await buildPromptDuplicate(root, prompt, t('copyLabel'));
      const newPrompts = [newPrompt, ...prompts];
      await savePrompts(newPrompts);
    } catch (err) {
      console.error(t('attachmentAddFailed'), err);
      setError(err instanceof Error ? err.message : t('attachmentAddFailed'));
    }
  };

  // 添加拖拽排序处理函数
  const handleReorder = async (activeId: string, overId: string) => {
    const oldIndex = prompts.findIndex(p => p.id === activeId);
    const newIndex = prompts.findIndex(p => p.id === overId);
    
    if (oldIndex === -1 || newIndex === -1) return;
    
    // 重新排列数组
    const newPrompts = [...prompts];
    const [removed] = newPrompts.splice(oldIndex, 1);
    newPrompts.splice(newIndex, 0, removed);
    
    // 更新 sortOrder 字段
    const updatedPrompts = newPrompts.map((prompt, index) => ({
      ...prompt,
      sortOrder: index,
      lastModified: new Date().toISOString()
    }));
    
    await savePrompts(updatedPrompts);
  };

  // 导出提示词
  const exportPrompts = async () => {
    if (prompts.length === 0) {
      alert(t('noPromptsToExport'));
      return;
    }

    try {
      const root = hasPromptAttachments(prompts) ? await getAuthorizedAttachmentRoot() : undefined;
      const dataBlob = await createPromptBackupZip(root, prompts, categories);
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = formatPromptBackupFileName();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      console.log(t('exportPromptsSuccess'));
    } catch (err) {
      console.error(t('exportPromptsError'), err);
      setError(t('exportPromptsFailed'));
    }
  };

  // 触发文件选择对话框
  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // 获取验证错误的国际化消息
  const getValidationErrorMessage = (err: unknown): string => {
    if (err instanceof PromptValidationException) {
      switch (err.code) {
        case PROMPT_VALIDATION_ERRORS.INVALID_FORMAT:
          return t('invalidFileFormat');
        case PROMPT_VALIDATION_ERRORS.NO_VALID_PROMPTS:
          return t('noValidPromptsInFile');
        default:
          return t('unknownError');
      }
    }
    return err instanceof Error ? err.message : t('unknownError');
  };

  // 导入提示词
  const importPrompts = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const clearFileInput = () => {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };

    try {
      const importedData = await parsePromptBackupBlob(file);

      await handleImportResult(
        importedData.prompts,
        'importPromptsConfirm',
        undefined,
        importedData.categories,
        importedData.attachmentFiles
      );
      clearFileInput();
    } catch (err) {
      console.error(t('importPromptsError'), err);
      setError(t('importPromptsFailed', [getValidationErrorMessage(err)]));
      clearFileInput();
    }
  };

  // 处理远程URL输入变化
  const handleRemoteUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRemoteUrl(e.target.value);
  };

  // 打开远程导入模态框
  const openRemoteImportModal = () => {
    setIsRemoteImportModalOpen(true);
    setRemoteUrl("");
    setError(null);
  };

  // 关闭远程导入模态框
  const closeRemoteImportModal = () => {
    setIsRemoteImportModalOpen(false);
    setRemoteUrl("");
    setError(null);
  };

  // 从远程URL导入提示词
  const importFromRemoteUrl = async () => {
    if (!remoteUrl.trim()) {
      setError(t('enterValidUrl'));
      return;
    }

    try {
      setIsRemoteImporting(true);
      setError(null);

      const url = remoteUrl.trim();

      // 获取远程数据
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `远程请求失败: ${response.status} ${response.statusText}`
        );
      }

      const importedData = await parsePromptBackupBlob(await response.blob());

      await handleImportResult(
        importedData.prompts,
        'remoteImportPromptsConfirm',
        closeRemoteImportModal,
        importedData.categories,
        importedData.attachmentFiles
      );
    } catch (err) {
      console.error(t('remoteImportPromptsError'), err);
      setError(t('remoteImportFailed', [getValidationErrorMessage(err)]));
    } finally {
      setIsRemoteImporting(false);
    }
  };

  if (isLoading) {
    return (
      <PageSurface>
        <LoadingState title={t('loadingData')} description={t('loadingDataMessage')} />
      </PageSurface>
    );
  }

  return (
    <PageSurface className="flex min-h-full flex-col">
      <div className="flex-shrink-0 space-y-4 px-4 pt-4 sm:px-6 lg:px-8">
        {error && (
          error === t('attachmentPermissionLost') ? (
            <Alert variant="warning">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <AlertDescription>{error}</AlertDescription>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleReauthorizeExternal}
                    disabled={isReauthorizing}
                  >
                    {isReauthorizing ? <Loader2 className="size-3.5 animate-spin" /> : <FolderOpen className="size-3.5" />}
                    {t("reauthorizeAttachmentDirectory")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSwitchToInternal}
                    disabled={isReauthorizing}
                  >
                    {isReauthorizing ? <Loader2 className="size-3.5 animate-spin" /> : <HardDrive className="size-3.5" />}
                    {t("switchToInternalStorage")}
                  </Button>
                </div>
              </div>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>{error}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setError(null)}
                  aria-label={t("close")}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <X className="size-4" />
                </Button>
              </AlertDescription>
            </Alert>
          )
        )}

        <PageHeader
          icon={Library}
          title={t('promptLibrary')}
          meta={
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{t('totalCount', [prompts.length.toString()])}</Badge>
              <Badge variant="success">{t('enabledCount', [prompts.filter(p => p.enabled).length.toString()])}</Badge>
              {(selectedCategoryId || selectedTag || searchTerm) && (
                <Badge variant="outline">{t('currentCategoryCount', [filteredPrompts.length.toString()])}</Badge>
              )}
            </div>
          }
          actions={
            <>
              <Button
                onClick={exportPrompts}
                disabled={prompts.length === 0}
                variant="outline"
                size="sm"
                title={prompts.length === 0 ? t('noPromptsToExport') : t('exportAllPrompts')}
              >
                <Download className="size-4" />
                {t('export')}
              </Button>
              <Button onClick={triggerFileInput} variant="outline" size="sm" title={t('localImport')}>
                <FileInput className="size-4" />
                {t('localImport')}
              </Button>
              <Button onClick={openRemoteImportModal} variant="outline" size="sm" title={t('importFromUrl')}>
                <Link2 className="size-4" />
                {t('remoteImport')}
              </Button>
              <Button onClick={openAddModal} size="sm">
                <Plus className="size-4" />
                {t('addNewPrompt')}
              </Button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={importPrompts}
                accept=".json,.zip"
                className="hidden"
              />
            </>
          }
        />

        <SectionCard contentClassName="pt-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_minmax(150px,180px)_minmax(140px,160px)] xl:grid-cols-[minmax(260px,1fr)_minmax(150px,180px)_minmax(140px,160px)_minmax(180px,210px)_minmax(170px,auto)]">
            <div className="relative min-w-0 sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('searchPrompts')}
                className="pl-9"
              />
            </div>

            <div className="min-w-0">
              <Select
                value={selectedCategoryId || "__all__"}
                onValueChange={(value) => updateSelectedCategory(value === "__all__" ? null : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('allCategories')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('allCategories')}</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0">
              <Select
                value={selectedTag || "__all__"}
                onValueChange={(value) => updateSelectedTag(value === "__all__" ? null : value)}
              >
                <SelectTrigger title={t('filterByTag')}>
                  <SelectValue placeholder={t('allTags')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('allTags')}</SelectItem>
                  {availableTags.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0">
              <Select value={sortType} onValueChange={(value) => handleSortChange(value as SortType)}>
                <SelectTrigger title={t('sortBy')}>
                  <SelectValue placeholder={t('sortBy')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">{t('sortByCustom')}</SelectItem>
                  <SelectItem value="title-asc">{t('sortByTitleAsc')}</SelectItem>
                  <SelectItem value="title-desc">{t('sortByTitleDesc')}</SelectItem>
                  <SelectItem value="modified-newest">{t('sortByNewest')}</SelectItem>
                  <SelectItem value="modified-oldest">{t('sortByOldest')}</SelectItem>
                  <SelectItem value="enabled-first">{t('sortByEnabledFirst')}</SelectItem>
                  <SelectItem value="disabled-first">{t('sortByDisabledFirst')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Tabs
              value={compactLayout ? "compact" : "card"}
              onValueChange={(value) => {
                if ((value === "compact") !== compactLayout) toggleCompactLayout();
              }}
              className="min-w-0"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="card" title={t('normalLayout')}>
                  <Grid2X2 className="size-4" />
                  <span className="hidden xl:inline">{t('cardLayout')}</span>
                </TabsTrigger>
                <TabsTrigger value="compact" title={t('compactLayout')}>
                  <List className="size-4" />
                  <span className="hidden xl:inline">{t('compactLayout')}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </SectionCard>
      </div>

      <div className="thin-scrollbar flex-1 overflow-y-auto px-4 pb-4 pt-4 sm:px-6 lg:px-8">

        <PromptList
          prompts={filteredPrompts}
          categories={categories}
          onEdit={startEdit}
          onDelete={deletePrompt}
          onDuplicate={duplicatePrompt}
          onReorder={handleReorder}
          searchTerm={searchTerm}
          allPromptsCount={prompts.length}
          onToggleEnabled={togglePromptEnabled}
          onTogglePinned={togglePromptPinned}
          selectedCategoryId={selectedCategoryId}
          compact={compactLayout}
          sortType={sortType}
          selectedTag={selectedTag}
          onTagSelect={updateSelectedTag}
        />

        {filteredPrompts.length === 0 && (
          <EmptyState
            icon={FileText}
            title={searchTerm || selectedCategoryId || selectedTag ? t('noMatchingPrompts') : t('noPromptsAdded')}
            description={searchTerm || selectedCategoryId || selectedTag ? undefined : t('createFirstPrompt')}
            actionLabel={searchTerm || selectedCategoryId || selectedTag ? undefined : t('createFirstPrompt')}
            onAction={searchTerm || selectedCategoryId || selectedTag ? undefined : openAddModal}
          />
        )}

        {/* 添加/编辑 Prompt 模态框 */}
        <Modal
          isOpen={isModalOpen}
          onClose={closeModal}
          title={editingPrompt ? t('editPrompt') : t('newPrompt')}
          icon={editingPrompt ? FilePenLine : Plus}
        >
          <PromptForm
            onSubmit={handlePromptSubmit}
            initialData={editingPrompt ? { ...editingPrompt } : null}
            initialContent={initialContent}
            onCancel={cancelEdit}
            isEditing={!!editingPrompt}
            availableTags={availableTags}
          />
        </Modal>

        {/* 远程导入模态框 */}
        <Modal
          isOpen={isRemoteImportModalOpen}
          onClose={closeRemoteImportModal}
          title={t('importFromUrl')}
          icon={Link2}
        >
          <div className="space-y-6 pt-2">
            <Alert variant="info">
              <AlertCircle className="size-4" />
              <AlertTitle>{t('importInstructions')}</AlertTitle>
              <AlertDescription>{t('importInstructionsDetail')}</AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div>
                <label htmlFor="remote-url" className="mb-2 block text-sm font-semibold text-foreground">
                  {t('remoteUrl')}
                </label>
                <div className="relative">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    id="remote-url"
                    value={remoteUrl}
                    onChange={handleRemoteUrlChange}
                    placeholder="https://example.com/quick-prompt-backup.zip"
                    className="pl-9"
                  />
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertTitle>{t('importFailed')}</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <Button
                onClick={closeRemoteImportModal}
                variant="outline"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={importFromRemoteUrl}
                disabled={isRemoteImporting || !remoteUrl.trim()}
              >
                {isRemoteImporting ? (
                  <div className="flex items-center gap-2">
                    <Upload className="size-4 animate-pulse" />
                    {t('importing')}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Upload className="size-4" />
                    {t('startImport')}
                  </div>
                )}
              </Button>
            </div>
          </div>
        </Modal>

        {/* 确认删除对话框 */}
        <ConfirmModal
          isOpen={isConfirmModalOpen}
          onClose={() => {
            setIsConfirmModalOpen(false);
            setPromptToDelete(null);
          }}
          onConfirm={handleConfirmDelete}
          title={t('confirmDelete')}
          message=""
          confirmText={t('delete')}
          cancelText={t('cancel')}
        >
        </ConfirmModal>
      </div>
    </PageSurface>
  );
};

export default PromptManager;
