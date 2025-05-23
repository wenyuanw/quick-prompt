import { PromptItem } from "./types";

export const BROWSER_STORAGE_KEY = "userPrompts";

/**
 * 默认的prompt样例
 */
export const DEFAULT_PROMPTS: PromptItem[] = [
  {
    id: "default-ghibli",
    title: "吉卜力风格",
    content: "将图片转换为吉卜力风格",
    tags: ["画图", "吉卜力"],
    enabled: true,
  },
  {
    id: "default-code-explain",
    title: "代码解释",
    content: "请解释以下代码的功能和工作原理：\n\n",
    tags: ["编程"],
    enabled: true,
  },
  {
    id: "default-role-template",
    title: "开发角色",
    content: "你现在是一个{{角色}}，有着{{年限}}年的开发经验，擅长{{技能}}。",
    tags: ["编程", "变量"],
    enabled: true,
  },
];
