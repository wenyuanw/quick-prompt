export type NewlineStrategy = "text" | "br";

type Rule = { pattern: RegExp; strategy: NewlineStrategy };

/**
 * 对于 ChatGPT 网页使用 br 换行
 * 
 * fix: https://github.com/wenyuanw/quick-prompt/issues/42
 */
const RULES: Rule[] = [
  { pattern: /chatgpt\.com/i, strategy: "br" },
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

export function setElementContentByStrategy(
  el: HTMLElement,
  text: string,
  strategy: NewlineStrategy
): void {
  if (strategy === "br") {
    const html = escapeHtml(text).replace(/\n/g, "<br>");
    (el as HTMLElement).innerHTML = html;
  } else {
    (el as HTMLElement).textContent = text;
  }
}

