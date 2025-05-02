# Quick Prompt

[English](./README_en.md) | 中文

一个强大的浏览器扩展，专注于提示词管理与快速输入。帮助用户创建、管理和组织提示词库，并在任何网页输入框中快速插入预设的 Prompt 内容，提高工作效率。

## ✨ 功能特性

- 📚 **提示词管理**：便捷地创建、编辑和管理你的提示词库
- 🚀 **快速输入**：在任何网页输入框中通过 `/p` 快速触发提示词选择器
- ⌨️ 支持快捷键（Ctrl+Shift+P / Command+Shift+P）打开提示词选择器
- 🎯 支持自定义提示词，包括标题、内容和标签
- 🔍 搜索和过滤提示词功能
- 🌙 自动适应系统的明暗主题

## 🚀 使用方法

1. **快速触发**：在任何网页的文本输入框中输入 `/p` 以触发提示词选择器
2. **快捷键**：使用 `Ctrl+Shift+P`（Windows/Linux）或 `Command+Shift+P`（macOS）打开提示词选择器
3. **选择提示词**：从弹出的选择器中点击所需的提示词，它将自动插入到当前输入框中
4. **管理提示词**：通过右键点击扩展图标并选择"选项"来添加、编辑或删除提示词

## ⚙️ 自定义配置

1. 点击扩展图标，然后点击"管理提示词"按钮
2. 在选项页面，你可以:
   - 添加新的提示词
   - 编辑现有提示词
   - 删除不需要的提示词
   - 为提示词添加标签进行分类

## 📦 安装指南

### 从应用商店安装

_即将推出_

### 从源码构建

1. 克隆仓库
   ```bash
   git clone <仓库URL>
   cd quick-prompt
   ```

2. 安装依赖
   ```bash
   pnpm install
   ```

3. 开发和构建
   ```bash
   # 开发模式 (Chrome)
   pnpm dev
   
   # 开发模式 (Firefox)
   pnpm dev:firefox
   
   # 构建扩展 (Chrome)
   pnpm build
   
   # 构建扩展 (Firefox)
   pnpm build:firefox
   ```

### 安装已构建的扩展

#### Chrome / Edge
1. 打开扩展管理页面 (`chrome://extensions` 或 `edge://extensions`)
2. 启用"开发者模式"
3. 点击"加载已解压的扩展"
4. 选择项目的 `.output/chrome-mv3/` 目录

#### Firefox
1. 打开 `about:debugging`
2. 点击"此 Firefox"
3. 点击"临时加载附加组件"
4. 选择项目的 `.output/firefox-mv2/` 目录中的 `manifest.json` 文件

## 📄 许可证

MIT

## 🤝 贡献指南

欢迎提交 Pull Requests 和 Issues！

1. Fork 这个仓库
2. 创建你的功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交你的更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开一个 Pull Request
