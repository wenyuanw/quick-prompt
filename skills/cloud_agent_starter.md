# Quick Prompt Cloud Agent Starter Skill

## 1) 先做这 5 件事（首次进仓库）

1. 安装依赖：`pnpm install`
2. 检查环境变量文件：`.env`（可从 `.env.example` 复制）
3. TypeScript 快速健康检查：`pnpm compile`
4. 启动 Chrome 开发构建：`pnpm dev`
5. 在浏览器加载扩展目录：`.output/chrome-mv3/`

> 备注：仓库默认带了 OAuth client 前缀兜底值，未配置真实值时，大多数非登录功能仍可开发与测试。

---

## 2) 登录 / 开关 / Mock 的最小实操规则

### 2.1 登录相关（Google / 第三方）

- 日常开发通常不需要先登录 Google。
- 涉及 `authenticateWithGoogle`、Notion、Gist 同步时，才需要真实凭据与网络。
- 无真实凭据时，不阻塞主流程：优先验证“错误提示与保护分支”是否正常（例如空 token、无 database id、401 返回）。

### 2.2 “功能开关”在本仓库里的实际形态

本仓库没有独立 feature-flag 服务，主要是存储开关：

- `notionSyncToNotionEnabled`（Notion 自动同步开关）
- `githubAutoSync` / `giteeAutoSync`（Gist 自动同步开关）
- `githubGistPublic` / `giteeGistPublic`（Gist 可见性）
- `globalSettings.closeModalOnOutsideClick`（通用 UI 行为开关）

优先通过 Options UI 切换开关；只有排障时再直接看 storage。

### 2.3 Mock 策略（Cloud agent 推荐）

- Gist 同步优先跑单测（已 mock `fetch`）：
  - `pnpm test:run tests/utils/gistSync.test.ts`
  - `pnpm test:run tests/utils/githubGistSync.test.ts`
  - `pnpm test:run tests/utils/giteeGistSync.test.ts`
- 远端联调前，先在 UI 验证无凭据/错误凭据路径。
- 非同步改动不必强依赖外部账号，避免把网络问题误判成代码问题。

---

## 3) 按代码区块执行与测试

## A. Content Script（`entrypoints/content/`）

### 启动

- 保持 `pnpm dev` 运行，刷新已加载扩展。
- 打开任意网页输入框（`input` / `textarea` / `contenteditable`）。

### 最小测试工作流

1. 输入 `/p`，应弹出 Prompt Selector。
2. 选择一个提示词，内容应回填到当前输入位置。
3. 选择含 `{{variable}}` 的提示词，应出现变量输入弹窗并替换变量。
4. 在 `contenteditable` 元素重复步骤 1-3，确认行为一致。

---

## B. Options / Popup（`entrypoints/options/` + `entrypoints/popup/`）

### 启动

- 通过扩展 popup 点击 “Manage Prompts” 进入 options。

### 最小测试工作流

1. Prompt CRUD：新增、编辑、删除一条 prompt。
2. Category 流程：新增分类并把 prompt 归到该分类。
3. 排序与状态：拖拽排序、启用/禁用、置顶状态检查。
4. Global Settings：切换语言与 `closeModalOnOutsideClick`。
5. Popup：确认提示词计数和快捷键提示能正常展示。

---

## C. Background / Browser Handlers（`entrypoints/background.ts`, `utils/browser/`）

### 最小测试工作流

1. 快捷键 `open-prompt-selector`：在活动页触发后，内容脚本应收到 `openPromptSelector` 消息。
2. 快捷键 `save-selected-prompt`：选中文本后触发，应打开 options 并携带 `?action=new&content=...`。
3. 右键菜单 `save-prompt`：与步骤 2 的预期一致。
4. 扩展重载后检查初始化：默认数据、分类迁移、菜单注册是否正常。

---

## D. 同步与认证（`utils/auth/`, `utils/sync/`, Integrations 页面）

### 无真实凭据（默认路径）

1. 跑编译：`pnpm compile`
2. 跑同步相关单测（见上方 Mock 策略）
3. 在 Integrations 页面输入空值或假值，验证报错与防护逻辑

### 有真实凭据（联调路径）

1. Notion：填 `notionApiKey` + `notionDatabaseId`，先 “Save & Test” 再点同步按钮。
2. Gist：填 GitHub/Gitee token，先 “Save & Test”，再执行 “Sync to Gist / Sync from Gist”。
3. 自动同步联动：打开 auto-sync 后修改本地 prompt，观察后台是否触发同步状态变化。

---

## 4) 常用命令速查（Cloud agent）

- 安装依赖：`pnpm install`
- Chrome dev：`pnpm dev`
- Firefox dev：`pnpm dev:firefox`
- 类型检查：`pnpm compile`
- 全量单测（如需）：`pnpm test:run`
- 打包：`pnpm build` / `pnpm build:firefox`

---

## 5) 新 runbook 经验沉淀：如何更新这个 skill

每次发现“新测试技巧 / 新排障手法 / 新环境坑位”，请直接补到对应代码区块，并保持最小可执行：

1. 在对应区块追加一个 `Troubleshooting` 小节（1-3 条即可）。
2. 每条都写成固定格式：`触发条件 -> 解决动作 -> 验证命令/现象`。
3. 如果是新外部依赖（账号、token、环境变量），同步更新“2) 登录 / 开关 / Mock”。
4. PR 描述里附一行“为什么这个经验值得沉淀”，避免文档膨胀。

目标：让下一个 Cloud agent 进入仓库后 5-10 分钟内能跑起来并拿到可复现测试结果。
