import { t } from '@/utils/i18n'
import {
  injectQuickPromptIntoElement,
  loadQuickInjectRuntimeConfig,
  type QuickInjectRuntimeConfig,
} from './quickInject'
import {
  createEditableAdapter,
  findEditableElement,
} from './editableTarget'
import { browser } from '#imports'

const BUTTON_HOST_ID = 'quick-prompt-quick-inject-host'

const createButtonStyles = (): string => `
  :host {
    all: initial;
  }

  .qp-quick-inject-btn {
    position: fixed;
    z-index: 2147483646;
    display: none;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    margin: 0;
    border: 1px solid rgba(15, 23, 42, 0.12);
    border-radius: 8px;
    background: #ffffff;
    color: #0f172a;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.14);
    cursor: pointer;
    transition: transform 120ms ease, background-color 120ms ease, box-shadow 120ms ease;
  }

  .qp-quick-inject-btn:hover {
    transform: translateY(-1px);
    background: #f8fafc;
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.18);
  }

  .qp-quick-inject-btn:focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: 2px;
  }

  .qp-quick-inject-btn[data-theme="dark"] {
    border-color: rgba(148, 163, 184, 0.35);
    background: #0f172a;
    color: #e2e8f0;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  }

  .qp-quick-inject-btn[data-theme="dark"]:hover {
    background: #1e293b;
  }

  .qp-quick-inject-btn svg {
    width: 14px;
    height: 14px;
    pointer-events: none;
  }
`

const boltIconSvg = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z"></path>
  </svg>
`

export class QuickInjectController {
  private config: QuickInjectRuntimeConfig = {
    enabled: false,
    onFocus: false,
    mode: 'overwrite',
    rule: null,
  }

  private host: HTMLElement | null = null
  private button: HTMLButtonElement | null = null
  private activeElement: HTMLElement | null = null
  private hideTimer: number | null = null
  private autoInjectedElements = new WeakSet<HTMLElement>()
  private disposed = false

  async start(): Promise<void> {
    await this.refreshConfig()
    this.ensureButton()
    this.bindEvents()
  }

  dispose(): void {
    this.disposed = true
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
    this.host?.remove()
    this.host = null
    this.button = null
    this.activeElement = null
  }

  private async refreshConfig(): Promise<void> {
    this.config = await loadQuickInjectRuntimeConfig()
    if (!this.config.enabled) {
      this.hideButton()
      this.activeElement = null
    }
  }

  private ensureButton(): void {
    if (this.host && this.button) {
      return
    }

    const existing = document.getElementById(BUTTON_HOST_ID)
    if (existing) {
      existing.remove()
    }

    const host = document.createElement('div')
    host.id = BUTTON_HOST_ID
    host.style.all = 'initial'
    host.style.position = 'fixed'
    host.style.zIndex = '2147483646'
    host.style.top = '0'
    host.style.left = '0'
    host.style.width = '0'
    host.style.height = '0'
    host.style.pointerEvents = 'none'

    const shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = createButtonStyles()

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'qp-quick-inject-btn'
    button.setAttribute('aria-label', t('quickInjectButtonLabel'))
    button.title = t('quickInjectButtonLabel')
    button.innerHTML = boltIconSvg
    button.style.pointerEvents = 'auto'

    button.addEventListener('pointerdown', (event) => {
      // Keep the editable focused so click injection targets the right field.
      event.preventDefault()
      event.stopPropagation()
    })

    button.addEventListener('click', async (event) => {
      event.preventDefault()
      event.stopPropagation()
      await this.handleButtonClick()
    })

    shadow.append(style, button)
    document.documentElement.appendChild(host)

    this.host = host
    this.button = button
  }

  private bindEvents(): void {
    document.addEventListener('focusin', this.handleFocusIn, true)
    document.addEventListener('focusout', this.handleFocusOut, true)
    window.addEventListener('scroll', this.handleReposition, true)
    window.addEventListener('resize', this.handleReposition)

    browser.storage.onChanged.addListener((changes, areaName) => {
      if (this.disposed) {
        return
      }
      if (areaName === 'sync' && changes.globalSettings) {
        void this.refreshConfig().then(() => {
          if (this.activeElement?.isConnected && this.config.enabled) {
            this.showButtonFor(this.activeElement)
            void this.maybeAutoInject(this.activeElement)
          }
        })
      }
    })
  }

  private handleFocusIn = (event: FocusEvent): void => {
    if (!this.config.enabled || !this.config.rule) {
      return
    }

    const editable = findEditableElement(event.target)
    if (!editable) {
      return
    }

    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer)
      this.hideTimer = null
    }

    this.activeElement = editable
    this.showButtonFor(editable)
    void this.maybeAutoInject(editable)
  }

  private handleFocusOut = (): void => {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer)
    }

    this.hideTimer = window.setTimeout(() => {
      const active = document.activeElement
      if (this.button && (active === this.button || this.host?.contains(active))) {
        return
      }
      this.hideButton()
    }, 150)
  }

  private handleReposition = (): void => {
    if (this.activeElement?.isConnected && this.config.enabled) {
      this.showButtonFor(this.activeElement)
    }
  }

  private showButtonFor(element: HTMLElement): void {
    this.ensureButton()
    if (!this.button || !this.config.enabled) {
      return
    }

    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      this.hideButton()
      return
    }

    const top = Math.max(8, rect.top + 6)
    const left = Math.min(
      window.innerWidth - 36,
      Math.max(8, rect.right - 34)
    )

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    this.button.dataset.theme = prefersDark ? 'dark' : 'light'
    this.button.style.top = `${top}px`
    this.button.style.left = `${left}px`
    this.button.style.display = 'inline-flex'
  }

  private hideButton(): void {
    if (this.button) {
      this.button.style.display = 'none'
    }
  }

  private async maybeAutoInject(element: HTMLElement): Promise<void> {
    if (!this.config.enabled || !this.config.onFocus || !this.config.rule) {
      return
    }

    if (this.autoInjectedElements.has(element)) {
      return
    }

    const adapter = createEditableAdapter(element)
    if (adapter.value.trim() !== '') {
      return
    }

    const injected = await injectQuickPromptIntoElement(element, {
      promptId: this.config.rule.promptId,
      mode: this.config.mode,
      onlyIfEmpty: true,
    })

    if (injected) {
      this.autoInjectedElements.add(element)
    }
  }

  private async handleButtonClick(): Promise<void> {
    if (!this.config.enabled || !this.config.rule || !this.activeElement?.isConnected) {
      return
    }

    const injected = await injectQuickPromptIntoElement(this.activeElement, {
      promptId: this.config.rule.promptId,
      mode: this.config.mode,
      onlyIfEmpty: false,
    })

    if (injected) {
      this.autoInjectedElements.add(this.activeElement)
      this.activeElement.focus()
      this.showButtonFor(this.activeElement)
    }
  }
}

export const startQuickInjectController = async (): Promise<QuickInjectController> => {
  const controller = new QuickInjectController()
  await controller.start()
  return controller
}
