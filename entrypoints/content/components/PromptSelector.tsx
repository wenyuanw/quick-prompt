import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Check, ChevronDown, Copy, SearchX } from "lucide-react";
import type { PromptItemWithVariables, EditableElement, Category } from "@/utils/types";
import { getPromptSelectorStyles } from "../utils/styles";
import { extractVariables } from "@/utils/variableParser";
import { showVariableInput } from "./VariableInput";
import { isDarkMode, getCopyShortcutText } from "@/utils/tools";
import { getCategories } from "@/utils/categoryUtils";
import { getGlobalSetting } from "@/utils/globalSettings";
import { t } from "@/utils/i18n";
import { filterAndSortPrompts } from "@/utils/promptFilter";
import PromptAttachmentPreview from "./PromptAttachmentPreview";
import { insertContentIntoEditable } from "../utils/editableTarget";

interface PromptSelectorProps {
  prompts: PromptItemWithVariables[];
  targetElement: EditableElement;
  onClose: () => void;
  removePromptTrigger?: boolean;
}

const isEventInsideElement = (event: Event, element: Element): boolean => {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  return path.includes(element) || element.contains(event.target as Node);
};

const countPromptCharacters = (content: string): number => (
  Array.from(content.replace(/\s/g, "")).length
);

const PromptSelector: React.FC<PromptSelectorProps> = ({
  prompts,
  targetElement,
  onClose,
  removePromptTrigger = false,
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
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [, setLocaleRevision] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const categoryPickerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const selectedCategory = selectedCategoryId
    ? categories.find(category => category.id === selectedCategoryId)
    : null;
  const selectedCategoryLabel = selectedCategory?.name || t('allCategories');

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

  useEffect(() => {
    const handleLocaleChange = () => setLocaleRevision((revision) => revision + 1);
    globalThis.addEventListener('quick-prompt-locale-change', handleLocaleChange);
    return () => globalThis.removeEventListener('quick-prompt-locale-change', handleLocaleChange);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (
        isCategoryMenuOpen &&
        categoryPickerRef.current &&
        !isEventInsideElement(event, categoryPickerRef.current)
      ) {
        setIsCategoryMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown, true);
    return () => document.removeEventListener('mousedown', handlePointerDown, true);
  }, [isCategoryMenuOpen]);

  // 过滤提示列表 - 同时考虑搜索词和分类筛选（与侧边栏共用逻辑）
  const filteredPrompts = filterAndSortPrompts(prompts, {
    searchTerm,
    categoryId: selectedCategoryId,
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
          if (isCategoryMenuOpen) {
            setIsCategoryMenuOpen(false);
            break;
          }
          onClose();
          break;
        case "Tab":
          e.preventDefault();
          setIsCategoryMenuOpen(false);
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
  }, [selectedIndex, filteredPrompts, categories, selectedCategoryId, isCategoryMenuOpen]);

  // 当筛选结果变化时重置选中索引
  useEffect(() => {
    setSelectedIndex(0);
    setIsCategoryMenuOpen(false);
  }, [searchTerm, selectedCategoryId]);

  const selectCategory = (categoryId: string | null) => {
    setSelectedCategoryId(categoryId);
    setIsCategoryMenuOpen(false);
    setIsKeyboardNav(false);
  };

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
    insertContentIntoEditable(targetElement, content, { removePromptTrigger });

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
                onKeyDown={(e) => {
                  e.stopPropagation();
                }}
                onBlur={(e) => {
                  e.stopPropagation();
                }}
              />
              <div className="qp-category-picker" ref={categoryPickerRef}>
                <button
                  type="button"
                  className={`qp-category-trigger ${isCategoryMenuOpen ? "qp-open" : ""}`}
                  aria-label={t('filterByCategory')}
                  aria-haspopup="listbox"
                  aria-expanded={isCategoryMenuOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsCategoryMenuOpen((open) => !open);
                  }}
                >
                  <span className="qp-category-trigger-label">{selectedCategoryLabel}</span>
                  <ChevronDown className="qp-category-trigger-icon" aria-hidden="true" />
                </button>

                {isCategoryMenuOpen && (
                  <div className="qp-category-menu" role="listbox" aria-label={t('filterByCategory')}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={!selectedCategoryId}
                      className={`qp-category-option ${!selectedCategoryId ? "qp-selected" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectCategory(null);
                      }}
                    >
                      <span className="qp-category-option-label">{t('allCategories')}</span>
                      {!selectedCategoryId && <Check className="qp-category-option-check" aria-hidden="true" />}
                    </button>

                    {categories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        role="option"
                        aria-selected={selectedCategoryId === category.id}
                        className={`qp-category-option ${selectedCategoryId === category.id ? "qp-selected" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectCategory(category.id);
                        }}
                      >
                        <span
                          className="qp-category-option-dot"
                          style={{ backgroundColor: category.color || "#6366f1" }}
                          aria-hidden="true"
                        />
                        <span className="qp-category-option-label">{category.name}</span>
                        {selectedCategoryId === category.id && <Check className="qp-category-option-check" aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
                const characterCount = countPromptCharacters(prompt.content || "");
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
                        aria-label={t('copyPrompt')}
                      >
                        {copiedId === prompt.id ? (
                          <Check className="qp-copy-icon" aria-hidden="true" />
                        ) : (
                          <Copy className="qp-copy-icon" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    <div className={`qp-prompt-body ${prompt.promptSourcePreviewDataUrl ? 'qp-has-prompt-source-preview' : ''}`}>
                      <div className="qp-prompt-content">
                        <div className="qp-prompt-preview">{prompt.content}</div>
                        <PromptAttachmentPreview attachments={prompt.attachments} />
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
                          <span
                            className="qp-character-count"
                            title={`${t('promptCharacterCount')}: ${t('promptCharacterCountValue', [characterCount.toString()])}`}
                          >
                            {t('promptCharacterCountValue', [characterCount.toString()])}
                          </span>
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
                      {prompt.promptSourcePreviewDataUrl && (
                        <img
                          src={prompt.promptSourcePreviewDataUrl}
                          alt={t('promptSourceUrlPreviewAlt')}
                          className="qp-prompt-source-preview-img"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <div className="qp-empty-state">
              <SearchX className="qp-empty-icon" aria-hidden="true" />
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
  onCloseCallback?: () => void,
  options: { removePromptTrigger?: boolean } = {}
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

  // 阻止容器获得焦点（焦点应该在内部 input 上）
  container.setAttribute("tabindex", "-1");

  // 阻止容器的 focus 事件冒泡到页面，防止网站抢夺焦点
  container.addEventListener("focus", (e) => {
    e.stopPropagation();
  }, true);

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
    const { prompts, targetElement, onClose, removePromptTrigger } = props;
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
      const searchInput = shadowRoot.querySelector(
        ".qp-search-input"
      ) as HTMLInputElement;

      // 聚焦搜索框，但只在焦点尚未移动到其他元素时
      const focusInputIfNotMoved = () => {
        if (searchInput) {
          // 只有当焦点还未移动到 shadow DOM 内其他元素时才聚焦
          const activeElement = shadowRoot.activeElement;
          if (!activeElement || activeElement === searchInput) {
            searchInput.focus();
          }
        }
      };

      // 立即尝试
      focusInputIfNotMoved();
      // 延迟再试一次，确保元素已挂载
      const timer1 = setTimeout(focusInputIfNotMoved, 50);
      const timer2 = setTimeout(focusInputIfNotMoved, 100);

      // 焦点保护：当焦点被外部抢走时恢复
      // 只在焦点移到 shadow DOM 外部时才恢复
      const handleFocusOut: EventListener = () => {
        // 延迟检查，让焦点有时间稳定
        setTimeout(() => {
          // 如果 modal 还存在，且焦点不在 shadow DOM 内
          if (searchInput?.isConnected) {
            // 检查页面是否还有焦点（排除浏览器地址栏、DevTools 等情况）
            if (!document.hasFocus()) {
              return;
            }
            const activeElement = shadowRoot.activeElement;
            if (!activeElement) {
              // 焦点不在 shadow DOM 内，恢复焦点
              searchInput.focus();
            }
          }
        }, 0);
      };

      // 监听 shadowRoot 的 focusout 事件
      shadowRoot.addEventListener("focusout", handleFocusOut, true);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        shadowRoot.removeEventListener("focusout", handleFocusOut, true);
      };
    }, []);

    return (
      <PromptSelector
        prompts={prompts}
        targetElement={targetElement}
        onClose={onClose}
        removePromptTrigger={removePromptTrigger}
      />
    );
  };

  // 渲染组件
  const root = createRoot(rootElement);
  root.render(
    <ShadowDomWrapper
      prompts={prompts}
      targetElement={targetElement}
      removePromptTrigger={options.removePromptTrigger}
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
