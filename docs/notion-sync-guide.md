# Quick Prompt - Notion同步配置指南

本指南将帮助你设置Notion同步功能。通过这个功能，你可以在插件和Notion数据库之间同步你的提示词，实现云端备份、多设备同步等功能。

## 目录
1. [前期准备](#前期准备)
2. [基本配置](#基本配置)

## 前期准备

在开始配置之前，你需要完成以下准备工作：

### 1. 创建Notion集成（获取API密钥）

1. 访问[Notion官方集成页面](https://www.notion.so/my-integrations)
2. 点击"+ New integration"按钮
3. 填写集成名称（如"Quick Prompt Sync"）
4. 选择关联的工作区（你想同步到的工作区）, 并“save”
5. 在"Capabilities"部分，确保选择：
   - Read content
   - Update content
   - Insert content
6. 选择“No user information”, 并“save”
7. 记下生成的"Internal Integration Secret"（即API密钥）

### 2. 创建Notion数据库

1. 在你的Notion工作区中创建一个新页面
2. 在下方选择`Database`->`Empty database`

### 3. 连接数据库与集成

1. 在Notion中打开你刚创建的数据库
2. 点击右上角的"..."（更多选项）
3. 选择"Connections"
4. 找到并选择你刚创建的集成（如"Quick Prompt Sync"）
5. 记下数据库ID（在浏览器URL中，形式为`https://www.notion.so/xxx?v=yyy`中的`xxx`部分）

## 基本配置

完成前期准备后，在Quick Prompt插件中进行配置：

1. 打开Quick Prompt插件的选项页面
2. 导航到"Notion整合"选项卡
3. 填写以下信息：
   - **Notion API密钥**：粘贴你之前获取的"Internal Integration Secret"
   - **Notion数据库ID**：粘贴你之前记下的数据库ID
4. 点击"保存设置 & 测试连接"
5. 如果显示"连接成功"，说明配置正确

希望这份指南能帮助你顺利配置。如有更多问题，欢迎提交问题反馈。

> copy form: https://gist.github.com/Alphamancer/4d0b76311d71225ac1fb85d11e82cdef#file-notion-sync-guide-md