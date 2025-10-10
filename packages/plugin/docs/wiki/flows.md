# File Organizer 2000 — 执行流程文档

本文档列出了插件主要功能的执行流程，并使用 Mermaid 图展示每个流程的关键步骤，便于阅读与维护。

---

## 目录

- Tags 生成流程
- Title（标题/重命名）生成流程
- Folder（文件夹）建议与移动流程
- 内容格式化（流式 & 覆盖/新文件）流程
- PDF 文本提取流程
- 音频转录流程
- Inbox（收件箱）入站处理流程
- 备份与移动文件流程

---

## Tags 生成流程

流程说明：当用户在 Assistant 侧边打开或刷新笔记时，插件会读取笔记内容并调用 AIService.generateTags。AI 返回带分数和理由的标签，UI 将其展示给用户，用户可以选择将标签写入 frontmatter 或插入文中。

```mermaid
flowchart TD
  A["打开笔记 / Assistant 刷新"] --> B{"是否被忽略文件夹?"}
  B -- 否 --> C["读取笔记内容"]
  C --> D["调用 AIService.generateTags(content, filename)"]
  D --> E{"AI 返回"}
  E -->|"成功"| F["在 UI（SimilarTags）展示建议"]
  F --> G{"用户操作"}
  G -->|"接受"| H["写入 frontmatter 或 插入标签"]
  G -->|"忽略"| I["不操作"]
  E -->|"失败"| J["Logger 记录 & 显示错误提示"]
```

---

## Title（标题/重命名）生成流程

流程说明：用户启用标题建议后或在重命名场景，插件会调用 AI 生成候选标题，展示给用户并可选择重命名。

```mermaid
flowchart TD
  A["用户请求/Assistant 刷新"] --> B["读取文件内容 & 文件名"]
  B --> C["调用 AIService.generateTitle(content, filename)"]
  C --> D{"AI 返回"}
  D -->|"成功"| E["在 UI 展示候选标题（RenameSuggestion）"]
  E --> F{"用户选择"}
  F -->|"采纳"| G["调用 vault.rename(file, newName)"]
  F -->|"拒绝"| H["无更改"]
  D -->|"失败"| I["记录错误并提示"]
```

---

## Folder（文件夹）建议与移动流程

流程说明：AI 基于内容与仓库可用文件夹建议目标文件夹。用户可以接受建议，插件会创建文件夹（如需要）并移动文件。

```mermaid
flowchart TD
  A["Assistant 刷新或用户请求"] --> B["收集 content, fileName, folders list"]
  B --> C["调用 AIService.generateFolder(content,fileName,folders)"]
  C --> D{"AI 返回"}
  D -->|"成功"| E["在 UI（SimilarFolderBox）展示建议"]
  E --> F{"用户采纳"}
  F -->|"采纳"| G["ensureFolderExists(targetFolder)"]
  G --> H["moveFile(file, targetFolder)"]
  H --> I["更新索引/创建备份（如需要）"]
  F -->|"忽略"| J["保持原地"]
  D -->|"失败"| K["记录 & 提示"]
```

---

## 内容格式化（流式 & 覆盖/新文件）流程

流程说明：用户触发格式化（split view 或 current note），插件向后端发起流式请求，边接收流边写入文件（或新文件），最后完成并展示结果。

```mermaid
flowchart TD
  A["用户触发格式化（split view 或 当前笔记）"] --> B["读取 content & formattingInstruction"]
  B --> C["创建 newFile (如果 split view)"]
  C --> D["调用 formatStream(content,instruction,serverUrl,apiKey,updateCallback)"]
  D --> E{"接收流式 chunk"}
  E --> F["updateCallback -> modify(newFile 或 current file)"]
  E --> G{"流结束"}
  G --> H["显示完成 Notice & 追加备份链接（如覆盖 current）"]
  D -->|"失败"| I["记录错误 & 通知"]
```

---

## PDF 文本提取流程

流程说明：当文件是 PDF 且需要提取时，插件使用 pdf.js 读取二进制并提取（默认最多前 10 页以节省时间）。

```mermaid
flowchart TD
  A["检测到 PDF 文件"] --> B["调用 loadPdfJs()"]
  B --> C["读取文件二进制 app.vault.readBinary(file)"]
  C --> D["pdfjsLib.getDocument({"data: bytes"}).promise"]
  D --> E["循环页 (1..min(numPages,10)) 获取 page.getTextContent()"]
  E --> F["拼接文本并返回"]
  D -->|"失败"| G["记录错误 & 返回空字符串"]
```

---

## 音频转录流程

流程说明：当用户对文中嵌入的音频请求转录或将音频放入 Inbox，插件会把音频二进制发送到转录服务（FormData），并接收文本结果。

```mermaid
flowchart TD
  A["检测到音频嵌入或用户请求转录"] --> B["读取音频二进制"]
  B --> C["构建 FormData(audio blob, fileExtension)"]
  C --> D["POST 到 转录服务 URL (带 Authorization)"]
  D --> E{"服务响应"}
  E -->|"成功"| F["接收转录文本并插入或返回给 UI"]
  E -->|"失败"| G["记录 & 显示错误"]
```

---

## Inbox（收件箱）入站处理流程

流程说明：文件放入 `pathToWatch`（Inbox），插件/队列会监控并把文件放入处理队列，按策略执行解析/AI 建议/移动/备份等步骤。

```mermaid
flowchart TD
  A["文件放入 Inbox pathToWatch"] --> B["inbox/queue 监控 detect new file"]
  B --> C["validateFile(file)"]
  C -->|"通过"| D["enqueue(file)"]
  D --> E["队列 worker 取出并处理"]
  E --> F["提取文本 (pdf/img/audio) -> 生成 tags/titles/folders -> move/create backup"]
  F --> G["处理结果写入目标文件夹 & 更新记录"]
  C -->|"不通过"| H["移动到 bypassed 或 error 路径并记录"]
```

---

## 备份与移动文件流程

流程说明：在覆盖当前笔记格式化或移动文件时，会先创建备份文件并在原文件末尾追加指向备份的链接。

```mermaid
flowchart TD
  A["准备覆盖或移动文件"] --> B["create backup file backupFile = vault.create(path, originalContent)"]
  B --> C["对目标文件执行 modify 或 move"]
  C --> D["在原文件末尾 append 链接到 backupFile"]
  D --> E["记录日志并返回成功 Notice"]
  C -->|"失败"| F["还原或记录错误"]
```

---

# 结束语

该文档旨在为开发者与维护者快速了解每个关键功能的执行路径与边界。若希望我把更多 UI 组件（例如 `views/assistant/organizer/components/*` 下的每个子组件）也绘制更细粒度的流程图，我可以继续扩展。
