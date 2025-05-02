import { defineConfig } from 'wxt';
import tailwindcss from "@tailwindcss/vite";

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: (env) => ({
    plugins: [tailwindcss()],
  }),
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '快捷 Prompt 助手 (WXT)',
    description: '在网页输入框中通过指令快速插入预设的 Prompt 内容。',
    permissions: ['storage', 'tabs'],
  },
});
