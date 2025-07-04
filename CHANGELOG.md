## [0.0.16] - 2025-06-24

### 优化
- 代码优化

### 修复
- 修复 Notion 同步

## [0.0.15] - 2025-06-23

### 新增
- 提示词支持备注字段，[issue#30](https://github.com/wenyuanw/quick-prompt/issues/30)

### 修复
- 修复Notion集成功能

## [0.0.14] - 2025-06-18

### 新增
- 提示词列表及选择器支持复制提示词内容，[issue#30](https://github.com/wenyuanw/quick-prompt/issues/30)

### 优化
- 部分界面样式优化

## [0.0.13] - 2025-06-12

### 新增
- i18n 支持
- 全局配置页面
  - 支持配置弹窗关闭行为
  - 配置快捷键（跳转至浏览器快捷键设置页面）

### 优化
- 界面优化

## [0.0.12] - 2025-05-31

### 优化
- 优化选项配置页面样式
- 优化快捷键配置提示

## [0.0.11] - 2025-05-26

### 新增
- **谷歌身份验证** [@Alphamancer](https://github.com/Alphamancer)
   - 支持用户通过Google账号登录

- **Notion API集成** [@Alphamancer](https://github.com/Alphamancer)
   - 实现提示词与Notion数据库双向同步
   - 支持从Notion导入提示词
   - 支持将本地提示词导出到Notion

## [0.0.10] - 2025-05-23

### 新增
- 提示词分类管理
- 提示词支持分类筛选

### 优化
- 优化变量输入框样式
- 优化提示词管理页面

## [0.0.9] - 2025-05-21

### 优化
- 变量输入框支持多行输入

## [0.0.8] - 2025-05-10

### 新增
- 提示词支持配置变量

### 优化
- `/p` 触发弹窗不区分大小写

## [0.0.7] - 2025-05-07

### 修复
- 修复右键插件图标打开选项小窗后无法删除的问题，[issue#5](https://github.com/wenyuanw/quick-prompt/issues/5)
- 修复提示词管理页面暗黑模式切换失败的问题


## [0.0.6] - 2025-05-06

### 修复
- 修复键盘导航后选项没有滚动至视口中，[issue#4](https://github.com/wenyuanw/quick-prompt/issues/4)

### 优化
- 优化键盘导航，防止鼠标导航冲突

## [0.0.5] - 2025-05-06

### 修复
- 修复打开提示词选取弹窗后没有聚焦至提示词搜索框，[issue#3](https://github.com/wenyuanw/quick-prompt/issues/3)
- 修复了豆包网页中无法使用的问题

### 已知问题
- 在豆包网页中，使用`/p`触发提示词选择器后部分输入框不会清除`/p`，**推荐设置快捷键触发提示词选择弹窗**。

## [0.0.4] - 2025-05-05

### 修复
- 修复了在部分网页中使用提示词选择器后输入框焦点丢失的问题
- 优化了提示词插入时的文本节点处理逻辑,提高了稳定性

### 其他改进
- 移除了生产环境中的 console.log 日志输出

### 已知问题
- 在豆包网页中存在兼容性问题,还在寻求解决方法 

## [0.0.3] - 2025-05-04

### 新增
- 支持从 URL 导入提示词

### 修复
- 优化提示词选择器组件样式，修复影响网页样式 bug

## [0.0.2] - 2025-05-04

### 新增
- 快捷键配置
- 界面优化

## [0.0.1] - 2025-05-02

### 🔄 现有功能

- 📚 提示词管理：创建、编辑和管理您的提示词库
- 🚀 快速输入：在任何网页输入框中通过 /p 快速触发提示词选择器
- ⌨️ 快捷键支持：使用键盘快捷键快速打开选择器 (Ctrl+Shift+P / Command+Shift+P)
- 📋 文本选择快捷保存：选中文本后使用快捷键保存 (Ctrl+Shift+S / Command+Shift+S)
- 📑 右键菜单保存：通过右键菜单将选中文本保存为提示词
- 🔍 提示词搜索：快速查找和过滤您的提示词
- 🌙 自适应主题：自动适应系统的明暗主题设置