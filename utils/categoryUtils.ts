import { storage } from '#imports';
import { Category, PromptItem } from './types';
import { CATEGORIES_STORAGE_KEY, BROWSER_STORAGE_KEY, DEFAULT_CATEGORIES, DEFAULT_CATEGORY_ID } from './constants';

/**
 * 获取所有分类
 */
export async function getCategories(): Promise<Category[]> {
  try {
    const categories = await storage.getItem<Category[]>(`local:${CATEGORIES_STORAGE_KEY}`);
    return categories || [];
  } catch (error) {
    console.error('获取分类失败:', error);
    return [];
  }
}

/**
 * 保存分类
 */
export async function saveCategories(categories: Category[]): Promise<void> {
  try {
    await storage.setItem<Category[]>(`local:${CATEGORIES_STORAGE_KEY}`, categories);
  } catch (error) {
    console.error('保存分类失败:', error);
    throw error;
  }
}

/**
 * 初始化默认分类
 */
export async function initializeDefaultCategories(): Promise<void> {
  try {
    const existingCategories = await getCategories();
    
    if (existingCategories.length === 0) {
      await saveCategories(DEFAULT_CATEGORIES);
      console.log('已初始化默认分类');
    }
  } catch (error) {
    console.error('初始化默认分类失败:', error);
  }
}

/**
 * 获取分类按ID
 */
export async function getCategoryById(categoryId: string): Promise<Category | null> {
  try {
    const categories = await getCategories();
    return categories.find(cat => cat.id === categoryId) || null;
  } catch (error) {
    console.error('获取分类失败:', error);
    return null;
  }
}

/**
 * 添加新分类
 */
export async function addCategory(category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>): Promise<Category> {
  try {
    const categories = await getCategories();
    const newCategory: Category = {
      ...category,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    categories.push(newCategory);
    await saveCategories(categories);
    return newCategory;
  } catch (error) {
    console.error('添加分类失败:', error);
    throw error;
  }
}

/**
 * 更新分类
 */
export async function updateCategory(categoryId: string, updates: Partial<Omit<Category, 'id' | 'createdAt'>>): Promise<void> {
  try {
    const categories = await getCategories();
    const index = categories.findIndex(cat => cat.id === categoryId);
    
    if (index === -1) {
      throw new Error('分类不存在');
    }
    
    categories[index] = {
      ...categories[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    await saveCategories(categories);
  } catch (error) {
    console.error('更新分类失败:', error);
    throw error;
  }
}

/**
 * 删除分类（将其下的提示词移动到默认分类）
 */
export async function deleteCategory(categoryId: string): Promise<void> {
  try {
    if (categoryId === DEFAULT_CATEGORY_ID) {
      throw new Error('不能删除默认分类');
    }
    
    // 获取所有分类
    const categories = await getCategories();
    const categoryIndex = categories.findIndex(cat => cat.id === categoryId);
    
    if (categoryIndex === -1) {
      throw new Error('分类不存在');
    }
    
    // 获取所有提示词，将属于该分类的提示词移动到默认分类
    const prompts = await storage.getItem<PromptItem[]>(`local:${BROWSER_STORAGE_KEY}`) || [];
    const updatedPrompts = prompts.map(prompt => 
      prompt.categoryId === categoryId 
        ? { ...prompt, categoryId: DEFAULT_CATEGORY_ID }
        : prompt
    );
    
    // 保存更新后的提示词
    await storage.setItem<PromptItem[]>(`local:${BROWSER_STORAGE_KEY}`, updatedPrompts);
    
    // 删除分类
    categories.splice(categoryIndex, 1);
    await saveCategories(categories);
  } catch (error) {
    console.error('删除分类失败:', error);
    throw error;
  }
}

/**
 * 迁移旧数据：为没有分类ID的提示词添加默认分类ID
 */
export async function migratePromptsWithCategory(): Promise<void> {
  try {
    // 先确保有默认分类
    await initializeDefaultCategories();
    
    // 获取所有提示词
    const prompts = await storage.getItem<PromptItem[]>(`local:${BROWSER_STORAGE_KEY}`) || [];
    
    // 检查是否有需要迁移的数据
    const needMigration = prompts.some(prompt => !prompt.categoryId || prompt.sortOrder === undefined);
    
    if (needMigration) {
      const migratedPrompts = prompts.map((prompt, index) => ({
        ...prompt,
        categoryId: prompt.categoryId || DEFAULT_CATEGORY_ID,
        sortOrder: prompt.sortOrder !== undefined ? prompt.sortOrder : index,
      }));
      
      await storage.setItem<PromptItem[]>(`local:${BROWSER_STORAGE_KEY}`, migratedPrompts);
      console.log('已完成提示词分类和排序迁移');
    }
  } catch (error) {
    console.error('迁移提示词分类失败:', error);
  }
}

/**
 * 获取指定分类下的提示词数量
 */
export async function getPromptCountByCategory(categoryId: string): Promise<number> {
  try {
    const prompts = await storage.getItem<PromptItem[]>(`local:${BROWSER_STORAGE_KEY}`) || [];
    return prompts.filter(prompt => prompt.categoryId === categoryId).length;
  } catch (error) {
    console.error('获取分类下提示词数量失败:', error);
    return 0;
  }
} 