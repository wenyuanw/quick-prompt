import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'
import removeConsole from 'vite-plugin-remove-console'

// 以下兩個值需要根據您自己的 Google Cloud Console 配置進行替換
const CHROME_APP_CLIENT_ID_PREFIX = 'YOUR_CHROME_APP_CLIENT_ID_PREFIX'; // For Chrome getAuthToken API
const WEB_APP_CLIENT_ID_PREFIX = 'YOUR_WEB_APP_CLIENT_ID_PREFIX'; // For launchWebAuthFlow API

console.log('配置中的WEB_APP_CLIENT_ID_PREFIX:', WEB_APP_CLIENT_ID_PREFIX);

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: (configEnv) => ({
    plugins:
      configEnv.mode === 'production'
        ? [removeConsole({ includes: ['log'] }), tailwindcss()]
        : [tailwindcss()],
    define: {
      // __CHROME_CLIENT_ID_PREFIX__: JSON.stringify(CHROME_APP_CLIENT_ID_PREFIX),
      __WEB_APP_CLIENT_ID_PREFIX__: JSON.stringify(WEB_APP_CLIENT_ID_PREFIX)
    },
    build: {
      // 禁用壓縮，便於調試
      minify: configEnv.mode === 'production',
    }
  }),
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Quick Prompt',
    description: '在网页输入框中通过指令快速插入预设的 Prompt 内容。',
    permissions: ['storage', 'contextMenus', 'identity'],
    oauth2: { // This client_id is primarily for getAuthToken (Chrome)
      client_id: `${CHROME_APP_CLIENT_ID_PREFIX}.apps.googleusercontent.com`,
      scopes: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile']
    },
    browser_specific_settings: {
      gecko: {
        id: "your-extension-id@example.com" // 替換為您的 Firefox 擴展 ID
        // 如果您要發布到 Firefox Add-ons 商店，請使用 Mozilla 分配的 ID
      }
    },
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
