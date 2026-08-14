import {
  findQuickInjectRule,
  getGlobalSettings,
  type GlobalSettings,
  type QuickInjectDomainRule,
  type QuickInjectMode,
} from '@/utils/globalSettings'
import { getAllPrompts } from '@/utils/promptStore'
import { extractVariables, replaceVariables } from '@/utils/variableParser'
import type { EditableElement } from '@/utils/types'
import {
  applyContentToEditable,
  createEditableAdapter,
  type ContentApplyMode,
} from './editableTarget'

export interface QuickInjectRuntimeConfig {
  enabled: boolean
  onFocus: boolean
  mode: QuickInjectMode
  rule: QuickInjectDomainRule | null
}

export const isEditableValueEmpty = (value: string): boolean => value.trim() === ''

export const resolvePromptContentWithEmptyVariables = (content: string): string => {
  const variables = extractVariables(content)
  if (variables.length === 0) {
    return content
  }

  const emptyValues = Object.fromEntries(variables.map((name) => [name, '']))
  return replaceVariables(content, emptyValues)
}

export const loadQuickInjectRuntimeConfig = async (
  hostname: string = window.location.hostname
): Promise<QuickInjectRuntimeConfig> => {
  const settings = await getGlobalSettings()
  return buildQuickInjectRuntimeConfig(settings, hostname)
}

export const buildQuickInjectRuntimeConfig = (
  settings: GlobalSettings,
  hostname: string
): QuickInjectRuntimeConfig => {
  const rule = settings.quickInjectEnabled
    ? findQuickInjectRule(settings.quickInjectRules, hostname)
    : null

  return {
    enabled: Boolean(settings.quickInjectEnabled && rule),
    onFocus: Boolean(settings.quickInjectOnFocus),
    mode: settings.quickInjectMode,
    rule,
  }
}

export const resolveQuickInjectContent = async (
  promptId: string
): Promise<string | null> => {
  const prompts = await getAllPrompts()
  const prompt = prompts.find((item) => item.id === promptId && item.enabled !== false)
  if (!prompt) {
    return null
  }

  return resolvePromptContentWithEmptyVariables(prompt.content)
}

export const injectQuickPromptIntoEditable = async (
  target: EditableElement,
  options: {
    promptId: string
    mode: ContentApplyMode
    onlyIfEmpty?: boolean
  }
): Promise<boolean> => {
  if (options.onlyIfEmpty && !isEditableValueEmpty(target.value)) {
    return false
  }

  const content = await resolveQuickInjectContent(options.promptId)
  if (content === null) {
    return false
  }

  applyContentToEditable(target, content, options.mode)
  return true
}

export const injectQuickPromptIntoElement = async (
  element: HTMLElement,
  options: {
    promptId: string
    mode: ContentApplyMode
    onlyIfEmpty?: boolean
  }
): Promise<boolean> => {
  const adapter = createEditableAdapter(
    element as HTMLInputElement | HTMLTextAreaElement | HTMLElement
  )
  return injectQuickPromptIntoEditable(adapter, options)
}
