import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { PromptItemWithVariables, EditableElement, Category } from "@/utils/types";
import { getPromptSelectorStyles } from "../utils/styles";
import { extractVariables } from "../utils/variableParser";
import { showVariableInput } from "./VariableInput";
import { isDarkMode } from "@/utils/tools";
import { getCategories } from "@/utils/categoryUtils";

interface PromptSelectorProps {
  prompts: PromptItemWithVariables[];
  targetElement: EditableElement;
  onClose: () => void;
}

const PromptSelector: React.FC<PromptSelectorProps> = ({
  prompts,
  targetElement,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDark, setIsDark] = useState(isDarkMode());
  const [isKeyboardNav, setIsKeyboardNav] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoriesMap, setCategoriesMap] = useState<Record<string, Category>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // 加载分类列表
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const categoriesList = await getCategories();
        const enabledCategories = categoriesList.filter(cat => cat.enabled);
        setCategories(enabledCategories);
        
        // 创建分类映射表
        const categoryMap: Record<string, Category> = {};
        categoriesList.forEach(cat => {
          categoryMap[cat.id] = cat;
        });
        setCategoriesMap(categoryMap);
      } catch (err) {
        console.error('加载分类失败:', err);
      }
    };
    
    loadCategories();
  }, []);

  // 过滤提示列表 - 同时考虑搜索词和分类筛选
  const filteredPrompts = prompts.filter((prompt) => {
    // 首先按分类筛选
    if (selectedCategoryId && prompt.categoryId !== selectedCategoryId) {
      return false;
    }
    
    // 再按搜索词筛选
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      return (
        prompt.title.toLowerCase().includes(term) ||
        prompt.content.toLowerCase().includes(term) ||
        prompt.tags.some((tag) => tag.toLowerCase().includes(term))
      );
    }
    
    return true;
  });

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

  // 循环切换分类
  const cycleCategorySelection = (direction: 'next' | 'prev') => {
    const allOptions = [null, ...categories.map(cat => cat.id)]; // null 表示"所有分类"
    const currentIndex = allOptions.indexOf(selectedCategoryId);
    
    let nextIndex;
    if (direction === 'next') {
      nextIndex = currentIndex === allOptions.length - 1 ? 0 : currentIndex + 1;
    } else {
      nextIndex = currentIndex === 0 ? allOptions.length - 1 : currentIndex - 1;
    }
    
    setSelectedCategoryId(allOptions[nextIndex]);
  };

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 阻止事件冒泡，防止宿主页面接收到这些键盘事件
      e.stopPropagation();

      switch (e.key) {
        case "ArrowDown":
        case "ArrowUp":
          setIsKeyboardNav(true);  // 设置为键盘导航模式
          e.preventDefault();
          setSelectedIndex((prev) => 
            e.key === "ArrowDown"
              ? prev === filteredPrompts.length - 1 ? 0 : prev + 1
              : prev === 0 ? filteredPrompts.length - 1 : prev - 1
          );
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
        case "Tab":
          e.preventDefault();
          // Tab键循环切换分类
          cycleCategorySelection(e.shiftKey ? 'prev' : 'next');
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [selectedIndex, filteredPrompts, categories, selectedCategoryId]);

  // 当筛选结果变化时重置选中索引
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm, selectedCategoryId]);

  // 添加鼠标移动事件监听
  useEffect(() => {
    const handleMouseMove = () => {
      setIsKeyboardNav(false);  // 设置为鼠标导航模式
    };

    document.addEventListener('mousemove', handleMouseMove, true);
    return () => document.removeEventListener('mousemove', handleMouseMove, true);
  }, []);

  // 确保选中项在视图中
  useEffect(() => {
    // 通过modalRef直接访问Shadow DOM
    const shadowRoot = modalRef.current?.getRootNode() as ShadowRoot;
    if (!shadowRoot) return;
    
    const selectedElement = shadowRoot.querySelector(
      `#prompt-item-${selectedIndex}`
    );
    
    if (selectedElement && listRef.current) {
      selectedElement.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // 应用选中的提示
  const applyPrompt = (prompt: PromptItemWithVariables) => {
    // 提取提示词中的变量
    const variables = prompt._variables || extractVariables(prompt.content);
    prompt._variables = variables;
    
    // 如果提示词包含变量，则打开变量输入弹窗
    if (variables && variables.length > 0) {
      // 暂时关闭提示选择器
      onClose();
      
      // 显示变量输入弹窗
      showVariableInput(
        prompt,
        targetElement,
        (processedContent) => {
          // 变量填写完成后，使用处理后的内容应用到目标元素
          applyProcessedContent(processedContent);
        },
        () => {
          // 取消变量输入时，不执行任何操作
          console.log("变量输入已取消");
        }
      );
      return;
    }
    
    // 如果没有变量，直接应用原始内容
    applyProcessedContent(prompt.content);
  };

  // 应用处理后的内容到目标元素
  const applyProcessedContent = (content: string) => {
    // 检查是否为自定义适配器（contenteditable 元素）
    const isContentEditableAdapter =
      !!(targetElement as any)._element &&
      (targetElement as any)._element.getAttribute("contenteditable") ===
        "true";

    if (isContentEditableAdapter) {
      try {
        const editableElement = (targetElement as any)._element as HTMLElement;
        const selection = window.getSelection();

        if (!selection || selection.rangeCount === 0) {
          console.error("Quick Prompt: No selection found. Cannot apply prompt or remove /p trigger.");
          onClose(); // Close the selector
          return;     // Exit if no selection
        }

        const range = selection.getRangeAt(0); // Use directly as per prompt's snippet
        const cursorNode = range.startContainer;
        const cursorPos = range.startOffset;

        let textNodeWithTrigger: Text | null = null;
        let triggerStartPosition = -1;

        if (cursorNode.nodeType === Node.TEXT_NODE && cursorPos >= 2) {
          const textContent = cursorNode.textContent || ""; // Renamed for clarity from textContentBeforeCursor
          const textBeforeCursor = textContent.substring(cursorPos - 2, cursorPos);
          if (textBeforeCursor.toLowerCase() === "/p") {
            textNodeWithTrigger = cursorNode as Text;
            triggerStartPosition = cursorPos - 2;
          }
        }

        if (textNodeWithTrigger && triggerStartPosition !== -1) {
          const triggerRange = document.createRange();
          triggerRange.setStart(textNodeWithTrigger, triggerStartPosition);
          triggerRange.setEnd(textNodeWithTrigger, triggerStartPosition + 2);

          const beforeDeleteEvent = new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "deleteContentBackward",
          });

          if (!editableElement.dispatchEvent(beforeDeleteEvent)) {
            console.log("Quick Prompt: Deletion of /p canceled by beforeinput event.");
            onClose();
            return;
          }
          triggerRange.deleteContents();
          // After deletion, the main `range` (cursor position) should be automatically
          // collapsed at the point of deletion. We will insert content there.
          // Ensure the selection is updated to this new collapsed range.
          selection.removeAllRanges();
          selection.addRange(range); // range should now be at the correct insertion point
        } else {
          // If /p was not found immediately before the cursor using this specific logic,
          // do not fall back to full textContent replacement for /p removal.
          // Insert the prompt, and /p might remain if our precise method missed it.
          console.warn("Quick Prompt: Could not find /p immediately before cursor for precise DOM deletion. /p may not be removed.");
        }

        // Insert the prompt content
        const contentTextNode = document.createTextNode(content);
        const beforeInsertEvent = new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText", 
          data: content,
        });

        if (!editableElement.dispatchEvent(beforeInsertEvent)) {
          console.log("Quick Prompt: Insertion of prompt content canceled by beforeinput event.");
          onClose();
          return;
        }

        range.insertNode(contentTextNode);

        range.setStartAfter(contentTextNode);
        range.setEndAfter(contentTextNode);
        selection.removeAllRanges(); 
        selection.addRange(range);   

        const inputEvent = new InputEvent("input", {
          bubbles: true,
          inputType: "insertText", 
          data: content,
        });
        editableElement.dispatchEvent(inputEvent);
        editableElement.focus();
        onClose(); 

      } catch (error) {
        console.error("处理 contenteditable 元素时发生错误:", error);
        onClose(); 
      }
    } else {
      // 原有的标准输入框处理逻辑
      const cursorPosition = targetElement.selectionStart || 0;
      const textBeforeCursor = targetElement.value.substring(
        0,
        cursorPosition - 2
      );
      const textAfterCursor = targetElement.value.substring(cursorPosition);
      targetElement.value = textBeforeCursor + content + textAfterCursor;

      // 设置光标位置
      const newCursorPosition = textBeforeCursor.length + content.length;
      if (targetElement.setSelectionRange) {
        targetElement.setSelectionRange(newCursorPosition, newCursorPosition);
      }
      targetElement.focus();

      // 触发 input 事件
      try {
        const inputEvent = new InputEvent("input", {
          bubbles: true,
          inputType: "insertFromPaste", // Kept as insertFromPaste for non-contenteditable to match original
          data: content,
        });
        targetElement.dispatchEvent(inputEvent);
      } catch (error) {
        console.warn("无法触发输入事件:", error);
      }
      // For non-contenteditable, onClose was originally outside the if/else.
      // To maintain consistency with the new contenteditable logic,
      // we ensure onClose is called for this path too.
      onClose(); // onClose for the non-contenteditable path
    }
    // Note: The main onClose() call was previously here.
    // It has been moved into each branch (contenteditable and non-contenteditable)
    // to ensure it's called correctly, especially if beforeinput events are cancelled or in case of errors.
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
      className={`qp-fixed qp-inset-0 qp-flex qp-items-center qp-justify-center qp-z-50 qp-modal-container ${
        isKeyboardNav ? 'qp-keyboard-nav' : ''
      }`}
      onClick={handleBackgroundClick}
      data-theme={isDark ? "dark" : "light"}
    >
      <div className="qp-flex qp-flex-col qp-modal">
        <div className="qp-modal-header">
          <div className="qp-w-full qp-space-y-3">
            <div className="qp-flex qp-items-center qp-gap-3">
              <input
                ref={searchInputRef}
                type="text"
                className="qp-flex-1 qp-search-input"
                placeholder="输入关键词搜索提示..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                }}
              />
              <select
                value={selectedCategoryId || ""}
                onChange={(e) => setSelectedCategoryId(e.target.value || null)}
                className="qp-category-select"
              >
                <option value="">所有分类</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div
          ref={listRef}
          className="qp-overflow-auto qp-modal-content qp-custom-scrollbar"
        >
          {filteredPrompts.length > 0 ? (
            <>
              {filteredPrompts.map((prompt, index) => {
                const category = categoriesMap[prompt.categoryId];
                return (
                  <div
                    id={`prompt-item-${index}`}
                    key={prompt.id}
                    className={`qp-cursor-pointer qp-prompt-item ${
                      index === selectedIndex ? "qp-selected" : ""
                    }`}
                    onClick={() => applyPrompt(prompt)}
                    onMouseEnter={() => !isKeyboardNav && setSelectedIndex(index)}
                  >
                    <div className="qp-prompt-title">{prompt.title}</div>
                    <div className="qp-prompt-preview">{prompt.content}</div>
                    <div className="qp-prompt-meta">
                      {category && (
                        <div className="qp-prompt-category">
                          <div 
                            className="qp-category-dot" 
                            style={{ backgroundColor: category.color || '#6366f1' }}
                          />
                          <span className="qp-category-name">{category.name}</span>
                        </div>
                      )}
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
                  </div>
                );
              })}
            </>
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
              <div className="qp-empty-text">
                {searchTerm || selectedCategoryId ? "没有找到匹配的提示" : "没有可用的提示"}
              </div>
              <div className="qp-empty-subtext">
                {searchTerm && selectedCategoryId 
                  ? "尝试更改搜索词或选择其他分类"
                  : searchTerm 
                  ? "尝试使用其他关键词搜索"
                  : selectedCategoryId
                  ? "该分类中暂无提示词"
                  : "请先添加一些提示词"
                }
              </div>
            </div>
          )}
        </div>

        <div className="qp-modal-footer">
          <span>共 {filteredPrompts.length} 个提示</span>
          <span>↑↓ 导航 · Enter 选择 · Tab 切换分类</span>
        </div>
      </div>
    </div>
  );
};

// 创建弹窗并挂载组件
export function showPromptSelector(
  prompts: PromptItemWithVariables[],
  targetElement: EditableElement,
  onCloseCallback?: () => void
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
  style.textContent = getPromptSelectorStyles();
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
        // 调用关闭回调
        onCloseCallback?.();
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
