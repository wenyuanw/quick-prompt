import { BROWSER_STORAGE_KEY } from '@/utils/constants'
import { useState, useEffect } from 'react'
import Logo from '~/assets/icon.png'
import '~/assets/tailwind.css'

function App() {
  const [promptCount, setPromptCount] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [shortcutKey, setShortcutKey] = useState<string>('')
  const [saveShortcutKey, setSaveShortcutKey] = useState<string>('')
  const [shortcutSettingsUrl, setShortcutSettingsUrl] = useState<string>('')
  const [showShortcutHelp, setShowShortcutHelp] = useState<boolean>(false)

  // 加载提示数量
  const loadPromptCount = async () => {
    try {
      setLoading(true)

      // 直接从本地存储获取数据
      try {
        const result = await browser.storage.local.get(BROWSER_STORAGE_KEY)
        const allPrompts = result.userPrompts || []

        if (Array.isArray(allPrompts)) {
          // 只计算启用的提示词数量
          const enabledPrompts = allPrompts.filter((prompt: any) => prompt.enabled !== false)
          setPromptCount(enabledPrompts.length)
          
          console.log(`弹出窗口：共有 ${allPrompts.length} 个提示词，其中 ${enabledPrompts.length} 个已启用`)
        } else {
          setPromptCount(0)
        }
      } catch (storageErr) {
        console.error('弹出窗口：直接读取storage失败', storageErr)
        setError('无法从存储中读取数据')
        setPromptCount(0)
      }
    } catch (err) {
      console.error('弹出窗口：加载提示数量出错', err)
      setError('无法加载提示')
    } finally {
      setLoading(false)
    }
  }

  // 获取当前快捷键
  const getShortcutKey = async () => {
    try {
      // 检测当前浏览器类型
      const isFirefox = navigator.userAgent.includes('Firefox')
      // 设置对应浏览器的扩展快捷键设置页面
      if (isFirefox) {
        setShortcutSettingsUrl('about:addons')
      } else {
        setShortcutSettingsUrl('chrome://extensions/shortcuts')
      }
      
      // 从浏览器API获取真实配置的快捷键
      const commands = await browser.commands.getAll()
      const promptCommand = commands.find(cmd => cmd.name === 'open-prompt-selector')
      const saveCommand = commands.find(cmd => cmd.name === 'save-selected-prompt')
      
      if (promptCommand && promptCommand.shortcut) {
        setShortcutKey(promptCommand.shortcut)
        setShowShortcutHelp(false)
      } else {
        // 如果未找到快捷键配置或未设置，提示用户进入快捷键设置页面
        setShortcutKey('')
        setShowShortcutHelp(true)
      }
      
      if (saveCommand && saveCommand.shortcut) {
        setSaveShortcutKey(saveCommand.shortcut)
      } else {
        // 如果未找到快捷键配置或未设置，不显示此快捷键
        setSaveShortcutKey('')
      }
    } catch (err) {
      console.error('获取快捷键设置失败', err)
      // 出错时提示用户进入快捷键设置页面
      const isFirefox = navigator.userAgent.includes('Firefox')
      if (isFirefox) {
        setShortcutSettingsUrl('about:addons')
      } else {
        setShortcutSettingsUrl('chrome://extensions/shortcuts')
      }
      setShortcutKey('')
      setSaveShortcutKey('')
      setShowShortcutHelp(true)
    }
  }

  // 首次加载
  useEffect(() => {
    loadPromptCount()
    getShortcutKey()

    // 检查系统暗黑模式设置并应用
    const applySystemTheme = () => {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches

      // 应用暗黑模式到HTML元素
      if (isDark) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }

    // 首次应用主题
    applySystemTheme()

    // 监听系统暗黑模式变化
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = () => applySystemTheme()
    darkModeMediaQuery.addEventListener('change', listener)

    return () => {
      darkModeMediaQuery.removeEventListener('change', listener)
    }
  }, [])

  // 打开选项页（在新标签页中）
  const openOptionsPage = async () => {
    try {
      // 向background脚本发送消息请求在新标签页中打开选项页
      await browser.runtime.sendMessage({ action: 'openOptionsPage' })
      // 关闭popup窗口
      window.close()
    } catch (err) {
      console.error('弹出窗口：打开选项页出错', err)
      // 回退方案：直接使用API打开选项页
      browser.runtime.openOptionsPage()
    }
  }

  // 打开快捷键设置页面
  const openShortcutSettings = () => {
    // 对于Firefox，直接打开about:addons后需要用户进一步操作
    if (navigator.userAgent.includes('Firefox')) {
      // 显示额外提示
      alert('打开扩展页面后，请点击右上角的齿轮图标，并选择"管理扩展快捷键"选项')
    }
    
    // 尝试打开设置页面
    try {
      browser.tabs.create({ url: shortcutSettingsUrl })
      window.close()
    } catch (err) {
      console.error('打开快捷键设置页面失败', err)
    }
  }

  return (
    <div className='p-4 w-full max-w-[350px] min-w-[300px] box-border bg-white text-gray-900 dark:bg-gray-900 dark:text-white transition-colors duration-200'>
      {/* 标题区域 */}
      <div className='flex justify-center items-center mb-3'>
        <img src={Logo} className='h-8 mr-2' alt='quick prompt logo' />
        <h1 className='text-lg font-bold whitespace-nowrap m-0 p-0 leading-normal dark:text-white'>
          Quick Prompt
        </h1>
      </div>

      {/* 统计卡片 */}
      <div className='rounded-lg shadow p-2 mb-3 relative bg-white dark:bg-gray-800 transition-colors duration-200'>
        <div className='flex justify-between items-center mb-1'>
          <div className='flex items-center'>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h2 className='text-sm font-semibold m-0 text-gray-700 dark:text-gray-200'>提示词库</h2>
          </div>
        </div>

        {/* 设置固定高度容器，防止状态切换时闪烁 */}
        <div className='h-12 flex items-center justify-center'>
          {loading ? (
            // 骨架屏加载状态
            <div className='text-center w-full'>
              <div className='h-6 flex justify-center items-center'>
                <div className='w-8 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse'></div>
              </div>
              <div className='h-3 mt-1 flex justify-center items-center'>
                <div className='w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse'></div>
              </div>
            </div>
          ) : error ? (
            <div className='text-red-500 text-center text-xs dark:text-red-400'>{error}</div>
          ) : (
            <div className='text-center flex items-center justify-center'>
              <span className='text-xl font-bold text-blue-600 dark:text-blue-400 mr-1.5'>
                {promptCount}
              </span>
              <p className='text-gray-500 text-xs m-0 dark:text-gray-400'>个可用提示</p>
            </div>
          )}
        </div>
      </div>

      {/* 操作区域 */}
      <div className='flex flex-col gap-2'>
        <button
          onClick={openOptionsPage}
          className='bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 transition-colors duration-200'
        >
          管理提示词
        </button>

        {/* 快捷方式提示区域 */}
        <div className='mt-3 rounded-lg bg-gray-50 dark:bg-gray-800 p-3 shadow-sm'>
          <h3 className='text-xs font-medium text-gray-600 dark:text-gray-300 mb-2'>使用方式</h3>
          
          <div className='flex items-start mb-2'>
            <div className='flex-shrink-0 text-blue-500 dark:text-blue-400 mr-2 mt-1'>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
            </div>
            <span className='text-xs text-gray-600 dark:text-gray-300 leading-relaxed'>
              快捷输入: 任意输入框中输入 <kbd className='inline-flex items-center justify-center px-1.5 py-0.5 my-0.5 text-xs font-semibold bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 shadow-sm text-blue-600 dark:text-blue-400 min-h-[20px]'>/p</kbd> 
              {shortcutKey && (
                <> 或按下 <kbd className='inline-flex items-center justify-center ml-1 px-1.5 py-0.5 my-0.5 text-xs font-semibold bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 shadow-sm text-blue-600 dark:text-blue-400 min-h-[20px]'>{shortcutKey}</kbd></>
              )}
            </span>
          </div>
          
          {saveShortcutKey && (
            <div className='flex items-start mb-2'>
              <div className='flex-shrink-0 text-blue-500 dark:text-blue-400 mr-2 mt-1'>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className='text-xs text-gray-600 dark:text-gray-300 leading-relaxed'>
                快捷保存：选中文本后按下 <kbd className='inline-flex items-center justify-center px-1.5 py-0.5 my-0.5 text-xs font-semibold bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600 shadow-sm text-blue-600 dark:text-blue-400 min-h-[20px]'>{saveShortcutKey}</kbd> 即可保存提示词
              </span>
            </div>
          )}

          <div className='flex items-start mb-2'>
            <div className='flex-shrink-0 text-blue-500 dark:text-blue-400 mr-2 mt-1'>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <span className='text-xs text-gray-600 dark:text-gray-300 leading-relaxed'>
              右键保存：选中文本后单击右键菜单选择"保存该提示词"
            </span>
          </div>

          {showShortcutHelp && (
            <div className='mt-2 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-md border border-yellow-200 dark:border-yellow-800'>
              <div className='flex items-start'>
                <div className='flex-shrink-0 text-yellow-500 dark:text-yellow-400 mr-2 mt-1'>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <p className='text-xs text-yellow-700 dark:text-yellow-300 leading-relaxed mb-1'>
                    未检测到快捷键配置，可能是因为快捷键冲突。
                  </p>
                  <button 
                    onClick={openShortcutSettings}
                    className='text-xs bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-800 dark:hover:bg-yellow-700 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded-md transition-colors duration-200'
                  >
                    前往设置快捷键
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
