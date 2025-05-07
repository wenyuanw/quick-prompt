import { useState, useEffect, useRef } from "react";
import { storage } from "#imports";
import PromptForm from "./components/PromptForm";
import PromptList from "./components/PromptList";
import SearchBar from "./components/SearchBar";
import Modal from "./components/Modal";
import ConfirmModal from "./components/ConfirmModal";
import "./App.css";
import "~/assets/tailwind.css";

// 定义 Prompt 数据结构 (推荐)
export interface PromptItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  enabled: boolean;
}

const App = () => {
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

  // Load prompts from storage
  useEffect(() => {
    const loadPrompts = async () => {
      try {
        setIsLoading(true);
        const storedPrompts = await storage.getItem<PromptItem[]>(
          "local:userPrompts"
        );
        setPrompts(storedPrompts || []);
        console.log("选项页：加载 Prompts:", storedPrompts?.length || 0);
      } catch (err) {
        console.error("选项页：加载 Prompts 出错:", err);
        setError("加载 Prompts 失败，请稍后再试");
      } finally {
        setIsLoading(false);
      }
    };

    loadPrompts();
  }, []);

  // Filter prompts based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredPrompts(prompts);
      return;
    }

    const term = searchTerm.toLowerCase().trim();
    const filtered = prompts.filter((prompt) => {
      const titleMatch = prompt.title.toLowerCase().includes(term);
      const contentMatch = prompt.content.toLowerCase().includes(term);
      const tagMatch = prompt.tags.some((tag) =>
        tag.toLowerCase().includes(term)
      );
      return titleMatch || contentMatch || tagMatch;
    });

    setFilteredPrompts(filtered);
  }, [searchTerm, prompts]);

  // Save prompts to storage
  const savePrompts = async (newPrompts: PromptItem[]) => {
    try {
      await storage.setItem<PromptItem[]>("local:userPrompts", newPrompts);
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

    const newPrompts = [...prompts, newPrompt];
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

      // 验证每个提示词的结构
      const validPrompts = importedPrompts.filter((prompt) => {
        return (
          typeof prompt === "object" &&
          typeof prompt.id === "string" &&
          typeof prompt.title === "string" &&
          typeof prompt.content === "string" &&
          Array.isArray(prompt.tags)
        );
      });

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

      // 验证每个提示词的结构
      const validPrompts = importedPrompts.filter((prompt) => {
        return (
          typeof prompt === "object" &&
          typeof prompt.id === "string" &&
          typeof prompt.title === "string" &&
          typeof prompt.content === "string" &&
          Array.isArray(prompt.tags)
        );
      });

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
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex justify-center items-center min-h-[60vh]">
            <div className="text-center">
              <svg
                className="animate-spin h-10 w-10 text-blue-600 mx-auto mb-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <p className="text-gray-600 font-medium">加载中...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-5xl mx-auto px-4">
        {/* 页面标题 */}
        <div className="mb-8 text-center sm:text-left">
          <h1 className="text-3xl font-bold text-gray-800 inline-flex items-center">
            <svg
              className="w-7 h-7 mr-2 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            管理我的 Prompts
          </h1>
          <p className="text-gray-500 mt-1">
            创建并管理您的自定义提示词，随时使用
          </p>
        </div>

        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md mb-6 flex items-start">
            <svg
              className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* 搜索栏和按钮组 */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6 sm:justify-between">
          <div className="sm:w-1/2 md:w-2/5">
            <SearchBar value={searchTerm} onChange={setSearchTerm} />
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:justify-end">
            {/* 导入导出按钮组 */}
            <div className="flex">
              <button
                onClick={exportPrompts}
                className="flex-shrink-0 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center mr-2"
                disabled={prompts.length === 0}
                title={
                  prompts.length === 0 ? "没有提示词可导出" : "导出所有提示词"
                }
              >
                <svg
                  className="w-5 h-5 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                导出
              </button>
              
              {/* 本地导入按钮 */}
              <button
                onClick={triggerFileInput}
                className="flex-shrink-0 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center mr-2"
              >
                <svg
                  className="w-5 h-5 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                本地导入
              </button>
              
              {/* 远程导入按钮 */}
              <button
                onClick={openRemoteImportModal}
                className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center"
                title="从URL导入提示词"
              >
                <svg
                  className="w-5 h-5 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                远程导入
              </button>
            </div>
            
            <div className="flex-shrink-0 w-px h-8 bg-gray-300 mx-1 self-center hidden sm:block"></div>
            
            <button
              onClick={openAddModal}
              className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center"
            >
              <svg
                className="w-5 h-5 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              新增
            </button>

            {/* 隐藏的文件输入元素 */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={importPrompts}
              accept=".json"
              className="hidden"
            />
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
        />

        {/* 无结果提示 */}
        {filteredPrompts.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
            {searchTerm ? (
              <div>
                <p className="text-gray-600 mb-2">
                  没有找到匹配"{searchTerm}"的 Prompt
                </p>
                <button
                  onClick={() => setSearchTerm("")}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  清除搜索
                </button>
              </div>
            ) : (
              <div>
                <p className="text-gray-600 mb-2">您还没有创建任何 Prompt</p>
                <button
                  onClick={openAddModal}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  创建第一个 Prompt
                </button>
              </div>
            )}
          </div>
        )}

        {/* 添加/编辑 Prompt 模态框 */}
        <Modal
          isOpen={isModalOpen}
          onClose={closeModal}
          title={editingPrompt ? "编辑 Prompt" : "新建 Prompt"}
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
          <div className="space-y-4">
            <p className="text-gray-600 text-sm">
              输入包含有效提示词JSON数据的URL链接，支持以下格式:
              <br />
              - 普通URL: https://example.com/prompts.json
            </p>

            <div className="space-y-2">
              <label
                htmlFor="remote-url"
                className="block text-sm font-medium text-gray-700"
              >
                远程URL
              </label>
              <input
                type="text"
                id="remote-url"
                value={remoteUrl}
                onChange={handleRemoteUrlChange}
                placeholder="输入URL"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={closeRemoteImportModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                取消
              </button>
              <button
                onClick={importFromRemoteUrl}
                disabled={isRemoteImporting || !remoteUrl.trim()}
                className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                  isRemoteImporting || !remoteUrl.trim()
                    ? "bg-blue-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {isRemoteImporting ? (
                  <div className="flex items-center">
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    正在导入...
                  </div>
                ) : (
                  "开始导入"
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
          message="确定要删除这个 Prompt 吗？"
          confirmText="删除"
          cancelText="取消"
        />
      </div>
    </div>
  );
};

export default App;
