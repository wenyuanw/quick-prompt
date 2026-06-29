import { useState, useEffect } from 'react'
import { motion } from "framer-motion"
import {
  AlertTriangle,
  ArrowRight,
  Command,
  FileText,
  FolderPlus,
  Library,
  MousePointer2,
  PanelRight,
  Settings2,
  Sparkles,
} from "lucide-react"
import Logo from '~/assets/icon.png'
import '~/assets/tailwind.css'
import { t, initLocale } from '@/utils/i18n'
import { getAllPrompts } from '@/utils/promptStore'
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

function App() {
  const [promptCount, setPromptCount] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [shortcutKey, setShortcutKey] = useState<string>('')
  const [saveShortcutKey, setSaveShortcutKey] = useState<string>('')
  const [sidePanelShortcutKey, setSidePanelShortcutKey] = useState<string>('')
  const [shortcutSettingsUrl, setShortcutSettingsUrl] = useState<string>('')
  const [showShortcutHelp, setShowShortcutHelp] = useState<boolean>(false)

  // 加载提示数量
  const loadPromptCount = async () => {
    try {
      setLoading(true)

      // 直接从本地存储获取数据
      try {
        const allPrompts = await getAllPrompts()

        if (Array.isArray(allPrompts)) {
          // 只计算启用的提示词数量
          const enabledPrompts = allPrompts.filter((prompt: any) => prompt.enabled !== false)
          setPromptCount(enabledPrompts.length)

          console.log(t('popupPromptsInfo', [allPrompts.length.toString(), enabledPrompts.length.toString()]))
        } else {
          setPromptCount(0)
        }
      } catch (storageErr) {
        console.error('弹出窗口：直接读取storage失败', storageErr)
        setError(t('errorCannotReadStorage'))
        setPromptCount(0)
      }
    } catch (err) {
      console.error('弹出窗口：加载提示数量出错', err)
      setError(t('errorCannotLoadPrompts'))
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
      
      // 检查用户是否已选择不再提醒
      const reminderSettings = await browser.storage.local.get('shortcut_reminder_dismissed')
      const isReminderDismissed = reminderSettings.shortcut_reminder_dismissed === true
      
      // 从浏览器API获取真实配置的快捷键
      const commands = await browser.commands.getAll()
      const commandMap = {
        prompt: commands.find(cmd => cmd.name === 'open-prompt-selector'),
        save: commands.find(cmd => cmd.name === 'save-selected-prompt'),
        sidePanel: commands.find(cmd => cmd.name === 'open-side-panel')
      }
      
      // 提取快捷键字符串
      const shortcuts = {
        prompt: commandMap.prompt?.shortcut || '',
        save: commandMap.save?.shortcut || '',
        sidePanel: commandMap.sidePanel?.shortcut || ''
      }
      
      // 更新状态
      setShortcutKey(shortcuts.prompt)
      setSaveShortcutKey(shortcuts.save)
      setSidePanelShortcutKey(shortcuts.sidePanel)
      
      // 判断是否显示帮助信息：当任一快捷键未设置且用户未选择不再提醒时显示
      const hasAllShortcuts = shortcuts.prompt && shortcuts.save
      setShowShortcutHelp(!hasAllShortcuts && !isReminderDismissed)
      
    } catch (err) {
      console.error('获取快捷键设置失败', err)
      
      // 检查用户是否已选择不再提醒
      try {
        const reminderSettings = await browser.storage.local.get('shortcut_reminder_dismissed')
        const isReminderDismissed = reminderSettings.shortcut_reminder_dismissed === true
        
        // 出错时提示用户进入快捷键设置页面（如果用户未选择不再提醒）
        const isFirefox = navigator.userAgent.includes('Firefox')
        if (isFirefox) {
          setShortcutSettingsUrl('about:addons')
        } else {
          setShortcutSettingsUrl('chrome://extensions/shortcuts')
        }
        setShortcutKey('')
        setSaveShortcutKey('')
        setShowShortcutHelp(!isReminderDismissed)
      } catch (storageErr) {
        console.error('检查提醒设置失败', storageErr)
        // 如果连存储都访问不了，还是显示提醒
        setShowShortcutHelp(true)
      }
    }
  }

  // 首次加载
  useEffect(() => {
    (async () => {
      await initLocale()
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

      // Store cleanup ref for later
      ;(window as any).__darkModeCleanup = () => {
        darkModeMediaQuery.removeEventListener('change', listener)
      }
    })()

    return () => {
      ;(window as any).__darkModeCleanup?.()
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

  // 打开侧边栏（Chrome 使用 sidePanel，Firefox 使用 sidebarAction）
  const openSidePanel = async () => {
    const anyBrowser = browser as any
    try {
      if (anyBrowser.sidePanel?.open) {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
        if (tab?.windowId != null) {
          await anyBrowser.sidePanel.open({ windowId: tab.windowId })
        }
      } else if (anyBrowser.sidebarAction?.toggle) {
        await anyBrowser.sidebarAction.toggle()
      }
      window.close()
    } catch (err) {
      console.error('弹出窗口：打开侧边栏出错', err)
    }
  }

  // 打开快捷键设置页面
  const openShortcutSettings = () => {
    // 对于Firefox，直接打开about:addons后需要用户进一步操作
    if (navigator.userAgent.includes('Firefox')) {
      // 显示额外提示
      alert(t('firefoxShortcutHelp'))
    }
    
    // 尝试打开设置页面
    try {
      browser.tabs.create({ url: shortcutSettingsUrl })
      window.close()
    } catch (err) {
      console.error('打开快捷键设置页面失败', err)
    }
  }

  // 不再提醒快捷键设置问题
  const dismissShortcutReminder = async () => {
    try {
      await browser.storage.local.set({
        'shortcut_reminder_dismissed': true,
        'shortcut_reminder_dismissed_at': Date.now()
      })
      setShowShortcutHelp(false)
      console.log(t('popupShortcutReminderSet'))
    } catch (error) {
      console.error('弹出窗口: 设置不再提醒时出错:', error)
    }
  }

  return (
    <motion.main
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="w-[360px] min-w-[320px] max-w-[420px] bg-background p-4 text-foreground"
    >
      <div className="mb-4 flex items-center gap-3">
        <img src={Logo} className="size-10" alt="quick prompt logo" />
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight">Quick Prompt</h1>
          <p className="text-xs text-muted-foreground">{t("usage")}</p>
        </div>
        <Badge variant="muted" className="ml-auto gap-1">
          <Sparkles className="size-3" />
          /p
        </Badge>
      </div>

      <Card className="mb-3 overflow-hidden">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Library className="size-4 text-primary" />
            {t("promptLibrary")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex h-16 items-center justify-center rounded-2xl bg-muted/60">
            {loading ? (
              <div className="w-full space-y-2 px-10">
                <Skeleton className="mx-auto h-6 w-12" />
                <Skeleton className="mx-auto h-3 w-24" />
              </div>
            ) : error ? (
              <p className="px-4 text-center text-xs text-destructive">{error}</p>
            ) : (
              <div className="flex items-end justify-center gap-2">
                <span className="text-3xl font-semibold leading-none text-primary">
                  {promptCount}
                </span>
                <span className="pb-0.5 text-xs text-muted-foreground">
                  {t("availablePrompts")}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Button onClick={openSidePanel} variant="soft" className="mb-2 w-full justify-between">
        <span className="inline-flex items-center gap-2">
          <PanelRight className="size-4" />
          {t("openSidePanel")}
        </span>
        {sidePanelShortcutKey ? (
          <KeyBadge>{sidePanelShortcutKey}</KeyBadge>
        ) : (
          <ArrowRight className="size-4" />
        )}
      </Button>

      <Button onClick={openOptionsPage} className="mb-3 w-full justify-between">
        <span className="inline-flex items-center gap-2">
          <Settings2 className="size-4" />
          {t("managePrompts")}
        </span>
        <ArrowRight className="size-4" />
      </Button>

      <Card>
        <CardContent className="space-y-3 p-4">
          <UsageRow icon={MousePointer2}>
            {t("quickInput")} <KeyBadge>/p</KeyBadge>
            {shortcutKey && (
              <> {t("orPress")} <KeyBadge>{shortcutKey}</KeyBadge></>
            )}
          </UsageRow>

          {saveShortcutKey && (
            <UsageRow icon={FileText}>
              {t("quickSave")} <KeyBadge>{saveShortcutKey}</KeyBadge> {t("savePrompt")}
            </UsageRow>
          )}

          <UsageRow icon={FolderPlus}>{t("rightClickSave")}</UsageRow>

          {showShortcutHelp && (
            <Alert variant="warning" className="rounded-xl">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                <p className="mb-2 text-xs leading-5">{t("shortcutNotConfigured")}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={openShortcutSettings}>
                    <Command className="size-3.5" />
                    {t("configureShortcut")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={dismissShortcutReminder}
                    title={t("dismissReminderTitle")}
                  >
                    {t("noReminder")}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </motion.main>
  )
}

const KeyBadge = ({ children }: { children: React.ReactNode }) => (
  <kbd className="mx-0.5 inline-flex min-h-5 items-center rounded-md border border-border bg-background px-1.5 text-[11px] font-semibold text-primary shadow-sm">
    {children}
  </kbd>
)

const UsageRow = ({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) => (
  <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
    <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
    <span>{children}</span>
  </div>
)

export default App
