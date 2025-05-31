import { useState, useEffect, useRef } from "react";
import { storage } from "#imports";
import PromptForm from "./PromptForm";
import PromptList from "./PromptList";
import SearchBar from "./SearchBar";
import Modal from "./Modal";
import ConfirmModal from "./ConfirmModal";
import "../App.css";
import "~/assets/tailwind.css";
import { PromptItem, Category } from "@/utils/types";
import { BROWSER_STORAGE_KEY, DEFAULT_CATEGORY_ID } from "@/utils/constants";
import { getCategories, migratePromptsWithCategory } from "@/utils/categoryUtils";

const PromptManager = () => {
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [filteredPrompts, setFilteredPrompts] = useState<PromptItem[]>([]);
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
        
        console.log("选项页：加载 Prompts:", storedPrompts?.length || 0);
        console.log("选项页：加载分类:", storedCategories.length);
      } catch (err) {
        console.error("选项页：加载数据出错:", err);
        setError("加载数据失败，请稍后再试");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Filter prompts based on search term and selected category
  useEffect(() => {
    let filtered = prompts;

    // 先按分类筛选
    if (selectedCategoryId) {
      filtered = filtered.filter(prompt => prompt.categoryId === selectedCategoryId);
    }

    // 再按搜索词筛选
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter((prompt) => {
        const titleMatch = prompt.title.toLowerCase().includes(term);
        const contentMatch = prompt.content.toLowerCase().includes(term);
        const tagMatch = prompt.tags.some((tag) =>
          tag.toLowerCase().includes(term)
        );
        return titleMatch || contentMatch || tagMatch;
      });
    }

    setFilteredPrompts(filtered);
  }, [searchTerm, prompts, selectedCategoryId]);

  // Save prompts to storage
  const savePrompts = async (newPrompts: PromptItem[]) => {
    try {
      await storage.setItem<PromptItem[]>(`local:${BROWSER_STORAGE_KEY}`, newPrompts);
      console.log("选项页：Prompts 已保存");
      setPrompts(newPrompts);
    } catch (err) {
      console.error("选项页：保存 Prompts 出错:", err);
      setError("保存 Prompts 失败，请稍后再试");
    }
  };

  // Add a new prompt
  const addPrompt = async (prompt: Omit<PromptItem, "id">) => {
    const newPrompt: PromptItem = {
      ...prompt,
      id: crypto.randomUUID(),
      enabled: prompt.enabled !== undefined ? prompt.enabled : true, // 确保新建的提示词默认启用
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

  // 导出提示词
  const exportPrompts = () => {
    try {
      // 创建要导出的数据
      const dataToExport = JSON.stringify(prompts, null, 2);

      // 创建Blob对象
      const blob = new Blob([dataToExport], { type: "application/json" });

      // 创建下载链接
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quick-prompts-export-${
        new Date().toISOString().split("T")[0]
      }.json`;

      // 触发下载
      document.body.appendChild(a);
      a.click();

      // 清理
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("导出 Prompts 出错:", err);
      setError("导出 Prompts 失败，请稍后再试");
    }
  };

  // 触发文件选择对话框
  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // 导入提示词
  const importPrompts = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const fileContent = await file.text();
      const importedPrompts = JSON.parse(fileContent) as PromptItem[];

      // 验证导入的数据格式
      if (!Array.isArray(importedPrompts)) {
        throw new Error("导入的文件格式不正确");
      }

      // 验证每个提示词的结构并添加默认分类
      const validPrompts = importedPrompts.filter((prompt) => {
        return (
          typeof prompt === "object" &&
          typeof prompt.id === "string" &&
          typeof prompt.title === "string" &&
          typeof prompt.content === "string" &&
          Array.isArray(prompt.tags)
        );
      }).map((prompt) => ({
        ...prompt,
        // 如果没有分类字段或分类字段为空，设置为默认分类
        categoryId: prompt.categoryId || DEFAULT_CATEGORY_ID,
        // 确保有enabled字段
        enabled: prompt.enabled !== undefined ? prompt.enabled : true,
      }));

      if (validPrompts.length === 0) {
        throw new Error("导入的文件中没有有效的提示词");
      }

      // 确认是否需要合并或覆盖现有提示词
      if (prompts.length > 0) {
        const shouldImport = window.confirm(
          `您已有${prompts.length}个提示词，发现${validPrompts.length}个待导入提示词。\n点击"确定"导入新提示词，点击"取消"不进行任何操作。`
        );

        if (shouldImport) {
          // 只导入本地没有的提示词（通过ID和标题内容判断）
          const existingIds = new Set(prompts.map((p) => p.id));
          const existingTitles = new Set(
            prompts.map((p) => p.title.toLowerCase())
          );
          const existingContents = new Set(prompts.map((p) => p.content));

          // 筛选出不重复的提示词
          const uniquePrompts = validPrompts.filter((prompt) => {
            // 通过ID、标题和内容综合判断是否重复
            const idExists = existingIds.has(prompt.id);
            const titleExists = existingTitles.has(prompt.title.toLowerCase());
            const contentExists = existingContents.has(prompt.content);

            // 如果ID和标题内容都不重复，则认为是新的提示词
            return !idExists && !titleExists && !contentExists;
          });

          if (uniquePrompts.length === 0) {
            alert("没有发现新的提示词，导入已取消。");
            return;
          }

          // 将不重复的提示词添加到现有列表中
          const newPrompts = [
            ...prompts,
            ...uniquePrompts.map((prompt) => ({
              ...prompt,
              id: crypto.randomUUID(), // 为导入的提示词生成新ID，避免ID冲突
            })),
          ];

          await savePrompts(newPrompts);
          alert(`成功导入了 ${uniquePrompts.length} 个提示词！`);
        }
        // 如果用户点击取消，不做任何操作
      } else {
        // 没有现有提示词，直接保存导入的提示词
        await savePrompts(validPrompts);
        alert(`成功导入了 ${validPrompts.length} 个提示词！`);
      }

      // 清除文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      console.error("导入 Prompts 出错:", err);
      setError(
        `导入 Prompts 失败: ${err instanceof Error ? err.message : "未知错误"}`
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

  // 从远程URL导入提示词
  const importFromRemoteUrl = async () => {
    if (!remoteUrl.trim()) {
      setError("请输入有效的URL");
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
      const importedPrompts = JSON.parse(fileContent) as PromptItem[];

      // 验证导入的数据格式
      if (!Array.isArray(importedPrompts)) {
        throw new Error("导入的数据格式不正确");
      }

      // 验证每个提示词的结构并添加默认分类
      const validPrompts = importedPrompts.filter((prompt) => {
        return (
          typeof prompt === "object" &&
          typeof prompt.id === "string" &&
          typeof prompt.title === "string" &&
          typeof prompt.content === "string" &&
          Array.isArray(prompt.tags)
        );
      }).map((prompt) => ({
        ...prompt,
        // 如果没有分类字段或分类字段为空，设置为默认分类
        categoryId: prompt.categoryId || DEFAULT_CATEGORY_ID,
        // 确保有enabled字段
        enabled: prompt.enabled !== undefined ? prompt.enabled : true,
      }));

      if (validPrompts.length === 0) {
        throw new Error("远程数据中没有有效的提示词");
      }

      // 确认是否需要导入
      if (prompts.length > 0) {
        const shouldImport = window.confirm(
          `您已有${prompts.length}个提示词，从远程发现${validPrompts.length}个待导入提示词。\n点击"确定"导入新提示词，点击"取消"不进行任何操作。`
        );

        if (shouldImport) {
          // 只导入本地没有的提示词（通过ID、标题和内容判断）
          const existingIds = new Set(prompts.map((p) => p.id));
          const existingTitles = new Set(
            prompts.map((p) => p.title.toLowerCase())
          );
          const existingContents = new Set(prompts.map((p) => p.content));

          // 筛选出不重复的提示词
          const uniquePrompts = validPrompts.filter((prompt) => {
            // 通过ID、标题和内容综合判断是否重复
            const idExists = existingIds.has(prompt.id);
            const titleExists = existingTitles.has(prompt.title.toLowerCase());
            const contentExists = existingContents.has(prompt.content);

            // 如果ID和标题内容都不重复，则认为是新的提示词
            return !idExists && !titleExists && !contentExists;
          });

          if (uniquePrompts.length === 0) {
            alert("没有发现新的提示词，导入已取消。");
            closeRemoteImportModal();
            return;
          }

          // 将不重复的提示词添加到现有列表中
          const newPrompts = [
            ...prompts,
            ...uniquePrompts.map((prompt) => ({
              ...prompt,
              id: crypto.randomUUID(), // 为导入的提示词生成新ID，避免ID冲突
            })),
          ];

          await savePrompts(newPrompts);
          alert(`成功导入了 ${uniquePrompts.length} 个提示词！`);
          closeRemoteImportModal();
        } else {
          // 用户取消导入
          closeRemoteImportModal();
        }
      } else {
        // 没有现有提示词，直接保存导入的提示词
        await savePrompts(validPrompts);
        alert(`成功导入了 ${validPrompts.length} 个提示词！`);
        closeRemoteImportModal();
      }
    } catch (err) {
      console.error("远程导入 Prompts 出错:", err);
      setError(
        `远程导入失败: ${err instanceof Error ? err.message : "未知错误"}`
      );
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
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">正在加载</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">请稍候，正在准备您的提示词...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-10">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3" />
                  </svg>
                </div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-900 to-indigo-900 dark:from-gray-100 dark:via-blue-100 dark:to-indigo-100 bg-clip-text text-transparent">
                  提示词管理
                </h1>
              </div>
              <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl">
                创建、管理和组织您的自定义提示词，提升工作效率
              </p>
              
              {/* 统计卡片 */}
              <div className="flex flex-wrap gap-4 mt-6">
                <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">总计 {prompts.length} 个提示词</span>
                  </div>
                </div>
                <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">启用 {prompts.filter(p => p.enabled).length} 个</span>
                  </div>
                </div>
                {selectedCategoryId && (
                  <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 rounded-2xl px-4 py-3 shadow-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        当前分类 {filteredPrompts.length} 个
                      </span>
                    </div>
                  </div>
                )}
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
                <h3 className="text-sm font-medium text-red-800 dark:text-red-300">操作失败</h3>
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
              {/* 搜索和筛选区域 */}
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
                      placeholder="搜索提示词..."
                      className="block xl:w-62 w-full pl-10 pr-3 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    />
                  </div>
                </div>
                
                <div className="w-full sm:w-auto xl:w-32">
                  <div className="relative">
                    <select
                      value={selectedCategoryId || ""}
                      onChange={(e) => setSelectedCategoryId(e.target.value || null)}
                      className="block w-full pl-4 pr-8 py-3 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 appearance-none cursor-pointer"
                    >
                      <option value="">所有分类</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg className="h-5 w-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="w-full flex justify-end">
                <div className="flex flex-wrap gap-2 sm:gap-3">
                  {/* 导入导出按钮组 */}
                  <div className="flex gap-2 sm:gap-3">
                    <button
                      onClick={exportPrompts}
                      disabled={prompts.length === 0}
                      className="inline-flex items-center px-4 py-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-xl transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 disabled:transform-none disabled:shadow-none"
                      title={prompts.length === 0 ? "没有提示词可导出" : "导出所有提示词"}
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      导出
                    </button>
                    
                    <button
                      onClick={triggerFileInput}
                      className="inline-flex items-center px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-xl transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      本地导入
                    </button>
                    
                    <button
                      onClick={openRemoteImportModal}
                      className="inline-flex items-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                      title="从URL导入提示词"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      远程导入
                    </button>
                  </div>
                  
                  <div className="w-px h-8 bg-gray-300 self-center"></div>
                  
                  <button
                    onClick={openAddModal}
                    className="inline-flex items-center px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-medium rounded-xl transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 shadow-blue-500/25"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    新增提示词
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

        {/* Prompts列表 */}
        <PromptList
          prompts={filteredPrompts}
          onEdit={startEdit}
          onDelete={deletePrompt}
          searchTerm={searchTerm}
          allPromptsCount={prompts.length}
          onToggleEnabled={togglePromptEnabled}
          selectedCategoryId={selectedCategoryId}
        />

        {/* 无结果提示 */}
        {filteredPrompts.length === 0 && (
          <div className="text-center py-16">
            <div className="max-w-md mx-auto">
              <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center">
                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              
              {searchTerm || selectedCategoryId ? (
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">未找到匹配的提示词</h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    {searchTerm && selectedCategoryId 
                      ? `在"${categories.find(c => c.id === selectedCategoryId)?.name}"分类中没有找到匹配"${searchTerm}"的提示词`
                      : searchTerm 
                      ? `没有找到匹配"${searchTerm}"的提示词`
                      : `"${categories.find(c => c.id === selectedCategoryId)?.name}"分类中暂无提示词`
                    }
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm("")}
                        className="inline-flex items-center px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors font-medium"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        清除搜索
                      </button>
                    )}
                    {selectedCategoryId && (
                      <button
                        onClick={() => setSelectedCategoryId(null)}
                        className="inline-flex items-center px-4 py-2 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors font-medium"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        查看所有分类
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">还没有提示词</h3>
                  <p className="text-gray-600 dark:text-gray-300">创建您的第一个提示词，开始提升工作效率</p>
                  <button
                    onClick={openAddModal}
                    className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 font-medium"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    创建第一个提示词
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
          title={editingPrompt ? "编辑提示词" : "新建提示词"}
        >
          <div className="flex items-center space-x-3 mb-4">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-md ${editingPrompt ? 'bg-gradient-to-br from-amber-500 to-orange-500' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {editingPrompt ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                )}
              </svg>
            </div>
            <span className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {editingPrompt ? "编辑提示词" : "新建提示词"}
            </span>
          </div>
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
          title="从URL导入提示词"
        >
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center shadow-md">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <span className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              从URL导入提示词
            </span>
          </div>
          <div className="space-y-6 pt-2">
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/50 rounded-xl p-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-blue-900 dark:text-blue-300">导入说明</h4>
                  <p className="text-sm text-blue-800 dark:text-blue-400 mt-1">
                    输入包含有效提示词 JSON 数据的 URL 链接，系统将自动获取并导入数据。
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="remote-url" className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  远程 URL
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
                      <h4 className="text-sm font-medium text-red-900 dark:text-red-300">导入失败</h4>
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
                取消
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
                    正在导入...
                  </div>
                ) : (
                  <div className="flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    开始导入
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
          title="确认删除"
          message=""
          confirmText="删除"
          cancelText="取消"
        >
        </ConfirmModal>
      </div>
    </div>
  );
};

export default PromptManager; 