import { useState, useEffect, useRef } from "react";
import CategoryForm from "./CategoryForm";
import CategoryList from "./CategoryList";
import Modal from "./Modal";
import ConfirmModal from "./ConfirmModal";
import "../App.css";
import "~/assets/tailwind.css";
import { Category } from "@/utils/types";
import {
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  getPromptCountByCategory,
} from "@/utils/categoryUtils";
import { DEFAULT_CATEGORY_ID } from "@/utils/constants";
import { t } from '../../../utils/i18n';

const CategoryManager = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [filteredCategories, setFilteredCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);
  const [promptCounts, setPromptCounts] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 添加远程导入相关状态
  const [isRemoteImportModalOpen, setIsRemoteImportModalOpen] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [isRemoteImporting, setIsRemoteImporting] = useState(false);

  // Load categories from storage
  useEffect(() => {
    const loadCategories = async () => {
      try {
        setIsLoading(true);
        const storedCategories = await getCategories();
        setCategories(storedCategories);
        console.log(t('categoryPageLoadCategories'), storedCategories.length);

        // 加载每个分类下的提示词数量
        const counts: Record<string, number> = {};
        for (const category of storedCategories) {
          counts[category.id] = await getPromptCountByCategory(category.id);
        }
        setPromptCounts(counts);
      } catch (err) {
        console.error(t('categoryPageLoadError'), err);
        setError(t('loadCategoriesFailed'));
      } finally {
        setIsLoading(false);
      }
    };

    loadCategories();
  }, []);

  // Filter categories based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredCategories(categories);
      return;
    }

    const term = searchTerm.toLowerCase().trim();
    const filtered = categories.filter((category) => {
      const nameMatch = category.name.toLowerCase().includes(term);
      const descriptionMatch = category.description
        ?.toLowerCase()
        .includes(term);
      return nameMatch || descriptionMatch;
    });

    setFilteredCategories(filtered);
  }, [searchTerm, categories]);

  // Add a new category
  const handleAddCategory = async (
    categoryData: Omit<Category, "id" | "createdAt" | "updatedAt">
  ) => {
    try {
      const newCategory = await addCategory(categoryData);
      const updatedCategories = [newCategory, ...categories];
      setCategories(updatedCategories);
      setPromptCounts((prev) => ({ ...prev, [newCategory.id]: 0 }));
      closeModal();
    } catch (err) {
      console.error(t('categoryPageAddError'), err);
      setError(t('addCategoryFailed'));
    }
  };

  // Update an existing category
  const handleUpdateCategory = async (updatedCategory: Category) => {
    try {
      await updateCategory(updatedCategory.id, {
        name: updatedCategory.name,
        description: updatedCategory.description,
        color: updatedCategory.color,
        enabled: updatedCategory.enabled,
      });
      const updatedCategories = categories.map((c) =>
        c.id === updatedCategory.id ? updatedCategory : c
      );
      setCategories(updatedCategories);
      setEditingCategory(null);
      closeModal();
    } catch (err) {
      console.error(t('categoryPageUpdateError'), err);
      setError(t('updateCategoryFailed'));
    }
  };

  // Handle form submission for both add and update operations
  const handleCategorySubmit = async (
    category: Category | Omit<Category, "id" | "createdAt" | "updatedAt">
  ) => {
    if ("id" in category && category?.id) {
      await handleUpdateCategory(category as Category);
    } else {
      await handleAddCategory(category);
    }
  };

  // Delete a category
  const handleDeleteCategory = async (id: string) => {
    if (id === DEFAULT_CATEGORY_ID) {
      setError(t('cannotDeleteDefaultCategory'));
      return;
    }
    setCategoryToDelete(id);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (categoryToDelete) {
      try {
        await deleteCategory(categoryToDelete);
        const newCategories = categories.filter(
          (c) => c.id !== categoryToDelete
        );
        setCategories(newCategories);
        if (editingCategory?.id === categoryToDelete) {
          setEditingCategory(null);
        }
        const newPromptCounts = { ...promptCounts };
        delete newPromptCounts[categoryToDelete];
        setPromptCounts(newPromptCounts);
        setIsConfirmModalOpen(false); // Close modal on success
        setCategoryToDelete(null);
      } catch (err) {
        console.error(t('categoryPageDeleteError'), err);
        setError(t('deleteCategoryFailed'));
        setIsConfirmModalOpen(false); // Close modal on error too
        setCategoryToDelete(null);
      }
    }
  };

  // Start editing a category
  const startEdit = (id: string) => {
    const category = categories.find((c) => c.id === id);
    if (category) {
      setEditingCategory(category);
      setIsModalOpen(true);
    }
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingCategory(null);
    closeModal();
  };

  // Open modal for adding a new category
  const openAddModal = () => {
    setEditingCategory(null);
    setIsModalOpen(true);
  };

  // Close modal
  const closeModal = () => {
    setIsModalOpen(false);
    setError(null); // Clear error when closing modal
  };

  // 切换分类启用状态
  const toggleCategoryEnabled = async (id: string, enabled: boolean) => {
    try {
      await updateCategory(id, { enabled });
      const newCategories = categories.map((c) =>
        c.id === id ? { ...c, enabled } : c
      );
      setCategories(newCategories);
    } catch (err) {
      console.error(t('categoryPageToggleError'), err);
      setError(t('toggleCategoryStatusFailed'));
    }
  };

  // 导出分类
  const exportCategories = () => {
    if (categories.length === 0) {
      alert(t('noCategoriesToExport'));
      return;
    }

    try {
      const dataStr = JSON.stringify(categories, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `categories-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      console.log(t('exportCategoriesSuccess'));
    } catch (err) {
      console.error(t('exportCategoriesError'), err);
      setError(t('exportCategoriesFailed'));
    }
  };

  // 触发文件选择对话框
  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // 导入分类
  const importCategories = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const fileContent = await file.text();
      const importedCategories = JSON.parse(fileContent) as Category[];

      // 验证导入的数据格式
      if (!Array.isArray(importedCategories)) {
        throw new Error(t('invalidCategoryFileFormat'));
      }

      // 验证每个分类的结构
      const validCategories = importedCategories.filter((category) => {
        return (
          typeof category === "object" &&
          typeof category.id === "string" &&
          typeof category.name === "string" &&
          typeof category.enabled === "boolean" &&
          typeof category.createdAt === "string" &&
          typeof category.updatedAt === "string"
        );
      }).map((category) => ({
        ...category,
        // 确保有description和color字段
        description: category.description || "",
        color: category.color || "#6366f1",
      }));

      if (validCategories.length === 0) {
        throw new Error(t('noValidCategoriesInFile'));
      }

      // 确认是否需要合并或覆盖现有分类
      if (categories.length > 0) {
        const shouldImport = window.confirm(
          t('importCategoriesConfirm', [categories.length.toString(), validCategories.length.toString()])
        );

        if (shouldImport) {
          // 创建现有分类的Map，便于查找和更新
          const categoriesMap = new Map(categories.map(c => [c.id, c]));
          let addedCount = 0;
          let updatedCount = 0;

          validCategories.forEach(category => {
            if (categoriesMap.has(category.id)) {
              // 获取现有分类
              const existing = categoriesMap.get(category.id);
              // 待导入分类，合并现有分类属性
              const updatedCategory = { ...existing, ...category };
              // 排除 updatedAt 字段进行比较
              if (existing && JSON.stringify((({ updatedAt, ...rest }) => rest)(existing)) !== JSON.stringify((({ updatedAt, ...rest }) => rest)(updatedCategory))) {
                categoriesMap.set(category.id, {
                  ...updatedCategory,
                  updatedAt: new Date().toISOString(),
                });
                updatedCount++;
              }
            } else {
              // 添加新分类
              categoriesMap.set(category.id, {
                ...category,
                createdAt: category.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
              addedCount++;
            }
          });

          // 如果没有新增也没有更新，显示提示
          if (addedCount === 0 && updatedCount === 0) {
            alert(t('noNewCategoriesFound'));
            return;
          }

          const newCategories = Array.from(categoriesMap.values());
          setCategories(newCategories);

          // 重新加载提示词数量
          const counts: Record<string, number> = {};
          for (const category of newCategories) {
            counts[category.id] = await getPromptCountByCategory(category.id);
          }
          setPromptCounts(counts);

          // 显示成功消息，包含新增和更新的数量
          alert(t('importSuccessful', [(addedCount + updatedCount).toString()]));
        }
        // 如果用户点击取消，不做任何操作
      } else {
        // 没有现有分类，直接保存导入的分类
        setCategories(validCategories);

        // 重新加载提示词数量
        const counts: Record<string, number> = {};
        for (const category of validCategories) {
          counts[category.id] = await getPromptCountByCategory(category.id);
        }
        setPromptCounts(counts);

        alert(t('importSuccessful', [validCategories.length.toString()]));
      }

      // 清除文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      console.error(t('importCategoriesError'), err);
      setError(
        t('importCategoriesFailed', [err instanceof Error ? err.message : t('unknownError')])
      );

      // 清除文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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

  // 从远程URL导入分类
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
      const importedCategories = JSON.parse(fileContent) as Category[];

      // 验证导入的数据格式
      if (!Array.isArray(importedCategories)) {
        throw new Error(t('invalidRemoteCategoryDataFormat'));
      }

      // 验证每个分类的结构
      const validCategories = importedCategories.filter((category) => {
        return (
          typeof category === "object" &&
          typeof category.id === "string" &&
          typeof category.name === "string" &&
          typeof category.enabled === "boolean" &&
          typeof category.createdAt === "string" &&
          typeof category.updatedAt === "string"
        );
      }).map((category) => ({
        ...category,
        // 确保有description和color字段
        description: category.description || "",
        color: category.color || "#6366f1",
      }));

      if (validCategories.length === 0) {
        throw new Error(t('noValidCategoriesInRemoteData'));
      }

      // 确认是否需要导入
      if (categories.length > 0) {
        const shouldImport = window.confirm(
          t('remoteImportCategoriesConfirm', [categories.length.toString(), validCategories.length.toString()])
        );

        if (shouldImport) {
          // 创建现有分类的Map，便于查找和更新
          const categoriesMap = new Map(categories.map(c => [c.id, c]));
          let addedCount = 0;
          let updatedCount = 0;

          validCategories.forEach(category => {
            if (categoriesMap.has(category.id)) {
              // 获取现有分类
              const existing = categoriesMap.get(category.id);
              // 待导入分类，合并现有分类属性
              const updatedCategory = { ...existing, ...category };
              // 排除 updatedAt 字段进行比较
              if (existing && JSON.stringify((({ updatedAt, ...rest }) => rest)(existing)) !== JSON.stringify((({ updatedAt, ...rest }) => rest)(updatedCategory))) {
                categoriesMap.set(category.id, {
                  ...updatedCategory,
                  updatedAt: new Date().toISOString(),
                });
                updatedCount++;
              }
            } else {
              // 添加新分类
              categoriesMap.set(category.id, {
                ...category,
                createdAt: category.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
              addedCount++;
            }
          });

          if (addedCount === 0 && updatedCount === 0) {
            alert(t('noNewCategoriesFound'));
            closeRemoteImportModal();
            return;
          }

          const newCategories = Array.from(categoriesMap.values());
          setCategories(newCategories);

          // 重新加载提示词数量
          const counts: Record<string, number> = {};
          for (const category of newCategories) {
            counts[category.id] = await getPromptCountByCategory(category.id);
          }
          setPromptCounts(counts);

          alert(t('importSuccessful', [(addedCount + updatedCount).toString()]));
          closeRemoteImportModal();
        } else {
          // 用户取消导入
          closeRemoteImportModal();
        }
      } else {
        // 没有现有分类，直接保存导入的分类
        setCategories(validCategories);

        // 重新加载提示词数量
        const counts: Record<string, number> = {};
        for (const category of validCategories) {
          counts[category.id] = await getPromptCountByCategory(category.id);
        }
        setPromptCounts(counts);

        alert(t('importSuccessful', [validCategories.length.toString()]));
        closeRemoteImportModal();
      }
    } catch (err) {
      console.error(t('remoteImportCategoriesError'), err);
      setError(
        t('remoteImportCategoriesFailed', [err instanceof Error ? err.message : t('unknownError')])
      );
    } finally {
      setIsRemoteImporting(false);
    }
  };

  // 主题切换逻辑
  useEffect(() => {
    const updateTheme = (isDark: boolean) => {
      if (isDark) {
        document.documentElement.classList.remove("light");
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
        document.documentElement.classList.add("light");
      }
    };

    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      updateTheme(true);
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      updateTheme(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="flex justify-center items-center min-h-screen">
          <div className="text-center space-y-4">
            <div className="relative">
              <div className="w-16 h-16 mx-auto">
                <div className="absolute inset-0 border-4 border-purple-200 dark:border-purple-800 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-purple-600 dark:border-purple-400 rounded-full border-t-transparent animate-spin"></div>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">{t('loading')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('loadingMessage')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 页面头部 */}
        <div className="mb-10">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-purple-900 to-pink-900 dark:from-gray-100 dark:via-purple-100 dark:to-pink-100 bg-clip-text text-transparent">
                  {t('categoryManagement')}
                </h1>
              </div>
              <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl">
                {t('categoryManagementDescription')}
              </p>
              
              {/* 统计卡片 */}
              <div className="flex flex-wrap gap-4 mt-6">
                <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('totalCategories', [`${categories.length}`])}</span>
                  </div>
                </div>
                <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('enable', [`${categories.filter(c => c.enabled).length}`])} </span>
                  </div>
                </div>
                <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('totalPrompts')}: {Object.values(promptCounts).reduce((a, b) => a + b, 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl p-4 shadow-sm">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-300">{t('operationFailed')}</h3>
                <p className="text-sm text-red-700 dark:text-red-400 mt-1">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="flex-shrink-0 text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-300 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* 操作栏 */}
        <div className="mb-8">
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 rounded-2xl p-4 shadow-xl">
            <div className="flex flex-col xl:flex-row gap-4 xl:gap-6 items-center">
              {/* 搜索区域 */}
              <div className="flex-1 flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
                <div className="flex-1 min-w-0">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={t('searchCategory')}
                      className="block xl:w-62 w-full pl-10 pr-3 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                    />
                  </div>
                </div>
              </div>

              <div className="w-full flex justify-end">
                <div className="flex flex-wrap gap-2 sm:gap-3">
                  {/* 导入导出按钮组 */}
                  <div className="flex gap-2 sm:gap-3">
                    <button
                      onClick={exportCategories}
                      disabled={categories.length === 0}
                      className="inline-flex items-center px-4 py-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-xl transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 disabled:transform-none disabled:shadow-none"
                      title={categories.length === 0 ? t('noCategoriesToExport') : t('exportAllCategories')}
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      {t('exportCategories')}
                    </button>

                    <button
                      onClick={triggerFileInput}
                      className="inline-flex items-center px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-xl transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      {t('localImportCategories')}
                    </button>

                    <button
                      onClick={openRemoteImportModal}
                      className="inline-flex items-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                      title={t('importCategoriesFromUrl')}
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      {t('remoteImportCategories')}
                    </button>
                  </div>

                  <div className="w-px h-8 bg-gray-300 self-center"></div>

                  <button
                    onClick={openAddModal}
                    className="inline-flex items-center px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-sm font-medium rounded-xl transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 shadow-purple-500/25"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    {t('addCategory')}
                  </button>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={importCategories}
                    accept=".json"
                    className="hidden"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 分类列表 */}
        <CategoryList
          categories={filteredCategories}
          onEdit={startEdit}
          onDelete={handleDeleteCategory}
          searchTerm={searchTerm}
          allCategoriesCount={categories.length}
          onToggleEnabled={toggleCategoryEnabled}
          promptCounts={promptCounts}
        />

        {/* 无结果提示 */}
        {filteredCategories.length === 0 && (
          <div className="text-center py-16">
            <div className="max-w-md mx-auto">
              <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center">
                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              
              {searchTerm ? (
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('noMatchingCategories2')}</h3>
                  <p className="text-gray-600 dark:text-gray-300">
                     {t('noMatchingCategories', [`${searchTerm}`])}
                  </p>
                  <div className="flex justify-center">
                    <button
                      onClick={() => setSearchTerm("")}
                      className="inline-flex items-center px-4 py-2 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors font-medium"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      {t('clearSearch')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('noCategories')}</h3>
                  <p className="text-gray-600 dark:text-gray-300">{t('createFirstCategory')}</p>
                  <button
                    onClick={openAddModal}
                    className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 font-medium shadow-purple-500/25"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    {t('createFirstCategory')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 添加/编辑分类模态框 */}
        <Modal
          isOpen={isModalOpen}
          onClose={closeModal}
          title={editingCategory ? t('editCategory') : t('addCategory')} // Title as string
        >
          <CategoryForm
            onSubmit={handleCategorySubmit}
            initialData={editingCategory}
            onCancel={cancelEdit}
            isEditing={!!editingCategory}
          />
        </Modal>

        {/* 远程导入模态框 */}
        <Modal
          isOpen={isRemoteImportModalOpen}
          onClose={closeRemoteImportModal}
          title={t('importCategoriesFromUrl')}
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
                    {t('importCategoriesInstructionsDetail')}
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
                    placeholder="https://example.com/categories.json"
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
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
                className="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-all duration-200"
              >
                {t('cancel')}
              </button>
              <button
                onClick={importFromRemoteUrl}
                disabled={isRemoteImporting || !remoteUrl.trim()}
                className={`px-6 py-2.5 text-sm font-medium text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-all duration-200 ${
                  isRemoteImporting || !remoteUrl.trim()
                    ? "bg-purple-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 hover:shadow-lg hover:-translate-y-0.5"
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
            setCategoryToDelete(null);
          }}
          onConfirm={handleConfirmDelete}
          title={t('confirmDeleteCategory')}
          message={t('confirmDeleteCategoryMessage')} // Message as string
          confirmText={t('delete')}
          cancelText={t('cancel')}
        />
      </div>
    </div>
  );
};

export default CategoryManager;
