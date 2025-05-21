import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { PromptItem, EditableElement } from "../index";
import { getPromptSelectorStyles } from "../utils/styles";
import { extractVariables, replaceVariables } from "../utils/variableParser";

// 检测系统是否为暗黑模式的函数
const isDarkMode = () => {
  return (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
};

interface VariableInputProps {
  prompt: PromptItem;
  targetElement: EditableElement;
  onCancel: () => void;
  onSubmit: (processedContent: string) => void;
  isDark?: boolean;
}

// 变量输入样式
const getVariableInputStyles = (): string => {
  // 复用已有的基础样式，添加变量输入特定的样式
  const baseStyles = getPromptSelectorStyles();
  const additionalStyles = `
    /* 重置h3标签样式 */
    .qp-modal-header h3 {
      font-size: 16px !important;
      font-weight: 600 !important;
      color: white !important;
      margin: 0 !important;
      padding: 0 !important;
      line-height: 1.5 !important;
    }

    /* 变量输入表单样式 */
    .qp-variable-form {
      display: flex !important;
      flex-direction: column !important;
      padding: 15px 20px !important;
      flex: 1 !important;
      overflow-y: auto !important;
    }
    
    .qp-variable-title {
      font-size: 16px !important;
      font-weight: 600 !important;
      margin-bottom: 12px !important;
      color: var(--qp-text-primary) !important;
    }
    
    .qp-variable-description {
      font-size: 14px !important;
      color: var(--qp-text-secondary) !important;
      margin-bottom: 16px !important;
      line-height: 1.5 !important;
    }
    
    .qp-form-group {
      display: flex !important;
      flex-direction: column !important;
      margin-bottom: 16px !important;
    }
    
    .qp-form-label {
      display: block !important;
      font-weight: 500 !important;
      margin-bottom: 6px !important;
      color: var(--qp-text-primary) !important;
      font-size: 14px !important;
    }
    
    .qp-form-input {
      width: 100% !important;
      padding: 10px 12px !important;
      border-radius: 6px !important;
      border: 1px solid var(--qp-border-color) !important;
      background-color: var(--qp-bg-primary) !important;
      color: var(--qp-text-primary) !important;
      font-size: 14px !important;
      transition: border-color 0.15s ease-in-out !important;
      box-shadow: none !important;
      outline: none !important;
    }
    
    .qp-form-input:focus {
      border-color: var(--qp-accent) !important;
      box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.2) !important;
    }
    
    .qp-preview {
      margin-top: 20px !important;
      border-top: 1px solid var(--qp-border-color) !important;
      padding-top: 16px !important;
    }
    
    .qp-preview-title {
      font-weight: 600 !important;
      margin-bottom: 8px !important;
      color: var(--qp-text-primary) !important;
      font-size: 14px !important;
    }
    
    .qp-preview-content {
      padding: 12px !important;
      background-color: var(--qp-bg-secondary) !important;
      border-radius: 6px !important;
      font-size: 14px !important;
      color: var(--qp-text-primary) !important;
      white-space: pre-wrap !important;
      max-height: 150px !important;
      overflow-y: auto !important;
      font-family: monospace !important;
      line-height: 1.5 !important;
    }
    
    .qp-highlighted {
      background-color: var(--qp-bg-tag) !important;
      color: var(--qp-text-tag) !important;
      padding: 0 2px !important;
      border-radius: 2px !important;
    }

    /* 暗黑模式特定样式覆盖 */
    :host([data-theme="dark"]) .qp-form-input {
      background-color: var(--qp-bg-secondary) !important;
      border-color: var(--qp-border-color) !important;
    }

    :host([data-theme="dark"]) .qp-form-input:focus {
      border-color: var(--qp-accent) !important;
      box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.3) !important;
    }

    :host([data-theme="dark"]) .qp-preview-content {
      background-color: var(--qp-bg-secondary) !important;
      border: 1px solid var(--qp-border-color) !important;
    }
  `;
  
  return baseStyles + additionalStyles;
};

const VariableInput: React.FC<VariableInputProps> = ({
  prompt,
  targetElement,
  onCancel,
  onSubmit,
  isDark = false,
}) => {
  // 检查并提取变量
  const variables = prompt._variables || extractVariables(prompt.content);
  
  // 变量值的状态
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    Object.fromEntries(variables.map(v => [v, '']))
  );
  
  // 预览状态
  const [previewContent, setPreviewContent] = useState(prompt.content);
  const firstInputRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  
  // 更新变量值和预览
  const handleVariableChange = (variable: string, value: string) => {
    const newValues = { ...variableValues, [variable]: value };
    setVariableValues(newValues);
    
    // 更新预览内容
    const newContent = replaceVariables(prompt.content, newValues);
    setPreviewContent(newContent);
  };
  
  // 提交表单
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // 替换所有变量并调用提交回调
    const processedContent = replaceVariables(prompt.content, variableValues);
    onSubmit(processedContent);
  };
  
  // 组件挂载时聚焦第一个输入框
  useEffect(() => {
    setTimeout(() => {
      if (firstInputRef.current) {
        firstInputRef.current.focus();
      }
    }, 100);
  }, []);
  
  // 如果没有变量，直接提交
  useEffect(() => {
    if (variables.length === 0) {
      onSubmit(prompt.content);
    }
  }, [prompt.content, variables.length]);

  // 键盘快捷键处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 阻止事件冒泡
      e.stopPropagation();
      
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        // 提交表单
        formRef.current?.dispatchEvent(
          new Event("submit", { cancelable: true, bubbles: true })
        );
      }
    };
    
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel]);
  
  // 点击背景关闭弹窗
  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };
  
  // 高亮显示预览中的变量
  const renderHighlightedPreview = () => {
    if (!prompt.content) return null;
    
    // 使用正则表达式查找所有变量并替换为高亮版本
    const parts = prompt.content.split(/(\{\{[^{}]+\}\})/g);
    
    return parts.map((part, index) => {
      // 检查是否为变量格式 {{变量名}}
      const varMatch = part.match(/^\{\{([^{}]+)\}\}$/);
      
      if (varMatch) {
        const varName = varMatch[1];
        const value = variableValues[varName] || '';
        const displayText = value || varName;
        
        return (
          <span key={index} className="qp-highlighted">
            {value ? displayText : `{{${displayText}}}`}
          </span>
        );
      }
      
      return <span key={index}>{part}</span>;
    });
  };
  
  return (
    <div
      className="qp-fixed qp-inset-0 qp-flex qp-items-center qp-justify-center qp-z-50 qp-modal-container"
      onClick={handleBackgroundClick}
      data-theme={isDark ? "dark" : "light"}
    >
      <div className="qp-flex qp-flex-col qp-modal">
        <div className="qp-modal-header">
          <div className="qp-w-full">
            <h3>填写变量值</h3>
          </div>
        </div>
        
        <div className="qp-modal-content">
          <form ref={formRef} className="qp-variable-form" onSubmit={handleSubmit}>
            <div className="qp-variable-title">{prompt.title}</div>
            <div className="qp-variable-description">
              请为以下变量填写对应的值，填写完成后将自动替换提示词中的变量。
            </div>
            
            {variables.map((variable, index) => (
              <div key={variable} className="qp-form-group">
                <label className="qp-form-label" htmlFor={`var-${variable}`}>
                  {variable}
                </label>
                <textarea
                  ref={index === 0 ? firstInputRef : null}
                  id={`var-${variable}`}
                  className="qp-form-input"
                  value={variableValues[variable]}
                  onChange={(e) => handleVariableChange(variable, e.target.value)}
                  placeholder={`请输入${variable}的值`}
                  rows={1}
                />
              </div>
            ))}
            
            <div className="qp-preview">
              <div className="qp-preview-title">预览</div>
              <div className="qp-preview-content">{renderHighlightedPreview()}</div>
            </div>
          </form>
        </div>
        
        <div className="qp-modal-footer">
          <span>共 {variables.length} 个变量</span>
          <span>Esc 取消 · Ctrl+Enter 确认</span>
        </div>
      </div>
    </div>
  );
};

// 显示变量输入弹窗
export function showVariableInput(
  prompt: PromptItem,
  targetElement: EditableElement,
  onConfirm: (processedContent: string) => void,
  onCancel: () => void
): HTMLElement {
  // 移除任何已存在的弹窗
  const existingContainer = document.getElementById("quick-prompt-variable-input");
  if (existingContainer) {
    document.body.removeChild(existingContainer);
  }
  
  // 创建新容器并添加shadow root
  const container = document.createElement("div");
  container.id = "quick-prompt-variable-input";
  
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
  style.textContent = getVariableInputStyles();
  shadowRoot.appendChild(style);
  
  // 创建根容器
  const rootElement = document.createElement("div");
  rootElement.id = "quick-prompt-variable-root";
  shadowRoot.appendChild(rootElement);
  
  // 添加到documentElement（html元素），而不是body
  document.documentElement.appendChild(container);

  // 创建包装组件来处理暗黑模式
  const ThemeWrapper = () => {
    const [isDark, setIsDark] = useState(isDarkMode());

    useEffect(() => {
      // 设置初始主题
      if (shadowRoot.host) {
        shadowRoot.host.setAttribute("data-theme", isDark ? "dark" : "light");
      }

      // 监听系统主题变化
      const darkModeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: MediaQueryListEvent) => {
        setIsDark(e.matches);
        if (shadowRoot.host) {
          shadowRoot.host.setAttribute("data-theme", e.matches ? "dark" : "light");
        }
      };

      if (darkModeMediaQuery.addEventListener) {
        darkModeMediaQuery.addEventListener("change", handleChange);
        return () => darkModeMediaQuery.removeEventListener("change", handleChange);
      }
    }, []);

    return (
      <VariableInput
        prompt={prompt}
        targetElement={targetElement}
        isDark={isDark}
        onCancel={() => {
          onCancel();
          root.unmount();
          if (document.documentElement.contains(container)) {
            document.documentElement.removeChild(container);
          }
        }}
        onSubmit={(processedContent) => {
          onConfirm(processedContent);
          root.unmount();
          if (document.documentElement.contains(container)) {
            document.documentElement.removeChild(container);
          }
        }}
      />
    );
  };
  
  // 渲染组件
  const root = createRoot(rootElement);
  root.render(<ThemeWrapper />);
  
  // 返回容器元素
  return container;
} 