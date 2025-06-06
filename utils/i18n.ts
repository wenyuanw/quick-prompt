// 简单的 i18n 工具函数，使用 browser.i18n API
export function t(key: string, substitutions?: string[]): string {
  try {
    return browser.i18n.getMessage(key as any, substitutions)
  } catch (error) {
    console.warn(`Translation missing for key: ${key}`)
    return key
  }
}