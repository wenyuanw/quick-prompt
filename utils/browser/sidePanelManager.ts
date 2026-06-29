/**
 * 侧边栏开关状态管理
 *
 * Chrome 没有原生的 sidePanel.toggle()，且 sidePanel.open() 必须在用户手势内同步调用
 * （手势标记约 1ms 就失效，open 之前不能有任何 await）。因此需要在后台维护"哪些窗口
 * 的侧边栏处于打开状态"，让快捷键能够可靠地切换开/关。
 *
 * 状态来源：
 *  - 侧边栏加载后通过长连接（port）上报 windowId（connect -> 标记打开，disconnect -> 标记关闭）。
 *  - 快捷键触发开/关时进行"乐观更新"，使下一次按键立即拿到正确状态，不受面板加载时机影响。
 *  - service worker 重启后通过 getContexts 兜底回填。
 */

const openWindows = new Set<number>()
const portsByWindow = new Map<number, Browser.runtime.Port>()

const refreshOpenStateFromContexts = async (): Promise<void> => {
  try {
    const anyRuntime = browser.runtime as any
    if (typeof anyRuntime.getContexts !== "function") return

    const contexts = await anyRuntime.getContexts({ contextTypes: ["SIDE_PANEL"] })
    if (!Array.isArray(contexts)) return

    for (const ctx of contexts) {
      if (typeof ctx?.windowId === "number" && ctx.windowId >= 0) {
        openWindows.add(ctx.windowId)
      }
    }
  } catch {
    /* 忽略：getContexts 不可用或字段缺失时，仍以端口上报为准 */
  }
}

export const setupSidePanelConnections = (): void => {
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== "sidepanel") return

    let windowId: number | undefined

    port.onMessage.addListener((message: any) => {
      if (message?.type === "init" && typeof message.windowId === "number") {
        const wid: number = message.windowId
        windowId = wid
        openWindows.add(wid)
        portsByWindow.set(wid, port)
      }
    })

    port.onDisconnect.addListener(() => {
      if (windowId != null) {
        openWindows.delete(windowId)
        if (portsByWindow.get(windowId) === port) {
          portsByWindow.delete(windowId)
        }
      }
    })
  })

  // service worker 重启后，端口重连前先兜底回填状态（异步，best-effort）
  void refreshOpenStateFromContexts()
}

export const isSidePanelOpen = (windowId: number): boolean => openWindows.has(windowId)

export const markSidePanelOpen = (windowId: number): void => {
  openWindows.add(windowId)
}

export const markSidePanelClosed = (windowId: number): void => {
  openWindows.delete(windowId)
}

/**
 * 通过长连接让指定窗口的侧边栏自行关闭（window.close()）。
 * 作为 sidePanel.close() 不可用时的回退方案。
 * @returns 是否成功向面板发送了关闭消息
 */
export const requestSidePanelClose = (windowId: number): boolean => {
  const port = portsByWindow.get(windowId)
  if (!port) return false

  try {
    port.postMessage({ action: "close" })
    return true
  } catch {
    portsByWindow.delete(windowId)
    return false
  }
}
