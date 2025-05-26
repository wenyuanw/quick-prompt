import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import removeConsole from "vite-plugin-remove-console";

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: (configEnv: { mode: string }) => ({
    plugins:
      configEnv.mode === "production"
        ? [removeConsole({ includes: ["log"] }), tailwindcss()]
        : [tailwindcss()],
    build: {
      // 禁用压缩，便于调试
      minify: configEnv.mode === "production",
    },
  }),
  modules: ["@wxt-dev/module-react"],
  manifest: () => {
    const defaultChrome = "509806635063-m19ppgekifuo0jhlrjpsshahp59m38bf";
    const defaultWeb = "509806635063-b3lip3rck8qcu1lm2vfsjuud39gfjtuk";
    const finalChromeClientId =
      import.meta.env.WXT_CHROME_APP_CLIENT_ID_PREFIX || defaultChrome;
    const finalWebClientId =
      import.meta.env.WXT_WEB_APP_CLIENT_ID_PREFIX || defaultWeb;

    console.log("finalChromeClientId", finalChromeClientId);
    console.log("finalWebClientId", finalWebClientId);

    return {
      name: "Quick Prompt",
      description: "在网页输入框中通过指令快速插入预设的 Prompt 内容。",
      // https://developer.chrome.com/docs/extensions/how-to/integrate/oauth?hl=zh-cn#keep-consistent-id
      key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1gIStuzmtlJx9myPcEdZVB6fN6HZ4RDB2FNbhhhd1Q8kopHP3uZioJmGAbZch13CNg4nwDLzkT/Iv+SuQ92r6wEYf14rwv0pyLvegLlTWcKvpG+XfJXMl0AT32Gj2tuOoMceEpNRXZzcPf2QTftX4Lm3Kzv3kmeaIzHps1ajkT18iagllKExzmiQVZjCw/t8NYcY5cdjKQRhQqDTDqv5HnVanucEWmDPMb+AlyHOqAYxDurSt/IX1C5TW/khkCU8Fahcnw50ppVgIVKT7OLtSKDDNlqbC4BWIFWu55S5UR/CZNEbyjDtxzLkfVTi8sov7ZOUCTjEvRwjNmwXbo8PZwIDAQAB",
      permissions: ["storage", "contextMenus", "identity"],
      oauth2: {
        // This client_id is primarily for getAuthToken (Chrome)
        client_id: `${finalChromeClientId}.apps.googleusercontent.com`,
        scopes: [
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
        ],
      },
      browser_specific_settings: {
        gecko: {
          id: import.meta.env.WXT_FIREFOX_EXTENSION_ID,
        },
      },
      commands: {
        "open-prompt-selector": {
          suggested_key: {
            default: "Ctrl+Shift+P",
            mac: "Command+Shift+P",
          },
          description: "打开提示词选择弹窗",
        },
        "save-selected-prompt": {
          suggested_key: {
            default: "Ctrl+Shift+S",
            mac: "Command+Shift+S",
          },
          description: "保存选中的文本作为提示词",
        },
      },
    };
  },
});
