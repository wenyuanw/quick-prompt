function hashString(str: string): number {
  let hash = 0;
  if (str.length === 0) return hash;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }
  return Math.abs(hash); // 确保是正数
}

/**
 * Generates a unique ID for a prompt based on its title, content, and tags.
 * Ensures the ID starts with 'p' to be a valid selector.
 * @param title The title of the prompt.
 * @param content The content of the prompt.
 * @param tags Optional array of tags.
 * @returns A unique string ID for the prompt.
 */
export function generatePromptId(title: string, content: string, tags?: string[]): string {
  let uniqueString = `${title.trim()}::${content.trim()}`;
  if (tags && tags.length > 0) {
    const sortedTags = [...tags].sort();
    uniqueString += `::${sortedTags.join(',')}`;
  }
  const hash = hashString(uniqueString);
  const hashStr = hash.toString(36);
  // 添加前缀p以确保ID始终以字母开头，避免潜在的CSS选择器问题或HTML ID问题
  return `p${hashStr}`;
} 