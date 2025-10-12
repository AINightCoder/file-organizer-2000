// Centralized default prompts used across the plugin
// Keep this file sync'd with docs/flow/参考流程.md when updating default behavior
// Centralized default prompts used across the plugin
// Keep this file sync'd with docs/flow/参考流程.md when updating default behavior

export const DEFAULT_ATOMIC_SPLIT_PROMPT = `分析以下笔记内容，按照单一知识点原则拆分成独立的原子化笔记。\n\n要求：\n1. 每个笔记专注一个核心概念或知识点\n2. 保持每个笔记的语义完整性和独立性\n3. 为每个笔记提供清晰的标题和知识点说明\n4. 如果内容本身已经是单一知识点，返回包含原内容的单个笔记\n\n原文件名：\${filename}\n\n笔记内容：\n\${content}`;

export const DEFAULT_LENGTH_SPLIT_PROMPT = `将以下内容在保持语义完整的前提下，按段落边界拆分为多个片段，每个片段不超过 \${maxLength} 字符。\n\n要求：\n1. 在段落或章节边界处拆分\n2. 保持每个片段的上下文连贯性\n3. 避免在句子中间截断\n4. 如果某个段落本身超过限制，在合适的句子边界拆分\n\n内容：\n\${content}`;

export const DEFAULT_CLASSIFY_PROMPT = `根据笔记内容，从给定的模板列表中选择最合适的文档类型。\n\n可用模板：\${templateNames}\n\n笔记内容：\n\${content}`;

export const DEFAULT_RENAME_INSTRUCTIONS = `If document has a human readable name, use it. Otherwise, create a concise, descriptive name for the document based on its key content. Prioritize clarity and searchability, using specific terms that will make the document easy to find later. Avoid generic words and focus on unique, identifying elements.`;

export const DEFAULT_ENHANCED_METADATA_PROMPT = `分析以下笔记内容，生成结构化的元数据。\n\n要求：\n1. 标题(title): 简洁清晰，概括核心内容\n2. 一级分类(category): 如技术、生活、工作、学习等\n3. 二级分类(subcategory): 更细致的分类，可选\n4. 标签(tags): 3-5个相关标签，便于检索\n5. 摘要(summary): 100字以内的内容概括\n6. 来源(source): 如有明确来源信息请提取，可选\n7. 可信度(credibility): 1-5分评估内容可信度，可选\n\n\${categoriesHint}\n\n原文件名: \${filename}\n\n笔记内容:\n\${content}`;

export const DEFAULT_OPTIMIZE_PROMPT = `请将下面的笔记内容优化为高质量的 Markdown 教学/参考笔记：\n\n要求：\n1. 保持语义完整，提取并放大核心要点；\n2. 统一并优化标题、层级结构（使用合理的 H1-H3）；\n3. 提取摘要（100 字内），并在开头插入；\n4. 修复明显的语法和事实性错误；\n5. 如内容为非中文，请翻译为地道中文；\n6. 保留并正确格式化代码块、表格、引用和列表；\n7. 对长段落进行适当分段，并在必要处添加小结或步骤列表；\n8. 输出为纯 Markdown 文本，不添加多余的注释或说明。\n\n占位符说明：\${filename} - 文件名，\${content} - 原始内容\n\n原始内容：\n\${content}`;

export const DEFAULT_TAG_INSTRUCTIONS = `Generate tags that capture the main topics, themes, and type of content in the document. Focus on specific, meaningful tags that will help with organization and retrieval.`;

export const DEFAULT_IMAGE_INSTRUCTIONS = `Analyze the image and provide a clear, detailed description focusing on the main elements, context, and any text visible in the image. Include relevant details that would be useful for searching and organizing the image later.`;

export const DEFAULT_FOLDER_PROMPT = `请基于项目的知识库结构（根目录示例：1.Area/<领域>/<子类>，每个二级分类包含 01.Roadmap/、02.What/、03.Why/、04.How/、05.Tool/、06.Resource/ 等子目录）和归档/项目规则，对给定笔记内容推荐最合适的目标文件夹路径。\n\n要求：\n1) 优先将笔记放入以 "1.Area" 为根的知识库领域下的合适二级/三级目录；仅在明确为项目记录时考虑 "2.Project"；归档或过时内容使用 "3.Archive"。\n2) 如果在提供的候选文件夹（参数 folders）中存在高相关项，优先返回已有文件夹（isNewFolder=false）；否则建议按三级结构创建新路径（isNewFolder=true），例如：1.Area/领域/子类。\n3) 返回至多 \${count} 个建议，按相关性排序；每个建议应包含：folder（相对路径）、isNewFolder（是否为新建）、score（0-100 分）、reason（简要归类理由）。\n4) 输出要精确简洁，避免多余解释，仅在 reason 中简短说明选择依据（例如：包含关键术语、匹配 Roadmap 模块等）。\n\n占位符说明：\${fileName} - 原文件名，\${content} - 笔记内容（可用作上下文摘要），\${count} - 建议数量。\n`;

export const DEFAULT_ROADMAP_PROMPT = `我想系统性地学习【领域名称】，您是这个领域中拥有超过20年经验的顶尖专家和资深教育家。你不仅精通该领域的全部理论知识和前沿动态，更擅长将复杂庞大的知识体系，为不同阶段的学习者设计出清晰、高效、循序渐进的学习路径。请为我设计一个完整的学习路线图。\n\n## 任务要求：\n1. 将学习内容分为初级、中级、高级三个层次\n2. 每个层次列出3-5个核心知识模块\n3. 每个模块包含3-5个关键知识点\n4. 提供学习时间估算和前置要求\n5. 推荐1-2个该层次的优质学习资源\n\n## 输出格式：\n\n### 🎯 领域概览\n- **简介**: 该领域的定义和特点\n- **应用场景**: 主要应用场景和发展趋势\n- **学习目标**：[简述掌握该领域后能达到的能力水平]\n- **总学习周期**：[预估完整学习所需时间]\n\n### 📚 初级（入门基础）\n**学习目标**：[该阶段要达到的具体能力]\n**预计时间**：[学习时间估算]\n**前置要求**：[需要具备的基础知识]\n\n#### 1.[模块名称]\n- **知识点1：[具体知识点]**\n\n- **知识点2：[具体知识点]**\n\n- **知识点3：[具体知识点]**\n\n#### 2.[模块名称]\n- **知识点1：[具体知识点]**\n\n- **知识点2：[具体知识点]**\n\n[继续其他模块...]\n\n**推荐资源**：\n- [资源1名称]：[简要说明]\n- [资源2名称]：[简要说明]\n\n### 🚀 中级（进阶提升）\n[按相同格式展开]\n\n### 🎓 高级（专业精通）\n[按相同格式展开]\n\n### 💡 学习建议\n1. **学习顺序**：[建议的学习路径]\n2. **实践项目**：[每个阶段建议的实践项目]\n3. **评估标准**：[如何判断是否掌握该阶段内容]\n4. **常见误区**：[学习过程中需要避免的问题]\n\n### 输出要求：\n1. 内容要具体详实，避免空泛的建议\n2. 提供可操作的学习步骤和方法\n3. 包含具体的资源推荐和工具建议\n\n现在请根据给定领域生成具体的学习路线图。`;

