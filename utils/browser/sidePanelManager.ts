// 跟踪各窗口侧边栏的打开状态，用于快捷键「切换」开关。
//
// 侧边栏挂载时会通过 runtime.connect 建立一个长连接（port），并上报自身 windowId。
// 长连接在侧边栏打开期间保持，断开（关闭侧边栏）时自动清理。
// 这样后台可以「同步」判断侧边栏是否打开，避免在响应快捷键时使用异步状态查询而消耗用户手势
//（chrome.sidePanel.open() 必须在用户手势中调用）。

const SIDE_PANEL_PORT_NAME = "sidepanel"

const openWindows = new Set<number>()
const portsByWindow = new Map<number, Browser.runtime.Port>()

export const setupSidePanelConnections = (): void => {
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== SIDE_PANEL_PORT_NAME) return

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
}

export const isSidePanelOpen = (windowId: number): boolean => openWindows.has(windowId)

export const closeSidePanelForWindow = (windowId: number): void => {
  const anyBrowser = browser as any

  // 优先使用官方 close()（Chrome 141+，无需用户手势）
  if (anyBrowser.sidePanel?.close) {
    anyBrowser.sidePanel.close({ windowId }).catch(() => {
      // 回退：让侧边栏页面自行 window.close()
      portsByWindow.get(windowId)?.postMessage({ action: "close" })
    })
    return
  }

  // 旧版 Chrome 无 close()：通过 port 通知侧边栏自行关闭
  portsByWindow.get(windowId)?.postMessage({ action: "close" })

  // Firefox 兜底
  anyBrowser.sidebarAction?.close?.()
}
