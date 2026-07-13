export const endsWithPromptTrigger = (value: string): boolean =>
  value.toLowerCase().endsWith('/p')

export const shouldOpenPromptSelector = (
  value: string,
  lastValue: string,
  isPromptSelectorOpen: boolean
): boolean =>
  endsWithPromptTrigger(value) &&
  lastValue !== value &&
  !isPromptSelectorOpen

export const shouldOpenPromptSelectorForInput = (
  event: InputEvent,
  value: string,
  lastValue: string,
  isPromptSelectorOpen: boolean
): boolean =>
  !event.isComposing &&
  shouldOpenPromptSelector(value, lastValue, isPromptSelectorOpen)
