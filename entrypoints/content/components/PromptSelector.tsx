import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { PromptItemWithVariables, EditableElement, Category } from "@/utils/types";
import { getPromptSelectorStyles } from "../utils/styles";
import { extractVariables } from "../utils/variableParser";
import { showVariableInput } from "./VariableInput";
import { isDarkMode, getCopyShortcutText } from "@/utils/tools";
import { getCategories } from "@/utils/categoryUtils";
import { getGlobalSetting } from "@/utils/globalSettings";
import { t } from "@/utils/i18n";
import { getNewlineStrategy, setElementContentByStrategy } from "@/utils/newlineRules";

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
  const [closeOnOutsideClick, setCloseOnOutsideClick] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // 加载分类列表和全局设置
  useEffect(() => {
    const loadData = async () => {
      try {
        // 加载分类列表
        const categoriesList = await getCategories();
        const enabledCategories = categoriesList.filter(cat => cat.enabled);
        setCategories(enabledCategories);
        
        // 创建分类映射表
        const categoryMap: Record<string, Category> = {};
        categoriesList.forEach(cat => {
          categoryMap[cat.id] = cat;
        });
        setCategoriesMap(categoryMap);

        // 加载全局设置
        try {
          const closeModalOnOutsideClick = await getGlobalSetting('closeModalOnOutsideClick');
          setCloseOnOutsideClick(closeModalOnOutsideClick);
        } catch (err) {
          console.warn('Failed to load global settings:', err);
          setCloseOnOutsideClick(true); // 默认启用
        }
      } catch (err) {
        console.error(t('loadCategoriesFailed'), err);
      }
    };
    
    loadData();
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
  }).sort((a, b) => {
    // 按置顶状态和最后修改时间排序：置顶的在前面，同级别内按最后修改时间降序
    // 首先按置顶状态排序，置顶的在前面
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    
    // 如果置顶状态相同，按最后修改时间降序排序（新的在前面）
    const aTime = a.lastModified ? new Date(a.lastModified).getTime() : 0;
    const bTime = b.lastModified ? new Date(b.lastModified).getTime() : 0;
    return bTime - aTime;
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

  // 复制提示词内容
  const copyPrompt = async (e: React.MouseEvent, prompt: PromptItemWithVariables) => {
    e.stopPropagation(); // 阻止事件冒泡，避免触发选择提示词
    try {
      await navigator.clipboard.writeText(prompt.content);
      setCopiedId(prompt.id);
      setTimeout(() => {
        setCopiedId(null);
      }, 2000); // 2秒后清除复制状态
    } catch (err) {
      console.error(t('copyFailed'), err);
    }
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
        case "c":
          // Ctrl+C (Windows) 或 Command+C (Mac) 复制当前选中的提示词
          if ((e.ctrlKey || e.metaKey) && filteredPrompts[selectedIndex]) {
            e.preventDefault();
            navigator.clipboard.writeText(filteredPrompts[selectedIndex].content)
              .then(() => {
                setCopiedId(filteredPrompts[selectedIndex].id);
                setTimeout(() => setCopiedId(null), 2000);
              })
              .catch(err => console.error(t('copyFailed'), err));
          }
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
          console.log(t('variableInputCanceled'));
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
        // contenteditable 元素的特殊处理
        const editableElement = (targetElement as any)._element as HTMLElement;
        const newlineStrategy = getNewlineStrategy(window.location.href);

        // 获取当前内容和光标位置
        const fullText = editableElement.textContent || "";

        // 检查全文是否包含 "/p"，不区分大小写
        if (fullText.toLowerCase().includes('/p')) {
          // 找到最后一个 "/p" 或 "/P" 的位置
          // 先查找小写，再查找大写，取最后出现的位置
          const lastLowerCasePos = fullText.toLowerCase().lastIndexOf('/p');
          // 找到实际文本中这个位置的两个字符
          const actualTrigger = fullText.substring(lastLowerCasePos, lastLowerCasePos + 2);
          
          // 构建新的内容（移除触发词并插入提示词）
          const textBeforeTrigger = fullText.substring(0, lastLowerCasePos);
          const textAfterTrigger = fullText.substring(lastLowerCasePos + 2);
          const newContent = textBeforeTrigger + content + textAfterTrigger;

          // 创建并分发 beforeinput 事件
          const beforeInputEvent = new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "insertFromPaste",
            data: newContent,
          });

          // 如果 beforeinput 事件没有被阻止，则继续处理
          if (editableElement.dispatchEvent(beforeInputEvent)) {
            setElementContentByStrategy(editableElement, newContent, newlineStrategy);

            // 创建并分发 input 事件
            const inputEvent = new InputEvent("input", {
              bubbles: true,
              inputType: "insertFromPaste",
              data: newContent,
            });
            editableElement.dispatchEvent(inputEvent);

            // 设置光标到末尾
            const selection = window.getSelection();
            if (selection) {
              const range = document.createRange();
              range.selectNodeContents(editableElement);
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        } else {
          // 如果找不到 "/p"，在当前光标位置插入内容
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const beforeInputEvent = new InputEvent("beforeinput", {
              bubbles: true,
              cancelable: true,
              inputType: "insertFromPaste",
              data: content,
            });

            // 如果 beforeinput 事件没有被阻止，则继续处理
            if (editableElement.dispatchEvent(beforeInputEvent)) {
              const currentContent = editableElement.textContent || "";
              const position = range.startOffset;

              // 在光标位置插入新内容
              const newContent =
                currentContent.slice(0, position) +
                content +
                currentContent.slice(position);

              setElementContentByStrategy(editableElement, newContent, newlineStrategy);

              // 创建并分发 input 事件
              const inputEvent = new InputEvent("input", {
                bubbles: true,
                inputType: "insertFromPaste",
                data: content,
              });
              editableElement.dispatchEvent(inputEvent);

              // 设置光标到末尾
              const newRange = document.createRange();
              newRange.selectNodeContents(editableElement);
              newRange.collapse(false);
              selection.removeAllRanges();
              selection.addRange(newRange);
            }
          } else {
            // 如果没有选区，追加到末尾
            const beforeInputEvent = new InputEvent("beforeinput", {
              bubbles: true,
              cancelable: true,
              inputType: "insertFromPaste",
              data: content,
            });

            // 如果 beforeinput 事件没有被阻止，则继续处理
            if (editableElement.dispatchEvent(beforeInputEvent)) {
              const currentContent = editableElement.textContent || "";
              const newContent = currentContent + content;
              setElementContentByStrategy(editableElement, newContent, newlineStrategy);

              // 创建并分发 input 事件
              const inputEvent = new InputEvent("input", {
                bubbles: true,
                inputType: "insertFromPaste",
                data: content,
              });
              editableElement.dispatchEvent(inputEvent);
            }
          }
        }

        // 确保编辑器获得焦点
        editableElement.focus();
      } catch (error) {
        console.error(t('errorProcessingContentEditable'), error);
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
          inputType: "insertFromPaste",
          data: content,
        });
        targetElement.dispatchEvent(inputEvent);
      } catch (error) {
        console.warn(t('cannotTriggerInputEvent'), error);
      }
    }

    // 关闭弹窗
    onClose();
  };

  // 点击背景关闭弹窗
  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && closeOnOutsideClick) {
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
                placeholder={t('searchKeywordPlaceholder')}
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
                <option value="">{t('allCategories')}</option>
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
                    <div className="qp-flex qp-justify-between qp-items-center">
                      <div className="qp-prompt-title">{prompt.title}</div>
                      <button
                        className={`qp-copy-button ${copiedId === prompt.id ? 'qp-copied' : ''}`}
                        onClick={(e) => copyPrompt(e, prompt)}
                        title={t('copyPrompt')}
                      >
                        {copiedId === prompt.id ? (
                          <svg className="qp-copy-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : (
                          <svg className="qp-copy-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M8 4v12a2 2 0 002 2h8a2 2 0 002-2V7.242a2 2 0 00-.602-1.43L16.083 2.57A2 2 0 0014.685 2H10a2 2 0 00-2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M16 2v3a2 2 0 002 2h3M4 8v12a2 2 0 002 2h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                    </div>
                    <div className={`qp-prompt-body ${prompt.thumbnailUrl ? 'qp-has-thumbnail' : ''}`}>
                      <div className="qp-prompt-content">
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
                      {prompt.thumbnailUrl && (
                        <img
                          src={prompt.thumbnailUrl}
                          alt={prompt.title}
                          className="qp-thumbnail-img"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
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
                {searchTerm || selectedCategoryId ? t('noMatchingPrompts') : t('noAvailablePrompts')}
              </div>
              <div className="qp-empty-subtext">
                {searchTerm && selectedCategoryId 
                  ? t('tryChangingSearchOrCategory')
                  : searchTerm 
                  ? t('tryOtherKeywords')
                  : selectedCategoryId
                  ? t('noCategoryPrompts')
                  : t('pleaseAddPrompts')
                }
              </div>
            </div>
          )}
        </div>

        <div className="qp-modal-footer">
          <span>{t('totalPrompts2', [filteredPrompts.length.toString()])}</span>
          <span>{t('pressCtrlCToCopy', [getCopyShortcutText()])} • {t('navigationHelp')}</span>
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
