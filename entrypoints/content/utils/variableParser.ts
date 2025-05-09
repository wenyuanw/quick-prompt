/**
 * 解析提示词内容中的变量
 * 变量格式为 {{变量名}}
 */

// 正则表达式用于匹配 {{变量名}} 格式的变量
const variableRegex = /\{\{([^{}]+)\}\}/g;

/**
 * 从提示词内容中提取变量
 * @param content 提示词内容
 * @returns 提取出的变量数组
 */
export function extractVariables(content: string): string[] {
  if (!content) return [];
  
  const variables: string[] = [];
  let match;
  
  // 使用正则表达式匹配所有变量
  while ((match = variableRegex.exec(content)) !== null) {
    // match[1] 是变量名（不含括号）
    if (match[1] && !variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }
  
  return variables;
}

/**
 * 替换提示词内容中的变量
 * @param content 提示词内容
 * @param variableValues 变量名和值的映射
 * @returns 替换变量后的内容
 */
export function replaceVariables(content: string, variableValues: Record<string, string>): string {
  if (!content) return '';
  
  // 替换所有变量
  return content.replace(variableRegex, (match, varName) => {
    // 如果提供了变量值，则替换；否则保留原样
    return variableValues[varName] !== undefined ? variableValues[varName] : match;
  });
} 