import { describe, expect, it } from 'vitest'
import {
  shouldOpenPromptSelector,
  shouldOpenPromptSelectorForInput,
} from '@/entrypoints/content/utils/promptTrigger'

const input = (isComposing: boolean): InputEvent =>
  new InputEvent('input', {
    bubbles: true,
    data: 'p',
    inputType: 'insertText',
    isComposing,
  })

describe('content prompt trigger', () => {
  it('does not open the selector for composing /p input', () => {
    expect(shouldOpenPromptSelectorForInput(input(true), '/p', '/', false)).toBe(false)
  })

  it('opens the selector for committed /p input', () => {
    expect(shouldOpenPromptSelectorForInput(input(false), '/p', '/', false)).toBe(true)
  })

  it('opens the selector after IME commit when the last tracked value was still /', () => {
    expect(shouldOpenPromptSelector('/p', '/', false)).toBe(true)
  })

  it('does not reopen for duplicate input or while the selector is open', () => {
    expect(shouldOpenPromptSelectorForInput(input(false), '/p', '/p', false)).toBe(false)
    expect(shouldOpenPromptSelectorForInput(input(false), '/p', '/', true)).toBe(false)
    expect(shouldOpenPromptSelector('/p', '/p', false)).toBe(false)
    expect(shouldOpenPromptSelector('/p', '/', true)).toBe(false)
  })
})
