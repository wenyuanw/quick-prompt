import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { browser } from "#imports";
import PromptForm from "./components/PromptForm";
import PromptList from "./components/PromptList";
import SearchBar from "./components/SearchBar";
import Modal from "./components/Modal";
import ConfirmModal from "./components/ConfirmModal";
import GoogleAuthButton from "./components/GoogleAuthButton";
import NotionIntegration from "./components/NotionIntegration";
import "./App.css";
import "~/assets/tailwind.css";

// 添加哈希函數用於生成確定性ID
function hashString(str: string): number {
  let hash = 0;
  if (str.length === 0) return hash;
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 轉為32位整數
  }
  
  return Math.abs(hash); // 確保是正數
}

function generatePromptId(title: string, content: string, tags?: string[]): string {
  // 基本唯一識別內容：標題和內容
  let uniqueString = `${title.trim()}::${content.trim()}`;
  
  // 如果有標籤，也納入哈希計算
  if (tags && tags.length > 0) {
    const sortedTags = [...tags].sort();
    uniqueString += `::${sortedTags.join(',')}`;
  }
  
  // 生成哈希並轉換為36進制字符串（更短）
  const hash = hashString(uniqueString);
  const hashStr = hash.toString(36);
  
  // 添加前綴
  return `p${hashStr}`;
}

// 定义 Prompt 数据结构 (推荐)
export interface PromptItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  enabled: boolean;
  notionPageId?: string;
  needsIdUpdateInNotion?: boolean;
}

const App = () => {
  // 添加用戶信息狀態
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
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
  // 添加同步設置顯示狀態
  const [showIntegrationSection, setShowIntegrationSection] = useState(false);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null); // 新增 state 用於同步成功提示

  // 從URL獲取查詢參數
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
  const loadPrompts = async () => {
    try {
      setIsLoading(true);
      const result = await browser.storage.local.get("userPrompts");
      const storedPrompts = result.userPrompts || [];
      setPrompts(storedPrompts);
      console.log("选项页：加载 Prompts:", storedPrompts?.length || 0);
      setError(null);
    } catch (err) {
      console.error("Error loading prompts:", err);
      setError("加载提示词失败");
    } finally {
      setIsLoading(false);
    }
  };

  // 添加 useEffect 鉤子來加載提示詞
  useEffect(() => {
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

  const sortedAndFilteredPrompts = useMemo(() => {
    return [...filteredPrompts].sort((a, b) => {
      // true (enabled) 排在前面, false (disabled) 排在後面
      if (a.enabled && !b.enabled) {
        return -1; // a comes first
      }
      if (!a.enabled && b.enabled) {
        return 1; // b comes first
      }
      // 如果 enabled 状态相同, 可以根据其他标准排序，例如标题或保持原有顺序
      // 例如，按標題字母順序作為次要排序標準：
      // return a.title.localeCompare(b.title);
      return 0; // 保持原有順序（對於相同 enabled 狀態的項）
    });
  }, [filteredPrompts]);

  // Save prompts to storage
  const savePrompts = useCallback(async (newPrompts: PromptItem[], skipSync?: boolean) => {
    try {
      await browser.storage.local.set({ userPrompts: newPrompts });
      console.log("选项页：Prompts 已保存");
      setPrompts(newPrompts);
      // 通常保存操作后，如果 Notion 同步到本地是启用的，会由 background.ts 中的 onChanged 监听器触发
      // 但如果需要更明确的控制或避免不必要的重复同步，可以在此进行条件判断
      // 不过当前设计是依赖 background.ts 的监听器
    } catch (err) {
      console.error("选项页：保存 Prompts 出错:", err);
      setError("保存 Prompts 失败，请稍后再试");
    }
  }, []);

  // Add a new prompt
  const addPrompt = async (prompt: Omit<PromptItem, "id">) => {
    const newPrompt: PromptItem = {
      ...prompt,
      id: generatePromptId(prompt.title, prompt.content, prompt.tags),
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
    const promptToDelete = id;
    setPromptToDelete(promptToDelete);
    setIsConfirmModalOpen(true);

    // 記錄已刪除的 ID 用於 Notion 同步
    try {
      const result = await browser.storage.local.get("deletedPromptIds");
      const existingDeletedIds = result.deletedPromptIds || [];
      if (!existingDeletedIds.includes(promptToDelete)) {
        await browser.storage.local.set({ deletedPromptIds: [...existingDeletedIds, promptToDelete] });
        console.log(`Prompt ID ${promptToDelete} marked for deletion in Notion.`);
      }
    } catch (err) {
      console.error("Error marking prompt as deleted for Notion sync:", err);
    }
  };

  const handleConfirmDelete = async () => {
    if (promptToDelete) {
      const newPrompts = prompts.filter((p) => p.id !== promptToDelete);
      await savePrompts(newPrompts);

      if (editingPrompt?.id === promptToDelete) {
        setEditingPrompt(null);
      }
      // 关闭确认模态框并清除待删除的 prompt ID
      setIsConfirmModalOpen(false);
      setPromptToDelete(null);
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

          // 將不重複的提示詞添加到現有列表中
          const newPrompts = [
            ...prompts,
            ...uniquePrompts.map((prompt) => ({
              ...prompt,
              id: generatePromptId(prompt.title, prompt.content, prompt.tags), // 使用基於內容的哈希ID
            })),
          ];

          await savePrompts(newPrompts);
          alert(`成功導入了 ${uniquePrompts.length} 個提示詞！`);
        }
        // 如果用户点击取消，不做任何操作
      } else {
        // 没有现有提示词，直接保存导入的提示词
        await savePrompts(validPrompts);
        alert(`成功導入了 ${validPrompts.length} 個提示詞！`);
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

          // 將不重複的提示詞添加到現有列表中
          const newPrompts = [
            ...prompts,
            ...uniquePrompts.map((prompt) => ({
              ...prompt,
              id: generatePromptId(prompt.title, prompt.content, prompt.tags), // 使用基於內容的哈希ID
            })),
          ];

          await savePrompts(newPrompts);
          alert(`成功導入了 ${uniquePrompts.length} 個提示詞！`);
          closeRemoteImportModal();
        } else {
          // 用户取消导入
          closeRemoteImportModal();
        }
      } else {
        // 没有现有提示词，直接保存导入的提示词
        await savePrompts(validPrompts);
        alert(`成功導入了 ${validPrompts.length} 個提示詞！`);
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

  // 主题切换逻辑
  useEffect(() => {
    // 检测系统颜色模式并设置相应的class
    const updateTheme = (isDark: boolean) => {
      if (isDark) {
        document.documentElement.classList.remove('light');
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
    };

    // 初始检测
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      updateTheme(true);
    }

    // 监听系统颜色模式变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      updateTheme(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);

    // 清理函数
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  // 處理認證成功
  const handleAuthSuccess = (userInfo: { email: string; name: string }) => {
    setUser(userInfo);
    // 成功登入後顯示同步設置
    setShowIntegrationSection(true);
  };

  // 切換顯示同步設置
  const toggleIntegrationSection = () => {
    setShowIntegrationSection(!showIntegrationSection);
  };

  useEffect(() => {
    const messageListener = (message: any, sender: any, sendResponse: (response?: any) => void) => {
      if (message.action === 'notionSyncSuccess' && message.source === 'localToNotion') {
        setSyncSuccessMessage(message.message);
        const timer = setTimeout(() => {
          setSyncSuccessMessage(null);
        }, 3000); // 3 秒後消失
        // 清理 timeout 以防組件卸載前觸發
        return () => clearTimeout(timer);
      }
      // Handle other messages if needed
    };

    browser.runtime.onMessage.addListener(messageListener);

    return () => {
      browser.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

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
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* 同步成功提示 */} 
      {syncSuccessMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-green-600 dark:bg-green-700 text-white py-3 px-6 rounded-xl shadow-2xl z-50 text-sm font-medium transition-all duration-300 ease-in-out opacity-100">
          {syncSuccessMessage}
        </div>
      )}
      
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-5xl mx-auto px-4">
          {/* 页面标题 */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              提示词管理
            </h1>
            <div className="flex gap-2">
              <button
                onClick={toggleIntegrationSection}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 flex items-center"
              >
              <svg
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-5 w-5 mr-1" 
                fill="none"
                  viewBox="0 0 24 24" 
                stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" 
                  />
                </svg>
                雲同步
              </button>
              {/* The button below will be removed 
              <button
                onClick={openAddModal}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center"
              >
                <svg
                  className="h-5 w-5 mr-1"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                viewBox="0 0 24 24"
                  stroke="currentColor"
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
              */}

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
            prompts={sortedAndFilteredPrompts}
            onEdit={startEdit}
            onDelete={deletePrompt}
            searchTerm={searchTerm}
            allPromptsCount={prompts.length}
            onToggleEnabled={togglePromptEnabled}
          />

          {/* 无结果提示 */}
          {sortedAndFilteredPrompts.length === 0 && (
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

          {/* 同步設置部分 */}
          {showIntegrationSection && (
            <div className="mt-6 p-6 bg-white rounded-lg shadow-sm border border-gray-200">
              <h2 className="text-2xl font-bold mb-4">同步設置</h2>
              <GoogleAuthButton onAuthSuccess={handleAuthSuccess} />
              <NotionIntegration />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
