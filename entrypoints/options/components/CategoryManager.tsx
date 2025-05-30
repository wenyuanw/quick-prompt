import { useState, useEffect, useRef } from "react";
import CategoryForm from "./CategoryForm";
import CategoryList from "./CategoryList";
import SearchBar from "./SearchBar";
import Modal from "./Modal";
import ConfirmModal from "./ConfirmModal";
import "../App.css";
import "~/assets/tailwind.css";
import { Category } from "@/utils/types";
import {
  getCategories,
  saveCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  getPromptCountByCategory,
} from "@/utils/categoryUtils";
import { DEFAULT_CATEGORY_ID } from "@/utils/constants";

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

  // Load categories from storage
  useEffect(() => {
    const loadCategories = async () => {
      try {
        setIsLoading(true);
        const storedCategories = await getCategories();
        setCategories(storedCategories);
        console.log("分类管理页：加载分类:", storedCategories.length);

        // 加载每个分类下的提示词数量
        const counts: Record<string, number> = {};
        for (const category of storedCategories) {
          counts[category.id] = await getPromptCountByCategory(category.id);
        }
        setPromptCounts(counts);
      } catch (err) {
        console.error("分类管理页：加载分类出错:", err);
        setError("加载分类失败，请稍后再试");
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
      console.error("分类管理页：添加分类出错:", err);
      setError("添加分类失败，请稍后再试");
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
      console.error("分类管理页：更新分类出错:", err);
      setError("更新分类失败，请稍后再试");
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
      setError("不能删除默认分类");
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
        console.error("分类管理页：删除分类出错:", err);
        setError("删除分类失败，请稍后再试");
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
      console.error("分类管理页：切换分类状态出错:", err);
      setError("切换分类状态失败，请稍后再试");
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50">
        <div className="flex justify-center items-center min-h-screen">
          <div className="text-center space-y-4">
            <div className="relative">
              <div className="w-16 h-16 mx-auto">
                <div className="absolute inset-0 border-4 border-purple-200 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-purple-600 rounded-full border-t-transparent animate-spin"></div>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-gray-700">正在加载</h3>
              <p className="text-sm text-gray-500">请稍候，正在准备您的分类...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50">
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
                <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-purple-900 to-pink-900 bg-clip-text text-transparent">
                  分类管理
                </h1>
              </div>
              <p className="text-lg text-gray-600 max-w-2xl">
                创建和管理提示词分类，让您的提示词更有条理
              </p>
              
              {/* 统计卡片 */}
              <div className="flex flex-wrap gap-4 mt-6">
                <div className="bg-white/70 backdrop-blur-sm border border-white/20 rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-gray-700">总计 {categories.length} 个分类</span>
                  </div>
                </div>
                <div className="bg-white/70 backdrop-blur-sm border border-white/20 rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <span className="text-sm font-medium text-gray-700">启用 {categories.filter(c => c.enabled).length} 个</span>
                  </div>
                </div>
                <div className="bg-white/70 backdrop-blur-sm border border-white/20 rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-sm font-medium text-gray-700">
                      提示词总数 {Object.values(promptCounts).reduce((a, b) => a + b, 0)} 个
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-red-800">操作失败</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="flex-shrink-0 text-red-400 hover:text-red-600 transition-colors"
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
          <div className="bg-white/80 backdrop-blur-sm border border-white/20 rounded-2xl p-4 shadow-xl"> {/* p-6 to p-4 */}
            <div className="flex flex-col sm:flex-row gap-4 sm:justify-between sm:items-center"> {/* Reduced gap */}
              {/* 搜索区域 */}
              <div className="flex-1 min-w-0 sm:max-w-xl"> {/* Added min-w-0 and max-width */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"> {/* Icon color */}
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="搜索分类名称或描述..."
                    className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl bg-white/50 backdrop-blur-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                  />
                </div>
              </div>
              
              {/* 操作按钮 */}
              <div className="flex-shrink-0">
                <button
                  onClick={openAddModal}
                  className="inline-flex items-center px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-sm font-medium rounded-xl transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 shadow-purple-500/25"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  新增分类
                </button>
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
                  <h3 className="text-xl font-semibold text-gray-900">未找到匹配的分类</h3>
                  <p className="text-gray-600">
                    没有找到匹配 "{searchTerm}" 的分类。
                  </p>
                  <div className="flex justify-center">
                    <button
                      onClick={() => setSearchTerm("")}
                      className="inline-flex items-center px-4 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors font-medium"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      清除搜索
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-gray-900">还没有分类</h3>
                  <p className="text-gray-600">创建您的第一个分类，开始组织您的提示词吧！</p>
                  <button
                    onClick={openAddModal}
                    className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 font-medium shadow-purple-500/25"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    创建第一个分类
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
          title={editingCategory ? "编辑分类" : "新建分类"} // Title as string
        >
          {/* Modal Header with Icon */}
          <div className="flex items-center space-x-3 mb-4">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-md ${editingCategory ? 'bg-gradient-to-br from-amber-500 to-orange-500' : 'bg-gradient-to-br from-purple-500 to-pink-600'}`}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {editingCategory ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                )}
              </svg>
            </div>
            <span className="text-xl font-semibold text-gray-900">
              {editingCategory ? "编辑分类" : "新建分类"}
            </span>
          </div>
          <CategoryForm
            onSubmit={handleCategorySubmit}
            initialData={editingCategory}
            onCancel={cancelEdit}
            isEditing={!!editingCategory}
          />
        </Modal>

        {/* 确认删除对话框 */}
        <ConfirmModal
          isOpen={isConfirmModalOpen}
          onClose={() => {
            setIsConfirmModalOpen(false);
            setCategoryToDelete(null);
          }}
          onConfirm={handleConfirmDelete}
          title="确认删除分类"
          message="确定要删除这个分类吗？该分类下的所有提示词将被移动到默认分类。此操作无法撤销。" // Message as string
          confirmText="删除"
          cancelText="取消"
        />
      </div>
    </div>
  );
};

export default CategoryManager;
