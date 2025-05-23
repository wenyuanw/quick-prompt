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

      // 更新提示词数量
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
      // It's an update operation
      await handleUpdateCategory(category as Category);
    } else {
      // It's an add operation
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

        // 更新提示词数量
        const newPromptCounts = { ...promptCounts };
        delete newPromptCounts[categoryToDelete];
        setPromptCounts(newPromptCounts);
      } catch (err) {
        console.error("分类管理页：删除分类出错:", err);
        setError("删除分类失败，请稍后再试");
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
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
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
      <div className="max-w-6xl mx-auto px-4">
        {/* 页面标题 */}
        <div className="mb-8 text-center sm:text-left">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 inline-flex items-center">
                分类管理
              </h1>
              <p className="text-gray-500 mt-1">
                创建和管理提示词分类，让您的提示词更有条理
              </p>
            </div>
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
          <div className="flex gap-2">
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
              新增分类
            </button>
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
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
            {searchTerm ? (
              <div>
                <p className="text-gray-600 mb-2">
                  没有找到匹配"{searchTerm}"的分类
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
                <p className="text-gray-600 mb-2">您还没有创建任何分类</p>
                <button
                  onClick={openAddModal}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  创建第一个分类
                </button>
              </div>
            )}
          </div>
        )}

        {/* 添加/编辑分类模态框 */}
        <Modal
          isOpen={isModalOpen}
          onClose={closeModal}
          title={editingCategory ? "编辑分类" : "新建分类"}
        >
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
          title="确认删除"
          message="确定要删除这个分类吗？该分类下的所有提示词将被移动到默认分类。"
          confirmText="删除"
          cancelText="取消"
        />
      </div>
    </div>
  );
};

export default CategoryManager;
