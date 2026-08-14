import { describe, expect, it } from 'vitest'
import { buildAppliedContent } from '@/entrypoints/content/utils/editableTarget'
import {
  buildQuickInjectRuntimeConfig,
  isEditableValueEmpty,
  resolvePromptContentWithEmptyVariables,
} from '@/entrypoints/content/utils/quickInject'
import {
  findQuickInjectRule,
  normalizeHostname,
  type GlobalSettings,
} from '@/utils/globalSettings'

describe('quickInject helpers', () => {
  it('normalizes hostnames by lowercasing and stripping www', () => {
    expect(normalizeHostname('WWW.Example.COM')).toBe('example.com')
    expect(normalizeHostname('chat.openai.com')).toBe('chat.openai.com')
    expect(normalizeHostname('https://www.claude.ai/chat')).toBe('claude.ai')
    expect(normalizeHostname('example.com:443')).toBe('example.com')
  })

  it('finds domain rules with normalized hostnames', () => {
    const rule = findQuickInjectRule(
      [{ domain: 'claude.ai', promptId: 'p1' }],
      'www.claude.ai'
    )
    expect(rule).toEqual({ domain: 'claude.ai', promptId: 'p1' })
  })

  it('replaces variables with empty strings', () => {
    expect(resolvePromptContentWithEmptyVariables('Hello {{name}}, {{role}}')).toBe('Hello , ')
    expect(resolvePromptContentWithEmptyVariables('No vars')).toBe('No vars')
  })

  it('detects empty editable values', () => {
    expect(isEditableValueEmpty('')).toBe(true)
    expect(isEditableValueEmpty('   ')).toBe(true)
    expect(isEditableValueEmpty('hi')).toBe(false)
  })

  it('builds runtime config only when enabled and domain matches', () => {
    const settings: GlobalSettings = {
      closeModalOnOutsideClick: true,
      quickInjectEnabled: true,
      quickInjectOnFocus: true,
      quickInjectMode: 'append',
      quickInjectRules: [{ domain: 'example.com', promptId: 'prompt-1' }],
    }

    expect(buildQuickInjectRuntimeConfig(settings, 'www.example.com')).toEqual({
      enabled: true,
      onFocus: true,
      mode: 'append',
      rule: { domain: 'example.com', promptId: 'prompt-1' },
    })

    expect(buildQuickInjectRuntimeConfig(settings, 'other.com').enabled).toBe(false)

    expect(
      buildQuickInjectRuntimeConfig(
        { ...settings, quickInjectEnabled: false },
        'example.com'
      ).enabled
    ).toBe(false)
  })

  it('builds overwrite and append content', () => {
    expect(buildAppliedContent('old', 'new', 'overwrite')).toBe('new')
    expect(buildAppliedContent('', 'new', 'append')).toBe('new')
    expect(buildAppliedContent('old', 'new', 'append')).toBe('old\nnew')
    expect(buildAppliedContent('old\n', 'new', 'append')).toBe('old\nnew')
  })
})
