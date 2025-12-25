/**
 * 分类数据结构
 */
export interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Prompt 数据结构
 */
export interface PromptItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  enabled: boolean;
  categoryId: string;
  pinned?: boolean; // 置顶字段
  notionPageId?: string;
  notes?: string; // 备注字段
  lastModified?: string; // 最后修改时间（ISO 字符串）
  sortOrder?: number; // 排序字段，用于拖拽排序
  thumbnailUrl?: string; // 缩略图 URL
}

export interface PromptItemWithVariables extends PromptItem {
  /**
   * 解析出的变量，不持久化保存
   */
  _variables?: string[];
}

// 自定义接口，用于统一处理不同类型的文本输入元素
export interface EditableElement {
  value: string;
  selectionStart?: number | null;
  selectionEnd?: number | null;
  focus(): void;
  setSelectionRange?(start: number, end: number): void;
  dispatchEvent(event: Event): boolean;
}
