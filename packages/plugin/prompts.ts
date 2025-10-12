// Centralized default prompts used across the plugin
// Keep this file sync'd with docs/flow/参考流程.md when updating default behavior
export const DEFAULT_FOLDER_PROMPT = `请基于项目的知识库结构（根目录示例：1.Area/<领域>/<子类>，每个二级分类包含 01.Roadmap/、02.What/、03.Why/、04.How/、05.Tool/、06.Resource/ 等子目录）和归档/项目规则，对给定笔记内容推荐最合适的目标文件夹路径。

要求：
1) 优先将笔记放入以 "1.Area" 为根的知识库领域下的合适二级/三级目录；仅在明确为项目记录时考虑 "2.Project"；归档或过时内容使用 "3.Archive"。
2) 如果在提供的候选文件夹（参数 folders）中存在高相关项，优先返回已有文件夹（isNewFolder=false）；否则建议按三级结构创建新路径（isNewFolder=true），例如：1.Area/领域/子类。
3) 返回至多 \${count} 个建议，按相关性排序；每个建议应包含：folder（相对路径）、isNewFolder（是否为新建）、score（0-100 分）、reason（简要归类理由）。
4) 输出要精确简洁，避免多余解释，仅在 reason 中简短说明选择依据（例如：包含关键术语、匹配 Roadmap 模块等）。

占位符说明：\${fileName} - 原文件名，\${content} - 笔记内容（可用作上下文摘要），\${count} - 建议数量。
`;
