export const shouldOpenPromptSelectorForInput = (
  event: InputEvent,
  value: string,
  lastValue: string,
  isPromptSelectorOpen: boolean
): boolean =>
  !event.isComposing &&
  value.toLowerCase().endsWith('/p') &&
  lastValue !== value &&
  !isPromptSelectorOpen
