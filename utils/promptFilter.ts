import type { PromptItem } from "./types";
import { filterPrompts } from "./promptUtils";

export interface PromptFilterOptions {
  searchTerm?: string;
  categoryId?: string | null;
}

/**
 * 按搜索词和分类过滤提示词，并按"置顶优先 + 最后修改时间降序"排序。
 * 该逻辑与内容脚本中的 PromptSelector 列表保持一致，供选择器和侧边栏共用。
 */
export const filterAndSortPrompts = <T extends PromptItem>(
  prompts: T[],
  options: PromptFilterOptions = {}
): T[] => {
  const { searchTerm, categoryId } = options;

  const filtered = filterPrompts(prompts, { searchTerm, categoryId }) as T[];

  return [...filtered].sort((a, b) => {
    // 置顶项目优先
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;

    // 同级别按最后修改时间降序（新的在前面）
    const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0;
    const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0;
    return bTime - aTime;
  });
};
