import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: (env) => ({
    plugins: [tailwindcss()],
  }),
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Quick Prompt',
    description: '在网页输入框中通过指令快速插入预设的 Prompt 内容。',
    permissions: ['storage', 'tabs', 'contextMenus'],
    commands: {
      'open-prompt-selector': {
        suggested_key: {
          default: 'Ctrl+Shift+P',
          mac: 'Command+Shift+P',
        },
        description: '打开提示词选择弹窗',
      },
      'save-selected-prompt': {
        suggested_key: {
          default: 'Ctrl+Shift+S',
          mac: 'Command+Shift+S',
        },
        description: '保存选中的文本作为提示词',
      },
    },
  },
})
