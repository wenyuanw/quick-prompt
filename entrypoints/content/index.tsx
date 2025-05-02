import '~/assets/tailwind.css'
import './content.css'

export default defineContentScript({
  matches: ['*://*/*'],

  async main(ctx) {
    console.log('内容脚本 (WXT): 已加载')
  },
})
