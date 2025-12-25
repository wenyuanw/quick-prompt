import { useState, useEffect, useRef, useMemo } from "react";
import { storage } from "#imports";
import PromptForm from "./PromptForm";
import PromptList from "./PromptList";
import Modal from "./Modal";
import ConfirmModal from "./ConfirmModal";
import "../App.css";
import "~/assets/tailwind.css";
import { PromptItem, Category } from "@/utils/types";
import { BROWSER_STORAGE_KEY, DEFAULT_CATEGORY_ID } from "@/utils/constants";
import { getCategories, migratePromptsWithCategory } from "@/utils/categoryUtils";
import {
  sortPrompts,
  filterPrompts,
  validateAndNormalizePrompts,
  mergePrompts,
  PromptValidationException,
  PROMPT_VALIDATION_ERRORS,
} from "@/utils/promptUtils";
import { t } from "../../../utils/i18n";

const PromptManager = () => {
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

  // 添加分类相关状态
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

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

  // Load prompts and categories from storage
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);

        // 先迁移旧数据
        await migratePromptsWithCategory();

        // 加载提示词
        const storedPrompts = await storage.getItem<PromptItem[]>(
          `local:${BROWSER_STORAGE_KEY}`
        );

        setPrompts(storedPrompts || []);

        // 加载分类
        const storedCategories = await getCategories();
        setCategories(storedCategories);

        console.log(t('optionsPageLoadPrompts'), storedPrompts?.length || 0);
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
    const filtered = filterPrompts(prompts, { searchTerm, categoryId: selectedCategoryId });
    return sortPrompts(filtered);
  }, [prompts, searchTerm, selectedCategoryId]);

  // Save prompts to storage
  const savePrompts = async (newPrompts: PromptItem[]) => {
    try {
      await storage.setItem<PromptItem[]>(`local:${BROWSER_STORAGE_KEY}`, newPrompts);
      console.log(t('optionsPagePromptsSaved'));
      setPrompts(newPrompts);
    } catch (err) {
      console.error(t('optionsPageSavePromptsError'), err);
      setError(t('savePromptsFailed'));
    }
  };

  // 处理导入结果
  const handleImportResult = async (
    validPrompts: PromptItem[],
    confirmMessageKey: string,
    onSuccess?: () => void
  ): Promise<boolean> => {
    if (prompts.length > 0) {
      const shouldImport = window.confirm(
        t(confirmMessageKey, [prompts.length.toString(), validPrompts.length.toString()])
      );

      if (!shouldImport) {
        onSuccess?.();
        return false;
      }

      const { merged, addedCount, updatedCount } = mergePrompts(prompts, validPrompts);

      if (addedCount === 0 && updatedCount === 0) {
        alert(t('noNewPromptsFound'));
        onSuccess?.();
        return false;
      }

      await savePrompts(merged);
      alert(t('importSuccessful', [(addedCount + updatedCount).toString()]));
    } else {
      await savePrompts(validPrompts);
      alert(t('importSuccessful', [validPrompts.length.toString()]));
    }

    onSuccess?.();
    return true;
  };

  // Add a new prompt
  const addPrompt = async (prompt: Omit<PromptItem, "id">) => {
    const newPrompt: PromptItem = {
      ...prompt,
      id: crypto.randomUUID(),
      enabled: prompt.enabled !== undefined ? prompt.enabled : true, // 确保新建的提示词默认启用
      lastModified: prompt.lastModified || new Date().toISOString(), // 确保有lastModified字段
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
    if ("id" in prompt && prompt?.id) {
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

  // Delete a prompt
  const deletePrompt = async (id: string) => {
    setPromptToDelete(id);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (promptToDelete) {
      const newPrompts = prompts.filter((p) => p.id !== promptToDelete);
      await savePrompts(newPrompts);

      if (editingPrompt?.id === promptToDelete) {
        setEditingPrompt(null);
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
  const exportPrompts = () => {
    if (prompts.length === 0) {
      alert(t('noPromptsToExport'));
      return;
    }

    try {
      const dataStr = JSON.stringify(prompts, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `prompts-export-${new Date().toISOString().slice(0, 10)}.json`;
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
      const fileContent = await file.text();
      const importedData = JSON.parse(fileContent);
      const validPrompts = validateAndNormalizePrompts(importedData);

      await handleImportResult(validPrompts, 'importPromptsConfirm');
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

      const fileContent = await response.text();
      const importedData = JSON.parse(fileContent);
      const validPrompts = validateAndNormalizePrompts(importedData);

      await handleImportResult(validPrompts, 'remoteImportPromptsConfirm', closeRemoteImportModal);
    } catch (err) {
      console.error(t('remoteImportPromptsError'), err);
      setError(t('remoteImportFailed', [getValidationErrorMessage(err)]));
    } finally {
      setIsRemoteImporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="flex justify-center items-center min-h-screen">
          <div className="text-center space-y-4">
            <div className="relative">
              <div className="w-16 h-16 mx-auto">
                <div className="absolute inset-0 border-4 border-blue-200 dark:border-blue-800 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-blue-600 dark:border-blue-400 rounded-full border-t-transparent animate-spin"></div>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">{t('loadingData')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('loadingDataMessage')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* 固定顶部区域 */}
      <div className="flex-shrink-0 px-4 sm:px-6 lg:px-8 pt-4">
        {/* 错误提示 */}
        {error && (
          <div className="mb-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl p-3 shadow-sm">
            <div className="flex items-center space-x-3">
              <svg className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm text-red-700 dark:text-red-400 flex-1">{error}</p>
              <button
                onClick={() => setError(null)}
                className="flex-shrink-0 text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* 顶部工具栏 */}
        <div className="mb-4">
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 rounded-xl p-3 shadow-lg">
            <div className="flex flex-wrap items-center gap-3">
              {/* 标题和统计 */}
              <div className="flex items-center gap-3 mr-auto">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3" />
                  </svg>
                </div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {t('promptLibrary')}
                </h1>
                <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1" title={t('totalCount', [prompts.length.toString()])}>
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                    {prompts.length}
                  </span>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  <span className="flex items-center gap-1" title={t('enabledCount', [prompts.filter(p => p.enabled).length.toString()])}>
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                    {prompts.filter(p => p.enabled).length}
                  </span>
                  {selectedCategoryId && (
                    <>
                      <span className="text-gray-300 dark:text-gray-600">|</span>
                      <span className="flex items-center gap-1" title={t('currentCategoryCount', [filteredPrompts.length.toString()])}>
                        <span className="w-1.5 h-1.5 bg-purple-500 rounded-full"></span>
                        {filteredPrompts.length}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* 搜索框 */}
              <div className="relative order-last w-full sm:order-none sm:w-auto">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t('searchPrompts')}
                  className="block w-full sm:w-44 pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white/50 dark:bg-gray-800/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              {/* 分类筛选 */}
              <div className="relative">
                <select
                  value={selectedCategoryId || ""}
                  onChange={(e) => setSelectedCategoryId(e.target.value || null)}
                  className="block w-full pl-3 pr-7 py-1.5 text-sm bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all appearance-none cursor-pointer"
                >
                  <option value="">{t('allCategories')}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                  <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 hidden sm:block"></div>

              {/* 操作按钮组 */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={exportPrompts}
                  disabled={prompts.length === 0}
                  className="inline-flex items-center px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  title={prompts.length === 0 ? t('noPromptsToExport') : t('exportAllPrompts')}
                >
                  <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {t('export')}
                </button>

                <button
                  onClick={triggerFileInput}
                  className="inline-flex items-center px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  title={t('localImport')}
                >
                  <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {t('localImport')}
                </button>

                <button
                  onClick={openRemoteImportModal}
                  className="inline-flex items-center px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  title={t('importFromUrl')}
                >
                  <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  {t('remoteImport')}
                </button>

                <div className="w-px h-6 bg-gray-200 dark:bg-gray-700"></div>

                <button
                  onClick={openAddModal}
                  className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-medium rounded-lg transition-all shadow-sm hover:shadow cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  {t('addNewPrompt')}
                </button>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={importPrompts}
                  accept=".json"
                  className="hidden"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 可滚动内容区域 */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-4">

        {/* Prompts列表 */}
        <PromptList
          prompts={filteredPrompts}
          categories={categories}
          onEdit={startEdit}
          onDelete={deletePrompt}
          onReorder={handleReorder}
          searchTerm={searchTerm}
          allPromptsCount={prompts.length}
          onToggleEnabled={togglePromptEnabled}
          onTogglePinned={togglePromptPinned}
          selectedCategoryId={selectedCategoryId}
        />

        {/* 无结果提示 */}
        {filteredPrompts.length === 0 && (
          <div className="text-center py-10">
            <div className="max-w-sm mx-auto">
              <div className="w-14 h-14 mx-auto mb-4 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-full flex items-center justify-center">
                <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>

              {searchTerm || selectedCategoryId ? (
                <div className="space-y-3">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('noMatchingPrompts')}</h3>
                  <div className="flex flex-wrap justify-center gap-2">
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm("")}
                        className="cursor-pointer inline-flex items-center px-3 py-1.5 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors font-medium"
                      >
                        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        {t('clearSearch')}
                      </button>
                    )}
                    {selectedCategoryId && (
                      <button
                        onClick={() => setSelectedCategoryId(null)}
                        className="cursor-pointer inline-flex items-center px-3 py-1.5 text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors font-medium"
                      >
                        {t('viewAllCategories')}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('noPromptsAdded')}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('createFirstPrompt')}</p>
                  <button
                    onClick={openAddModal}
                    className="inline-flex items-center px-4 py-2 text-sm bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all font-medium"
                  >
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    {t('createFirstPrompt')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 添加/编辑 Prompt 模态框 */}
        <Modal
          isOpen={isModalOpen}
          onClose={closeModal}
          title={editingPrompt ? t('editPrompt') : t('newPrompt')}
        >
          <PromptForm
            onSubmit={handlePromptSubmit}
            initialData={
              editingPrompt
                ? {
                    ...editingPrompt,
                  }
                : initialContent
                ? {
                    id: "",
                    title: "",
                    content: initialContent,
                    tags: [],
                    enabled: true, // 默认启用
                    categoryId: DEFAULT_CATEGORY_ID, // 添加默认分类ID
                  }
                : null
            }
            onCancel={cancelEdit}
            isEditing={!!editingPrompt}
          />
        </Modal>

        {/* 远程导入模态框 */}
        <Modal
          isOpen={isRemoteImportModalOpen}
          onClose={closeRemoteImportModal}
          title={t('importFromUrl')}
        >
          <div className="space-y-6 pt-2">
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/50 rounded-xl p-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-blue-900 dark:text-blue-300">{t('importInstructions')}</h4>
                  <p className="text-sm text-blue-800 dark:text-blue-400 mt-1">
                    {t('importInstructionsDetail')}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="remote-url" className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {t('remoteUrl')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    id="remote-url"
                    value={remoteUrl}
                    onChange={handleRemoteUrlChange}
                    placeholder="https://example.com/prompts.json"
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800/50 rounded-xl p-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-red-900 dark:text-red-300">{t('importFailed')}</h4>
                      <p className="text-sm text-red-800 dark:text-red-400 mt-1">{error}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={closeRemoteImportModal}
                className="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
              >
                {t('cancel')}
              </button>
              <button
                onClick={importFromRemoteUrl}
                disabled={isRemoteImporting || !remoteUrl.trim()}
                className={`px-6 py-2.5 text-sm font-medium text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 ${
                  isRemoteImporting || !remoteUrl.trim()
                    ? "bg-blue-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg hover:-translate-y-0.5"
                }`}
              >
                {isRemoteImporting ? (
                  <div className="flex items-center">
                    <div className="w-4 h-4 mr-2">
                      <div className="border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    {t('importing')}
                  </div>
                ) : (
                  <div className="flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {t('startImport')}
                  </div>
                )}
              </button>
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
    </div>
  );
};

export default PromptManager;