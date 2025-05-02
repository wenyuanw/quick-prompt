import { useState, useEffect } from 'react'
import Logo from '~/assets/icon.png'
import './App.css'
import '~/assets/tailwind.css'

function App() {
  const [promptCount, setPromptCount] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // 加载提示数量
  const loadPromptCount = async () => {
    try {
      setLoading(true)

      // 直接从本地存储获取数据
      try {
        const result = await browser.storage.local.get('userPrompts')
        const prompts = result.userPrompts || []

        if (Array.isArray(prompts)) {
          setPromptCount(prompts.length)
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

  // 首次加载
  useEffect(() => {
    loadPromptCount()

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

  return (
    <div className='p-4 w-full max-w-[300px] min-w-[250px] box-border bg-white text-gray-900 dark:bg-gray-900 dark:text-white transition-colors duration-200'>
      {/* 标题区域 */}
      <div className='flex justify-center items-center mb-3'>
        <img src={Logo} className='h-8 mr-2' alt='quick prompt logo' />
        <h1 className='text-lg font-bold whitespace-nowrap m-0 p-0 leading-normal dark:text-white'>
          快捷Prompt助手
        </h1>
      </div>

      {/* 统计卡片 */}
      <div className='rounded-lg shadow p-3 mb-3 relative bg-white dark:bg-gray-800 transition-colors duration-200'>
        <div className='flex justify-between items-center mb-2'>
          <h2 className='text-base font-semibold m-0 text-gray-700 dark:text-gray-200'>提示统计</h2>

          <button
            onClick={loadPromptCount}
            disabled={loading}
            title='刷新提示数量'
            className='bg-transparent border-none text-gray-500 cursor-pointer dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className={loading ? 'animate-spin w-4 h-4' : 'w-4 h-4'}
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
              />
            </svg>
          </button>
        </div>

        {/* 设置固定高度容器，防止状态切换时闪烁 */}
        <div className='h-16 flex items-center justify-center'>
          {loading ? (
            // 骨架屏加载状态
            <div className='text-center w-full'>
              <div className='h-8 flex justify-center items-center'>
                <div className='w-10 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse'></div>
              </div>
              <div className='h-4 mt-1 flex justify-center items-center'>
                <div className='w-20 h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse'></div>
              </div>
            </div>
          ) : error ? (
            <div className='text-red-500 text-center text-sm dark:text-red-400'>{error}</div>
          ) : (
            <div className='text-center'>
              <span className='text-2xl font-bold text-blue-600 dark:text-blue-400'>
                {promptCount}
              </span>
              <p className='text-gray-500 text-sm mt-1 mb-0 dark:text-gray-400'>个可用提示</p>
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
          管理我的提示
        </button>

        <div className='text-center text-xs text-gray-500 mt-3 dark:text-gray-400'>
          使用 <span className='text-blue-600 dark:text-blue-400'>/p</span> 快速插入提示
        </div>
      </div>
    </div>
  )
}

export default App
