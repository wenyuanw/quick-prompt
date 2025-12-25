import React from "react";
import type { Category } from "@/utils/types";
import { DEFAULT_CATEGORY_ID } from "@/utils/constants";
import { t } from "../../../utils/i18n";

interface CategoryListProps {
  categories: Category[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  searchTerm: string;
  allCategoriesCount: number;
  onToggleEnabled?: (id: string, enabled: boolean) => void;
  promptCounts: Record<string, number>;
}

const CategoryList = ({
  categories,
  onEdit,
  onDelete,
  searchTerm,
  allCategoriesCount,
  onToggleEnabled,
  promptCounts,
}: CategoryListProps) => {
  if (allCategoriesCount === 0) {
    return null;
  }

  if (categories.length === 0 && searchTerm) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {categories.map((category) => (
        <div
          key={category.id}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 group"
        >
          {/* 紧凑卡片内容 */}
          <div className="p-3">
            {/* 标题行 */}
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: category.color || "#6366f1" }}
              />
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate flex-1">
                {category.name}
              </h3>
              {category.id === DEFAULT_CATEGORY_ID && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  {t("default")}
                </span>
              )}
            </div>

            {/* 描述 */}
            {category.description ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mb-2">
                {category.description}
              </p>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic mb-2">
                {t("noDescription")}
              </p>
            )}

            {/* 底部信息行 */}
            <div className="flex items-center justify-between">
              {/* 提示词数量 */}
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t("prompts", [`${promptCounts[category.id] || 0}`])}
              </span>

              {/* 启用开关 */}
              {onToggleEnabled && (
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={category.enabled}
                    onChange={(e) =>
                      onToggleEnabled(category.id, e.target.checked)
                    }
                    className="sr-only peer"
                  />
                  <div className='w-7 h-4 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[""] after:absolute after:top-1/2 after:right-1/2 after:-translate-y-1/2 after:bg-white after:border-gray-300 dark:after:border-gray-600 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600'></div>
                </label>
              )}
            </div>
          </div>

          {/* 操作按钮 - 悬停显示 */}
          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-1">
            <button
              onClick={() => onEdit(category.id)}
              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors cursor-pointer"
              title={t("edit")}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>

            {category.id !== DEFAULT_CATEGORY_ID && (
              <button
                onClick={() => onDelete(category.id)}
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors cursor-pointer"
                title={t("delete")}
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CategoryList;
