import { afterEach, describe, expect, it, vi } from "vitest";

describe("contextMenuManager", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears existing context menus before registering fixed menu ids", async () => {
    let resolveRemoveAll: (() => void) | undefined;
    const removeAll = vi.fn(() => new Promise<void>((resolve) => {
      resolveRemoveAll = resolve;
    }));
    const create = vi.fn();

    vi.stubGlobal("browser", {
      contextMenus: {
        removeAll,
        create,
      },
    });

    const { createContextMenus } = await import("@/utils/browser/contextMenuManager");

    const registration = createContextMenus();

    expect(removeAll).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();

    resolveRemoveAll?.();
    await registration;

    expect(create).toHaveBeenCalledTimes(4);
    expect(create.mock.calls.map(([item]) => item.id)).toEqual([
      "open-options",
      "category-management",
      "open-sidepanel",
      "save-prompt",
    ]);
  });
});
