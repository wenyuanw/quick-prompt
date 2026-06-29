import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  ClipboardCopy,
  CornerDownLeft,
  SearchX,
  Settings2,
  X,
} from "lucide-react"
import "~/assets/tailwind.css"
import "./style.css"
import { t, initLocale } from "@/utils/i18n"
import { getAllPrompts } from "@/utils/promptStore"
import { getCategories, migratePromptsWithCategory } from "@/utils/categoryUtils"
import { filterAndSortPrompts } from "@/utils/promptFilter"
import { extractVariables, replaceVariables } from "@/utils/variableParser"
import type { Category, PromptItemWithVariables } from "@/utils/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Toaster } from "@/components/ui/sonner"
import { toast } from "sonner"

type ActionMode = "copy" | "insert"

interface PendingAction {
  prompt: PromptItemWithVariables
  mode: ActionMode
}

const countPromptCharacters = (content: string): number =>
  Array.from(content.replace(/\s/g, "")).length

function App() {
  const [prompts, setPrompts] = useState<PromptItemWithVariables[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [categoriesMap, setCategoriesMap] = useState<Record<string, Category>>({})
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [localeRevision, setLocaleRevision] = useState(0)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadData = useCallback(async () => {
    try {
      await migratePromptsWithCategory()
      const [allPrompts, allCategories] = await Promise.all([
        getAllPrompts(),
        getCategories(),
      ])

      const enabledPrompts: PromptItemWithVariables[] = allPrompts
        .filter((prompt) => prompt.enabled !== false)
        .map((prompt) => ({
          ...prompt,
          _variables: extractVariables(prompt.content),
        }))
      setPrompts(enabledPrompts)

      setCategories(allCategories.filter((cat) => cat.enabled))
      const map: Record<string, Category> = {}
      allCategories.forEach((cat) => {
        map[cat.id] = cat
      })
      setCategoriesMap(map)
    } catch (error) {
      console.error("侧边栏: 加载数据失败", error)
    } finally {
      setLoading(false)
    }
  }, [])

  // 初始化：语言、主题、数据
  useEffect(() => {
    const applySystemTheme = () => {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      document.documentElement.classList.toggle("dark", isDark)
    }

    ;(async () => {
      await initLocale()
      setLocaleRevision((r) => r + 1)
      applySystemTheme()
      await loadData()
    })()

    const darkModeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const themeListener = () => applySystemTheme()
    darkModeMediaQuery.addEventListener("change", themeListener)

    const handleLocaleChange = () => setLocaleRevision((r) => r + 1)
    globalThis.addEventListener("quick-prompt-locale-change", handleLocaleChange)

    return () => {
      darkModeMediaQuery.removeEventListener("change", themeListener)
      globalThis.removeEventListener("quick-prompt-locale-change", handleLocaleChange)
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    }
  }, [loadData])

  // 监听存储变化，实时刷新列表
  useEffect(() => {
    const handleStorageChange = (
      changes: Record<string, unknown>,
      areaName: string
    ) => {
      if (areaName !== "local") return
      const relevant = Object.keys(changes).some(
        (key) => key.startsWith("userPrompts") || key === "userCategories"
      )
      if (relevant) {
        loadData()
      }
    }

    browser.storage.onChanged.addListener(handleStorageChange)
    return () => browser.storage.onChanged.removeListener(handleStorageChange)
  }, [loadData])

  // 与后台建立长连接，上报自身 windowId，使快捷键能够「切换」开关侧边栏。
  // 后台可据此关闭本侧边栏（或通过 'close' 消息让其自行 window.close()）。
  useEffect(() => {
    let port: Browser.runtime.Port | null = null
    let disposed = false

    const connect = async () => {
      let windowId: number | undefined
      try {
        const win = await (browser as any).windows?.getCurrent?.()
        windowId = win?.id
      } catch {
        /* 忽略：拿不到 windowId 时仍连接，只是无法被精确定位关闭 */
      }
      if (disposed) return

      port = browser.runtime.connect({ name: "sidepanel" })
      port.onMessage.addListener((message: any) => {
        if (message?.action === "close") {
          window.close()
        }
      })
      // 若后台 service worker 被回收导致连接断开，重连以重新登记状态
      port.onDisconnect.addListener(() => {
        port = null
        if (!disposed) setTimeout(connect, 500)
      })
      port.postMessage({ type: "init", windowId })
    }

    connect()

    return () => {
      disposed = true
      try {
        port?.disconnect()
      } catch {
        /* noop */
      }
    }
  }, [])

  const filteredPrompts = useMemo(
    () =>
      filterAndSortPrompts(prompts, {
        searchTerm,
        categoryId: selectedCategoryId,
      }),
    [prompts, searchTerm, selectedCategoryId]
  )

  const flashCopied = (id: string) => {
    setCopiedId(id)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopiedId(null), 2000)
  }

  const performCopy = async (content: string, promptId: string) => {
    try {
      await navigator.clipboard.writeText(content)
      flashCopied(promptId)
      toast.success(t("sidePanelCopied"))
    } catch (error) {
      console.error("侧边栏: 复制失败", error)
      toast.error(t("copyFailed"))
    }
  }

  const performInsert = async (content: string, promptId: string) => {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true })
      const tabId = tabs[0]?.id
      if (tabId == null) {
        await fallbackCopy(content, promptId, "sidePanelInsertFailed")
        return
      }

      const response = await browser.tabs
        .sendMessage(tabId, { action: "insertPrompt", content })
        .catch(() => null)

      if (response && response.success) {
        toast.success(t("sidePanelInsertSuccess"))
      } else if (response && response.error === "noFocusedInput") {
        await fallbackCopy(content, promptId, "sidePanelInsertNoInput")
      } else {
        await fallbackCopy(content, promptId, "sidePanelInsertFailed")
      }
    } catch (error) {
      console.error("侧边栏: 插入失败", error)
      await fallbackCopy(content, promptId, "sidePanelInsertFailed")
    }
  }

  const fallbackCopy = async (
    content: string,
    promptId: string,
    messageKey: string
  ) => {
    try {
      await navigator.clipboard.writeText(content)
      flashCopied(promptId)
    } catch {
      /* 忽略复制失败 */
    }
    toast.warning(t(messageKey))
  }

  const runAction = (content: string, action: PendingAction) => {
    if (action.mode === "copy") {
      performCopy(content, action.prompt.id)
    } else {
      performInsert(content, action.prompt.id)
    }
  }

  const handleAction = (prompt: PromptItemWithVariables, mode: ActionMode) => {
    const variables = prompt._variables ?? extractVariables(prompt.content)
    if (variables.length > 0) {
      setPendingAction({ prompt, mode })
      return
    }
    runAction(prompt.content, { prompt, mode })
  }

  const handleVariableSubmit = (content: string) => {
    if (pendingAction) {
      runAction(content, pendingAction)
    }
    setPendingAction(null)
  }

  const openOptionsPage = () => {
    browser.runtime.sendMessage({ action: "openOptionsPage" }).catch(() => {
      browser.runtime.openOptionsPage()
    })
  }

  void localeRevision

  return (
    <div className="flex h-screen min-w-[280px] flex-col bg-background text-foreground">
      <div className="space-y-2 px-3 pt-3 pb-2.5">
        <Input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t("searchKeywordPlaceholder")}
          className="h-9"
        />
        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <CategoryChip
            label={t("allCategories")}
            active={selectedCategoryId === null}
            onClick={() => setSelectedCategoryId(null)}
          />
          {categories.map((category) => (
            <CategoryChip
              key={category.id}
              label={category.name}
              color={category.color}
              active={selectedCategoryId === category.id}
              onClick={() => setSelectedCategoryId(category.id)}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {loading ? (
          <div className="px-2 py-10 text-center text-xs text-muted-foreground">
            {t("loading")}
          </div>
        ) : filteredPrompts.length > 0 ? (
          <ul className="space-y-2">
            {filteredPrompts.map((prompt) => {
              const category = categoriesMap[prompt.categoryId]
              const charCount = countPromptCharacters(prompt.content || "")
              const hasVariables = (prompt._variables ?? []).length > 0
              return (
                <li
                  key={prompt.id}
                  className="group rounded-xl border border-border bg-card p-2.5 shadow-sm transition-colors hover:border-primary/40"
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <h3 className="min-w-0 flex-1 truncate text-sm font-medium">
                      {prompt.title}
                    </h3>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={t("copyPrompt")}
                        aria-label={t("copyPrompt")}
                        onClick={() => handleAction(prompt, "copy")}
                      >
                        {copiedId === prompt.id ? (
                          <Check className="size-4 text-emerald-500" />
                        ) : (
                          <ClipboardCopy className="size-4" />
                        )}
                      </Button>
                      <Button
                        variant="soft"
                        size="icon-sm"
                        title={t("sidePanelInsert")}
                        aria-label={t("sidePanelInsert")}
                        onClick={() => handleAction(prompt, "insert")}
                      >
                        <CornerDownLeft className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="line-clamp-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    {prompt.content}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    {category && (
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: category.color || "#6366f1" }}
                        />
                        {category.name}
                      </span>
                    )}
                    <span>{t("promptCharacterCountValue", [charCount.toString()])}</span>
                    {hasVariables && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {"{{ }}"}
                      </span>
                    )}
                    {prompt.tags.length > 0 && (
                      <span className="flex flex-wrap gap-1">
                        {prompt.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-muted px-1.5 py-0.5 text-[10px]"
                          >
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
            <SearchX className="size-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              {searchTerm || selectedCategoryId
                ? t("noMatchingPrompts")
                : t("noAvailablePrompts")}
            </p>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>{t("totalPrompts2", [filteredPrompts.length.toString()])}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={openOptionsPage}
          title={t("managePrompts")}
          className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground"
        >
          <Settings2 className="size-3.5" />
          {t("managePrompts")}
        </Button>
      </footer>

      {pendingAction && (
        <VariableForm
          prompt={pendingAction.prompt}
          mode={pendingAction.mode}
          onCancel={() => setPendingAction(null)}
          onSubmit={handleVariableSubmit}
        />
      )}

      <Toaster position="bottom-center" richColors />
    </div>
  )
}

const CategoryChip = ({
  label,
  color,
  active,
  onClick,
}: {
  label: string
  color?: string
  active: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs transition-colors ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-background text-muted-foreground hover:bg-accent"
    }`}
  >
    {color && (
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: color }}
      />
    )}
    {label}
  </button>
)

const VariableForm = ({
  prompt,
  mode,
  onCancel,
  onSubmit,
}: {
  prompt: PromptItemWithVariables
  mode: ActionMode
  onCancel: () => void
  onSubmit: (content: string) => void
}) => {
  const variables = useMemo(
    () => prompt._variables ?? extractVariables(prompt.content),
    [prompt]
  )
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(variables.map((v) => [v, ""]))
  )
  const firstInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => firstInputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onCancel()
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        onSubmit(replaceVariables(prompt.content, values))
      }
    }
    document.addEventListener("keydown", handleKeyDown, true)
    return () => document.removeEventListener("keydown", handleKeyDown, true)
  }, [onCancel, onSubmit, prompt.content, values])

  const previewParts = prompt.content.split(/(\{\{[^{}]+\}\})/g)

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <h2 className="truncate text-sm font-semibold">{t("fillVariableValues")}</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onCancel}
          aria-label={t("sidePanelCancel")}
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <p className="mb-1 text-sm font-medium">{prompt.title}</p>
        <p className="mb-3 text-xs text-muted-foreground">
          {t("pleaseEnterVariableValues")}
        </p>

        <div className="space-y-3">
          {variables.map((variable, index) => (
            <div key={variable} className="space-y-1">
              <label
                htmlFor={`var-${variable}`}
                className="block text-xs font-medium"
              >
                {variable}
              </label>
              <Textarea
                ref={index === 0 ? firstInputRef : undefined}
                id={`var-${variable}`}
                rows={2}
                className="min-h-[40px] text-sm"
                value={values[variable]}
                placeholder={t("enterVariableValue", [variable])}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [variable]: e.target.value }))
                }
              />
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-1.5 text-xs font-medium">{t("preview")}</p>
          <div className="whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-2.5 text-xs">
            {previewParts.map((part, index) => {
              const match = part.match(/^\{\{([^{}]+)\}\}$/)
              if (match) {
                const value = values[match[1]] || ""
                return (
                  <span
                    key={index}
                    className="rounded bg-primary/15 px-1 text-primary"
                  >
                    {value || `{{${match[1]}}}`}
                  </span>
                )
              }
              return <span key={index}>{part}</span>
            })}
          </div>
        </div>
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-border px-3 py-2.5">
        <Button variant="outline" size="sm" onClick={onCancel}>
          {t("sidePanelCancel")}
        </Button>
        <Button
          size="sm"
          onClick={() => onSubmit(replaceVariables(prompt.content, values))}
        >
          {mode === "insert" ? (
            <CornerDownLeft className="size-4" />
          ) : (
            <ClipboardCopy className="size-4" />
          )}
          {mode === "insert" ? t("sidePanelInsert") : t("copyPrompt")}
        </Button>
      </footer>
    </div>
  )
}

export default App
