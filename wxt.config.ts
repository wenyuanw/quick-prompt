import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'
import removeConsole from 'vite-plugin-remove-console'
import dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

// 手动读取 .env 文件
let envConfig: Record<string, string> = {}
try {
  const envPath = path.resolve(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    envContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
      if (match) {
        const key = match[1]
        let value = match[2] || ''
        // 移除引号
        value = value.replace(/^['"]|['"]$/g, '')
        envConfig[key] = value
      }
    })
    console.log('Successfully loaded environment variables from .env file')
  } else {
    console.warn('.env file not found, using default values')
  }
} catch (error) {
  console.error('Error reading .env file:', error)
}

// 从环境变量中读取 Google Cloud Console 配置，使用我们自己解析的变量
const CHROME_APP_CLIENT_ID_PREFIX = envConfig.CHROME_APP_CLIENT_ID_PREFIX || process.env.CHROME_APP_CLIENT_ID_PREFIX
const WEB_APP_CLIENT_ID_PREFIX = envConfig.WEB_APP_CLIENT_ID_PREFIX || process.env.WEB_APP_CLIENT_ID_PREFIX
const FIREFOX_EXTENSION_ID = envConfig.FIREFOX_EXTENSION_ID || process.env.FIREFOX_EXTENSION_ID || 'quick-prompt@example.com'

if (!CHROME_APP_CLIENT_ID_PREFIX || !WEB_APP_CLIENT_ID_PREFIX) {
  // 开发环境下，使用硬编码的默认值，仅用于开发目的
  console.warn('Required environment variables are missing. Using default values for development only.')
  const defaultChrome = '509806635063-m19ppgekifuo0jhlrjpsshahp59m38bf'
  const defaultWeb = '509806635063-b3lip3rck8qcu1lm2vfsjuud39gfjtuk'
  
  if (!CHROME_APP_CLIENT_ID_PREFIX) {
    console.warn(`CHROME_APP_CLIENT_ID_PREFIX not found, using default: ${defaultChrome}`)
  }
  if (!WEB_APP_CLIENT_ID_PREFIX) {
    console.warn(`WEB_APP_CLIENT_ID_PREFIX not found, using default: ${defaultWeb}`)
  }
  
  if (process.env.NODE_ENV === 'production') {
    console.error('Error: Required environment variables are missing in production environment.')
    console.error('Please ensure you have set CHROME_APP_CLIENT_ID_PREFIX and WEB_APP_CLIENT_ID_PREFIX in your .env file.')
    process.exit(1)
  }
}

// 在这里确保这些变量有值
const finalChromeClientId = CHROME_APP_CLIENT_ID_PREFIX || '509806635063-m19ppgekifuo0jhlrjpsshahp59m38bf'
const finalWebClientId = WEB_APP_CLIENT_ID_PREFIX || '509806635063-b3lip3rck8qcu1lm2vfsjuud39gfjtuk'

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: (configEnv: { mode: string }) => ({
    plugins:
    configEnv.mode === 'production'
      ? [removeConsole({ includes: ['log'] }), tailwindcss()]
      : [tailwindcss()],
    define: {
      __CHROME_CLIENT_ID_PREFIX__: JSON.stringify(finalChromeClientId),
      __WEB_APP_CLIENT_ID_PREFIX__: JSON.stringify(finalWebClientId)
    },
    build: {
      // 禁用压缩，便于调试
      minify: configEnv.mode === 'production',
    }
  }),
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Quick Prompt',
    description: '在网页输入框中通过指令快速插入预设的 Prompt 内容。',
    permissions: ['storage', 'contextMenus', 'identity'],
    oauth2: { // This client_id is primarily for getAuthToken (Chrome)
      client_id: `${finalChromeClientId}.apps.googleusercontent.com`,
      scopes: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile']
    },
    browser_specific_settings: {
      gecko: {
        id: FIREFOX_EXTENSION_ID
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
