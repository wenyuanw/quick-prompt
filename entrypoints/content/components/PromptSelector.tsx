import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { PromptItem, EditableElement } from "../index";

interface PromptSelectorProps {
  prompts: PromptItem[];
  targetElement: EditableElement;
  onClose: () => void;
}

// 检测系统是否为暗黑模式的函数
const isDarkMode = () => {
  return (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
};

const PromptSelector: React.FC<PromptSelectorProps> = ({
  prompts,
  targetElement,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDark, setIsDark] = useState(isDarkMode());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // 过滤提示列表
  const filteredPrompts = prompts.filter(
    (prompt) =>
      prompt.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prompt.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prompt.tags.some((tag) =>
        tag.toLowerCase().includes(searchTerm.toLowerCase())
      )
  );

  // 当组件挂载时聚焦搜索框
  useEffect(() => {
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);

    // 监听系统主题变化
    const darkModeMediaQuery = window.matchMedia(
      "(prefers-color-scheme: dark)"
    );
    const handleChange = (e: MediaQueryListEvent) => {
      setIsDark(e.matches);
      if (modalRef.current) {
        modalRef.current.setAttribute(
          "data-theme",
          e.matches ? "dark" : "light"
        );
      }
    };

    if (darkModeMediaQuery.addEventListener) {
      darkModeMediaQuery.addEventListener("change", handleChange);
      return () =>
        darkModeMediaQuery.removeEventListener("change", handleChange);
    }
  }, []);

  // 设置初始主题
  useEffect(() => {
    if (modalRef.current) {
      modalRef.current.setAttribute("data-theme", isDark ? "dark" : "light");
    }
  }, [isDark]);

  // 添加进入动画效果
  useEffect(() => {
    const modal = modalRef.current?.querySelector(".qp-modal") as HTMLElement;
    if (modal) {
      // 先设置初始状态
      modal.style.opacity = "0";
      modal.style.transform = "translateY(10px) scale(0.99)"; // 更微妙的动画起点

      // 然后添加动画
      setTimeout(() => {
        modal.style.opacity = "1";
        modal.style.transform = "translateY(0) scale(1)";
      }, 10);
    }
  }, []);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 阻止事件冒泡，防止宿主页面接收到这些键盘事件
      e.stopPropagation();

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            Math.min(prev + 1, filteredPrompts.length - 1)
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredPrompts[selectedIndex]) {
            applyPrompt(filteredPrompts[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown, true); // 使用捕获阶段
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [selectedIndex, filteredPrompts]);

  // 确保选中项在视图中
  useEffect(() => {
    const selectedElement = document.getElementById(
      `prompt-item-${selectedIndex}`
    );
    if (selectedElement && listRef.current) {
      selectedElement.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // 应用选中的提示
  const applyPrompt = (prompt: PromptItem) => {
    // 检查是否为自定义适配器（contenteditable 元素）
    const isContentEditableAdapter =
      !!(targetElement as any)._element &&
      (targetElement as any)._element.getAttribute("contenteditable") ===
        "true";

    if (isContentEditableAdapter) {
      try {
        // contenteditable 元素的特殊处理
        const editableElement = (targetElement as any)._element as HTMLElement;

        // 获取当前内容和光标位置
        const fullText = editableElement.textContent || "";

        // 检查全文是否包含 "/p"
        if (fullText.includes("/p")) {
          // 找到最后一个 "/p" 的位置
          const lastTriggerPos = fullText.lastIndexOf("/p");

          // 构建新的内容（移除 "/p" 并插入提示词）
          const textBeforeTrigger = fullText.substring(0, lastTriggerPos);
          const textAfterTrigger = fullText.substring(lastTriggerPos + 2); // +2 跳过 "/p"

          // 设置新内容
          const newContent = textBeforeTrigger + prompt.content + textAfterTrigger;
          
          // 创建一个新的文本节点
          const textNode = document.createTextNode(newContent);
          
          // 清空现有内容
          while (editableElement.firstChild) {
            editableElement.removeChild(editableElement.firstChild);
          }
          
          // 插入新的文本节点
          editableElement.appendChild(textNode);

          // 设置光标位置到提示词后
          const newCursorPosition = textBeforeTrigger.length + prompt.content.length;
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(textNode, newCursorPosition);
            range.setEnd(textNode, newCursorPosition);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        } else {
          // 如果找不到 "/p"，在当前光标位置插入内容
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            
            // 确保我们在编辑器内部
            if (!editableElement.contains(range.startContainer)) {
              // 如果光标不在编辑器内，将内容追加到末尾
              const textNode = document.createTextNode(prompt.content);
              editableElement.appendChild(textNode);
              
              // 将光标移动到末尾
              const newRange = document.createRange();
              newRange.selectNodeContents(editableElement);
              newRange.collapse(false);
              selection.removeAllRanges();
              selection.addRange(newRange);
            } else {
              // 在当前光标位置插入内容
              const textNode = document.createTextNode(prompt.content);
              range.deleteContents();
              range.insertNode(textNode);
              
              // 移动光标到插入内容后面
              range.setStartAfter(textNode);
              range.setEndAfter(textNode);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          } else {
            // 如果没有选区，追加到末尾
            const textNode = document.createTextNode(prompt.content);
            editableElement.appendChild(textNode);
          }
        }

        // 触发 input 事件
        const inputEvent = new Event("input", { bubbles: true });
        editableElement.dispatchEvent(inputEvent);
      } catch (error) {
        console.error("处理 contenteditable 元素时发生错误:", error);
      }
    } else {
      // 原有逻辑，适用于标准输入框
      const cursorPosition = targetElement.selectionStart || 0;
      // 替换"/p"为选中的提示内容
      const textBeforeCursor = targetElement.value.substring(
        0,
        cursorPosition - 2
      ); // 移除 "/p"
      const textAfterCursor = targetElement.value.substring(cursorPosition);
      targetElement.value = textBeforeCursor + prompt.content + textAfterCursor;

      // 设置光标位置
      const newCursorPosition = textBeforeCursor.length + prompt.content.length;
      if (targetElement.setSelectionRange) {
        targetElement.setSelectionRange(newCursorPosition, newCursorPosition);
      }
      targetElement.focus();

      // 触发 input 事件
      try {
        const inputEvent = new Event("input", { bubbles: true });
        if (targetElement instanceof EventTarget) {
          targetElement.dispatchEvent(inputEvent);
        }
      } catch (error) {
        console.warn("无法触发输入事件:", error);
      }
    }

    // 关闭弹窗
    onClose();
  };

  // 点击背景关闭弹窗
  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      ref={modalRef}
      className="qp-fixed qp-inset-0 qp-flex qp-items-center qp-justify-center qp-z-50 qp-modal-container"
      onClick={handleBackgroundClick}
      data-theme={isDark ? "dark" : "light"}
    >
      <div className="qp-flex qp-flex-col qp-modal">
        <div className="qp-modal-header">
          <input
            ref={searchInputRef}
            type="text"
            className="qp-w-full qp-search-input"
            placeholder="输入关键词搜索提示..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setSelectedIndex(0);
            }}
          />
        </div>

        <div
          ref={listRef}
          className="qp-overflow-auto qp-modal-content qp-custom-scrollbar"
        >
          {filteredPrompts.length > 0 ? (
            <div className="qp-prompt-list-container">
              {filteredPrompts.map((prompt, index) => (
                <div
                  id={`prompt-item-${index}`}
                  key={prompt.id}
                  className={`qp-cursor-pointer qp-prompt-item ${
                    index === selectedIndex ? "qp-selected" : ""
                  }`}
                  onClick={() => applyPrompt(prompt)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="qp-prompt-title">{prompt.title}</div>
                  <div className="qp-prompt-preview">{prompt.content}</div>
                  {prompt.tags.length > 0 && (
                    <div className="qp-tags-container">
                      {prompt.tags.map((tag) => (
                        <span key={tag} className="qp-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="qp-empty-state">
              <svg
                className="qp-empty-icon"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              <div className="qp-empty-text">没有找到匹配的提示</div>
              <div className="qp-empty-subtext">尝试使用其他关键词搜索</div>
            </div>
          )}
        </div>

        <div className="qp-modal-footer">
          <span>共 {filteredPrompts.length} 个提示</span>
          <span>按 ↑↓ 导航 · Enter 选择 · Esc 关闭</span>
        </div>
      </div>
    </div>
  );
};

// 创建弹窗并挂载组件
// 现在支持传入 EditableElement 接口的对象，可以是标准输入框、文本域或 contenteditable 元素
export function showPromptSelector(
  prompts: PromptItem[],
  targetElement: EditableElement
): HTMLElement {
  // 移除任何已存在的弹窗
  const existingContainer = document.getElementById("quick-prompt-selector");
  if (existingContainer) {
    document.body.removeChild(existingContainer);
  }

  // 创建新容器并添加shadow root
  const container = document.createElement("div");
  container.id = "quick-prompt-selector";

  // 设置容器样式
  container.setAttribute(
    "style",
    `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2147483647;
    pointer-events: auto;
    `
  );

  // 创建shadow DOM来隔离样式
  const shadowRoot = container.attachShadow({ mode: "open" });

  // 创建样式元素
  const style = document.createElement("style");
  style.textContent = `
    /* 基础样式重置 */
    * {
      box-sizing: border-box !important;
      margin: 0 !important;
      padding: 0 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
    }
    
    /* 主题相关变量 - 亮色模式默认值 */
    :host {
      --qp-bg-overlay: rgba(0, 0, 0, 0.5);
      --qp-bg-primary: #ffffff;
      --qp-bg-secondary: #f9fafb;
      --qp-bg-hover: #f8f5ff;
      --qp-bg-selected: #f3ecff;
      --qp-bg-tag: #eee8ff;
      --qp-text-primary: #111827;
      --qp-text-secondary: #6b7280;
      --qp-text-tag: #5b46a8;
      --qp-border-color: #e5e7eb;
      --qp-focus-ring: #9d85f2;
      --qp-shadow-color: rgba(124, 58, 237, 0.06);
      --qp-green: #10b981;
      --qp-accent: #8674e2;
      --qp-accent-light: #a495eb;
      --qp-gradient-start: #9f87f0;
      --qp-gradient-end: #8674e2;
    }

    /* 暗黑模式变量 */
    :host([data-theme="dark"]) {
      --qp-bg-overlay: rgba(0, 0, 0, 0.7);
      --qp-bg-primary: #1f2937;
      --qp-bg-secondary: #111827;
      --qp-bg-hover: #2c2967;
      --qp-bg-selected: #3b348c;
      --qp-bg-tag: #2f2c6e;
      --qp-text-primary: #f9fafb;
      --qp-text-secondary: #9ca3af;
      --qp-text-tag: #c7bdfa;
      --qp-border-color: #374151;
      --qp-focus-ring: #9d85f2;
      --qp-shadow-color: rgba(124, 58, 237, 0.12);
      --qp-green: #34d399;
      --qp-accent: #9d85f2;
      --qp-accent-light: #bbadf7;
      --qp-gradient-start: #7e63e3;
      --qp-gradient-end: #6055c5;
    }
    
    /* 移植原来的样式 */
    .qp-fixed {
      position: fixed !important;
    }
    
    .qp-inset-0 {
      top: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      left: 0 !important;
    }
    
    .qp-flex {
      display: flex !important;
    }
    
    .qp-flex-col {
      flex-direction: column !important;
    }
    
    .qp-items-center {
      align-items: center !important;
    }
    
    .qp-justify-center {
      justify-content: center !important;
    }
    
    .qp-z-50 {
      z-index: 2147483647 !important;
    }
    
    /* 主容器样式 */
    .qp-modal-container {
      backdrop-filter: blur(8px) !important;
      background-color: var(--qp-bg-overlay) !important;
      transition: all 0.25s ease-in-out !important;
      width: 100% !important;
      height: 100% !important;
    }

    /* 弹窗主体样式 */
    .qp-modal {
      border-radius: 12px !important;
      overflow: hidden !important;
      background-color: var(--qp-bg-primary) !important;
      box-shadow: 0 8px 16px rgba(124, 58, 237, 0.06), 0 2px 4px rgba(124, 58, 237, 0.03) !important;
      transition: transform 0.25s ease-out, opacity 0.25s ease-out !important;
      transform: translateY(0) scale(1) !important;
      opacity: 1 !important;
      max-width: 620px !important;
      width: 90% !important;
      color: var(--qp-text-primary) !important;
      display: flex !important;
      flex-direction: column !important;
      max-height: 80vh !important;
    }
    
    /* 弹窗头部样式 */
    .qp-modal-header {
      display: flex !important;
      align-items: center !important;
      background: linear-gradient(
        to right,
        var(--qp-gradient-start),
        var(--qp-gradient-end)
      ) !important;
      padding: 19px !important;
      color: white !important;
      border-bottom: none !important;
      position: relative !important;
    }

    .qp-modal-header::before {
      content: '' !important;
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      background-image: linear-gradient(120deg, rgba(255, 255, 255, 0.05), transparent) !important;
      pointer-events: none !important;
    }

    /* 数据统计信息样式 */
    .qp-stats {
      color: rgba(255, 255, 255, 0.85) !important;
      font-size: 12px !important;
      display: flex !important;
      justify-content: space-between !important;
      margin-top: 12px !important;
    }

    /* 底部状态栏样式 */
    .qp-modal-footer {
      padding: 10px 19px !important;
      background-color: var(--qp-bg-secondary) !important;
      border-top: 1px solid var(--qp-border-color) !important;
      color: var(--qp-text-secondary) !important;
      font-size: 12px !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
    }

    .qp-modal-footer span {
      color: var(--qp-text-secondary) !important;
    }

    :host([data-theme='dark']) .qp-modal-footer {
      background-color: var(--qp-bg-secondary) !important;
      border-top: 1px solid rgba(124, 58, 237, 0.1) !important;
    }

    /* 弹窗内容样式 */
    .qp-modal-content {
      padding: 0 !important;
      max-height: none !important;
      background-color: var(--qp-bg-primary) !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
      flex: 1 !important;
      min-height: 0 !important;
      position: relative !important;
      overflow-y: auto !important;
      overscroll-behavior: contain !important;
      -webkit-overflow-scrolling: touch !important;
    }

    .qp-modal-content > div {
      flex: 1 !important;
      display: flex !important;
      flex-direction: column !important;
      min-height: 0 !important;
      height: 100% !important;
    }

    /* 提示列表容器样式 */
    .qp-prompt-list-container {
      flex: 1 !important;
      display: flex !important;
      flex-direction: column !important;
      min-height: 0 !important;
      overflow: hidden !important;
    }

    /* 提示项样式 */
    .qp-prompt-item {
      padding: 12px 20px !important;
      border-left: 2px solid transparent !important;
      transition: all 0.25s ease-out !important;
      border-bottom: 1px solid var(--qp-border-color) !important;
      background-color: var(--qp-bg-primary) !important;
      position: relative !important;
    }

    .qp-prompt-item:last-child {
      border-bottom: none !important;
      margin-bottom: 0 !important;
    }

    .qp-prompt-item:hover {
      background-color: var(--qp-bg-hover) !important;
      transform: translateX(1px) !important;
    }

    .qp-prompt-item.qp-selected {
      background-color: var(--qp-bg-selected) !important;
      border-left: 2px solid var(--qp-accent) !important;
      transform: translateX(1px) !important;
      position: relative !important;
    }
    
    /* 提示标题 */
    .qp-prompt-title {
      font-weight: 600 !important;
      font-size: 15px !important;
      color: var(--qp-text-primary) !important;
      margin-bottom: 3px !important;
    }

    /* 提示内容预览 */
    .qp-prompt-preview {
      color: var(--qp-text-secondary) !important;
      font-size: 14px !important;
      line-height: 1.4 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      margin-bottom: 4px !important;
    }

    /* 标签样式 */
    .qp-tags-container {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 6px !important;
      margin-top: 8px !important;
    }

    .qp-tag {
      background-color: var(--qp-bg-tag) !important;
      color: var(--qp-text-tag) !important;
      font-size: 11px !important;
      padding: 2px 7px !important;
      border-radius: 3px !important;
      display: inline-flex !important;
      align-items: center !important;
      box-shadow: none !important;
    }

    /* 空状态样式 */
    .qp-empty-state {
      padding: 48px 32px !important;
      text-align: center !important;
      color: var(--qp-text-secondary) !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      background-color: var(--qp-bg-primary) !important;
      flex: 1 !important;
      margin: 0 !important;
    }

    .qp-empty-icon {
      width: 64px !important;
      height: 64px !important;
      margin-bottom: 16px !important;
      opacity: 0.5 !important;
      color: var(--qp-text-secondary) !important;
    }

    .qp-empty-text {
      font-size: 15px !important;
      margin-bottom: 8px !important;
      color: var(--qp-text-primary) !important;
      font-weight: 600 !important;
    }

    .qp-empty-subtext {
      font-size: 13px !important;
      opacity: 0.7 !important;
      color: var(--qp-text-secondary) !important;
    }
    
    /* 确保选中和未选中项的边框一致 */
    .qp-prompt-item,
    .qp-prompt-item.qp-selected {
      border-left-width: 2px !important;
    }

    /* 搜索输入框样式 */
    .qp-search-input {
      border: none !important;
      border-radius: 8px !important;
      padding: 12px 16px !important;
      background-color: rgba(255, 255, 255, 0.25) !important;
      color: white !important;
      backdrop-filter: blur(5px) !important;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
      transition: all 0.2s ease !important;
      font-weight: 500 !important;
      width: 100% !important;
      letter-spacing: 0.3px !important;
    }

    .qp-search-input::placeholder {
      color: rgba(255, 255, 255, 0.8) !important;
      font-weight: 400 !important;
    }

    .qp-search-input:focus {
      background-color: rgba(255, 255, 255, 0.3) !important;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3), 0 2px 4px rgba(0, 0, 0, 0.1) !important;
      outline: none !important;
    }

    [data-theme='light'] .qp-search-input {
      background-color: rgba(255, 255, 255, 0.9) !important;
      color: #1a1a1a !important;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05) !important;
      border: 1px solid rgba(124, 58, 237, 0.1) !important;
    }

    :host([data-theme='light']) .qp-search-input::placeholder {
      color: rgba(0, 0, 0, 0.4) !important;
    }

    :host([data-theme='light']) .qp-search-input:focus {
      background-color: #ffffff !important;
      border-color: rgba(124, 58, 237, 0.3) !important;
      box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.2), 0 2px 4px rgba(124, 58, 237, 0.05) !important;
    }
    
    /* 搜索输入框暗黑模式 */
    :host([data-theme='dark']) .qp-search-input {
      background-color: rgba(0, 0, 0, 0.2) !important;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2) !important;
      color: rgba(255, 255, 255, 0.95) !important;
      border: 1px solid rgba(255, 255, 255, 0.1) !important;
    }

    :host([data-theme='dark']) .qp-search-input::placeholder {
      color: rgba(255, 255, 255, 0.6) !important;
    }

    :host([data-theme='dark']) .qp-search-input:focus {
      background-color: rgba(0, 0, 0, 0.3) !important;
      border-color: rgba(255, 255, 255, 0.2) !important;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.2) !important;
    }
    
    /* 滚动条样式 */
    .qp-custom-scrollbar {
      scrollbar-width: thin !important;
      scrollbar-color: rgba(0, 0, 0, 0.2) transparent !important;
    }
    
    .qp-custom-scrollbar::-webkit-scrollbar {
      width: 6px !important;
    }
    
    .qp-custom-scrollbar::-webkit-scrollbar-track {
      background: transparent !important;
    }
    
    .qp-custom-scrollbar::-webkit-scrollbar-thumb {
      background-color: rgba(0, 0, 0, 0.2) !important;
      border-radius: 20px !important;
    }
    
    :host([data-theme="dark"]) .qp-custom-scrollbar::-webkit-scrollbar-thumb {
      background-color: rgba(255, 255, 255, 0.2) !important;
    }
    
    .qp-cursor-pointer {
      cursor: pointer !important;
    }
  `;
  shadowRoot.appendChild(style);

  // 创建根容器
  const rootElement = document.createElement("div");
  rootElement.id = "quick-prompt-root";
  shadowRoot.appendChild(rootElement);

  // 添加到documentElement（html元素），而不是body
  document.documentElement.appendChild(container);

  // 创建自定义包装组件，以处理shadow DOM环境中的特殊情况
  const ShadowDomWrapper = (props: PromptSelectorProps) => {
    const { prompts, targetElement, onClose } = props;
    const [isDark, setIsDark] = useState(isDarkMode());

    // 设置初始主题
    useEffect(() => {
      if (shadowRoot.host) {
        shadowRoot.host.setAttribute("data-theme", isDark ? "dark" : "light");
      }

      // 监听系统主题变化
      const darkModeMediaQuery = window.matchMedia(
        "(prefers-color-scheme: dark)"
      );
      const handleChange = (e: MediaQueryListEvent) => {
        setIsDark(e.matches);
        if (shadowRoot.host) {
          shadowRoot.host.setAttribute(
            "data-theme",
            e.matches ? "dark" : "light"
          );
        }
      };

      if (darkModeMediaQuery.addEventListener) {
        darkModeMediaQuery.addEventListener("change", handleChange);
        return () =>
          darkModeMediaQuery.removeEventListener("change", handleChange);
      }
    }, []);

    // 在组件挂载时设置焦点到搜索框
    useEffect(() => {
      // 延迟聚焦，确保元素已挂载
      setTimeout(() => {
        const searchInput = shadowRoot.querySelector(
          ".qp-search-input"
        ) as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      }, 100);
    }, []);

    // 添加键盘事件处理
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // 阻止事件冒泡，防止宿主页面接收到这些键盘事件
        e.stopPropagation();
      };

      // 使用捕获阶段以确保我们先接收到事件
      document.addEventListener("keydown", handleKeyDown, true);

      return () => {
        document.removeEventListener("keydown", handleKeyDown, true);
      };
    }, []);

    return (
      <PromptSelector
        prompts={prompts}
        targetElement={targetElement}
        onClose={onClose}
      />
    );
  };

  // 渲染组件
  const root = createRoot(rootElement);
  root.render(
    <ShadowDomWrapper
      prompts={prompts}
      targetElement={targetElement}
      onClose={() => {
        root.unmount();
        if (document.documentElement.contains(container)) {
          document.documentElement.removeChild(container);
        }
      }}
    />
  );

  // 返回容器元素以便进一步定制
  return container;
}
