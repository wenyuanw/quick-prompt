export type NewlineStrategy = "text" | "br" | "lexical";

type Rule = { pattern: RegExp; strategy: NewlineStrategy };

/**
 * 对于 ChatGPT 网页使用 br 换行
 * 对于 Kimi 网页使用 lexical 策略
 *
 * fix: https://github.com/wenyuanw/quick-prompt/issues/42
 */
const RULES: Rule[] = [
  { pattern: /chatgpt\.com/i, strategy: "br" },
  { pattern: /kimi\.com/i, strategy: "lexical" },
];

export function getNewlineStrategy(url: string): NewlineStrategy {
  const rule = RULES.find((r) => r.pattern.test(url));
  return rule ? rule.strategy : "text";
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 使用 execCommand 插入文本（适用于 Lexical 等富文本编辑器）
 * 这个方法会选择所有内容并替换为新文本
 */
function insertTextViaExecCommand(el: HTMLElement, text: string): boolean {
  try {
    // 确保元素获得焦点
    el.focus();

    // 选择所有内容
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    // 使用 execCommand 插入文本（这会触发 Lexical 的内部处理）
    // 注意：execCommand 已被标记为废弃，但仍然是与富文本编辑器交互的最可靠方式
    const success = document.execCommand('insertText', false, text);

    if (!success) {
      // 如果 execCommand 失败，尝试通过 InputEvent 触发
      // 先触发 beforeinput
      const beforeInputEvent = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text,
      });

      const notCancelled = el.dispatchEvent(beforeInputEvent);

      if (notCancelled) {
        // 删除选中的内容
        if (selection && selection.rangeCount > 0) {
          selection.deleteFromDocument();

          // 插入新文本节点
          const range = selection.getRangeAt(0);
          const textNode = document.createTextNode(text);
          range.insertNode(textNode);

          // 将光标移到文本末尾
          range.setStartAfter(textNode);
          range.setEndAfter(textNode);
          selection.removeAllRanges();
          selection.addRange(range);
        }

        // 触发 input 事件
        el.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: text,
        }));
      }
    }

    return true;
  } catch (error) {
    console.error('Failed to insert text via execCommand:', error);
    return false;
  }
}

/**
 * 检测是否为富文本编辑器（需要特殊处理的编辑器）
 * 包括：Lexical、ProseMirror、Slate 等
 */
export function isRichTextEditor(el: HTMLElement): boolean {
  // 检测 Lexical 编辑器
  if (el.getAttribute('data-lexical-editor') === 'true') {
    return true;
  }

  // 检测 ProseMirror 编辑器
  if (el.classList.contains('ProseMirror')) {
    return true;
  }

  // 检测 Slate 编辑器
  if (el.getAttribute('data-slate-editor') === 'true') {
    return true;
  }

  // 检测其他可能的富文本编辑器特征
  // 如果元素有 role="textbox" 且包含复杂的 DOM 结构，可能是富文本编辑器
  if (el.getAttribute('role') === 'textbox' && el.children.length > 0) {
    return true;
  }

  return false;
}

export function setElementContentByStrategy(
  el: HTMLElement,
  text: string,
  strategy: NewlineStrategy
): void {
  // 优先检测是否为富文本编辑器（自动检测，不依赖 URL 规则）
  if (strategy === "lexical" || isRichTextEditor(el)) {
    insertTextViaExecCommand(el, text);
  } else if (strategy === "br") {
    const html = escapeHtml(text).replace(/\n/g, "<br>");
    (el as HTMLElement).innerHTML = html;
  } else {
    (el as HTMLElement).textContent = text;
  }
}

