import React from "react";
import { HashRouter, MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/utils/i18n", () => ({
  t: (key: string) => ({
    promptManagement: "Prompt management",
    promptManagementDescription: "Manage prompts",
    categoryManagement: "Category management",
    promptCategoryManagement: "Manage categories",
    globalSettings: "Global settings",
    globalSettingsDescription: "Manage global settings",
    quickInjectSection: "Quick Inject",
    quickInjectPageDescription: "Configure quick inject",
    gistSync: "Gist sync",
    notionSync: "Notion sync",
    webdavSync: "WebDAV sync",
    collapseSidebar: "Collapse sidebar",
    expandSidebar: "Expand sidebar",
    openMenu: "Open menu",
    closeMenu: "Close menu",
  }[key] ?? key),
}));

const { default: Sidebar } = await import("@/entrypoints/options/components/Sidebar");

describe("Sidebar", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, "", "/options.html");
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the collapse control as an icon button directly below global settings", () => {
    const { container } = render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    const collapseButton = screen.getByRole("button", { name: "Collapse sidebar" });
    const navItems = Array.from(container.querySelector("nav")?.children ?? []);

    expect(collapseButton.textContent).toBe("");
    expect(navItems).toHaveLength(5);
    expect(navItems[2]).toHaveTextContent("Global settings");
    expect(navItems[3]).toHaveTextContent("Quick Inject");
    expect(navItems[4]).toContainElement(collapseButton);
  });

  it.each([
    {
      name: "Quick Prompt logo",
      getLink: (container: HTMLElement) => container.querySelector('a[title="Quick Prompt"]') as HTMLAnchorElement,
      expectedHash: "",
    },
    {
      name: "Prompt management",
      getLink: () => screen.getByRole("link", { name: "Prompt management" }),
      expectedHash: "",
    },
    {
      name: "Category management",
      getLink: () => screen.getByRole("link", { name: "Category management" }),
      expectedHash: "#/categories",
    },
    {
      name: "Global settings",
      getLink: () => screen.getByRole("link", { name: "Global settings" }),
      expectedHash: "#/settings",
    },
    {
      name: "Quick Inject",
      getLink: () => screen.getByRole("link", { name: "Quick Inject" }),
      expectedHash: "#/settings/quick-inject",
    },
    {
      name: "Gist sync",
      getLink: () => screen.getByRole("link", { name: "Gist sync" }),
      expectedHash: "#/integrations/gist",
    },
    {
      name: "Notion sync",
      getLink: () => screen.getByRole("link", { name: "Notion sync" }),
      expectedHash: "#/integrations/notion",
    },
    {
      name: "WebDAV sync",
      getLink: () => screen.getByRole("link", { name: "WebDAV sync" }),
      expectedHash: "#/integrations/webdav",
    },
  ])("clears shortcut-save query parameters when opening $name from the sidebar", ({ getLink, expectedHash }) => {
    window.history.pushState({}, "", "/options.html?action=new&content=saved-text#/categories");

    const { container } = render(
      <HashRouter>
        <Sidebar />
      </HashRouter>,
    );

    fireEvent.click(getLink(container));

    expect(window.location.pathname).toBe("/options.html");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe(expectedHash);
  });

  it("pushes a new history entry when navigating to a different sidebar route", () => {
    window.history.pushState({ from: "test" }, "", "/options.html?action=new&content=saved-text#/categories");
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");

    render(
      <HashRouter>
        <Sidebar />
      </HashRouter>,
    );
    pushState.mockClear();
    replaceState.mockClear();

    fireEvent.click(screen.getByRole("link", { name: "Global settings" }));

    expect(pushState).toHaveBeenCalledWith(
      expect.objectContaining({ from: "test" }),
      document.title,
      "/options.html#/settings",
    );
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("replaces the current history entry when cleaning query parameters on the same route", () => {
    window.history.pushState({ from: "test" }, "", "/options.html?action=new&content=saved-text#/categories");
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");

    render(
      <HashRouter>
        <Sidebar />
      </HashRouter>,
    );
    pushState.mockClear();
    replaceState.mockClear();

    fireEvent.click(screen.getByRole("link", { name: "Category management" }));

    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: "test" }),
      document.title,
      "/options.html#/categories",
    );
  });

  it("does not keep Global settings active when Quick Inject is selected", () => {
    window.history.pushState({}, "", "/options.html#/settings/quick-inject");

    render(
      <HashRouter>
        <Sidebar />
      </HashRouter>,
    );

    const globalSettings = screen.getByRole("link", { name: "Global settings" });
    const quickInject = screen.getByRole("link", { name: "Quick Inject" });

    expect(quickInject.className).toContain("bg-primary/10");
    expect(globalSettings.className).not.toContain("bg-primary/10");
  });
});
