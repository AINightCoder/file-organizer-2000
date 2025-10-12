# AI 提示词配置说明

## 概述

本文档说明了 File Organizer 2000 插件中所有 AI 提示词的配置位置、使用方式和自定义方法。

## 提示词配置位置

所有提示词配置都在 `settings.ts` 的 `FileOrganizerSettings` 类中，按处理流程顺序排列：

### 步骤1: 原子化拆分提示词
- **配置项**: `atomicSplitPrompt`
- **使用场景**: 将长笔记按知识点拆分为多个原子化笔记
- **调用方法**: `aiService.splitIntoAtomicNotes()`
- **支持占位符**: 
  - `${filename}` - 原文件名
  - `${content}` - 笔记内容
- **默认值**: 见 `settings.ts`

### 步骤2: 按长度拆分提示词
- **配置项**: `lengthSplitPrompt`
- **使用场景**: 当单个笔记超过最大长度限制时，按段落边界智能拆分
- **调用方法**: `aiService.splitByLength()`
- **支持占位符**:
  - `${maxLength}` - 最大长度限制
  - `${content}` - 待拆分内容
- **默认值**: 见 `settings.ts`

### 步骤3: 内容分类提示词
- **配置项**: `classifyPrompt`
- **使用场景**: 根据内容将笔记分类到最合适的模板类型
- **调用方法**: `plugin.classifyContentV2()` (后端 API)
- **支持占位符**:
  - `${templateNames}` - 可用模板列表
  - `${content}` - 笔记内容
- **注意**: 此提示词由后端 `/api/classify1` 使用
- **默认值**: 见 `settings.ts`

### 步骤4: 文件重命名提示词
- **配置项**: `renameInstructions`
- **使用场景**: 为笔记生成更有意义的文件名
- **调用方法**: `plugin.recommendName()` → `aiService.generateTitle()`
- **传递方式**: 作为 `customInstructions` 参数
- **默认值**: 见 `settings.ts`

### 步骤5: 增强元数据生成提示词
- **配置项**: `enhancedMetadataPrompt`
- **使用场景**: 生成结构化的元数据（标题、分类、标签、摘要等）
- **调用方法**: `aiService.generateEnhancedMetadata()`
- **支持占位符**:
  - `${categoriesHint}` - 已有分类提示
  - `${filename}` - 文件名
  - `${content}` - 笔记内容
- **默认值**: 见 `settings.ts`

### 步骤7: 智能文件夹分类提示词
- **配置项**: `customFolderInstructions`
- **使用场景**: 推荐笔记应存放的文件夹
- **调用方法**: `plugin.recommendFolders()` → `aiService.generateFolder()`
- **传递方式**: 作为 `customInstructions` 参数
- **可选**: 可以为空字符串
- **默认值**: `""` (空)

### 步骤8: 标签推荐提示词
- **配置项**: `customTagInstructions`
- **使用场景**: 为笔记推荐相关标签
- **调用方法**: `plugin.recommendTags()` → `aiService.generateTags()`
- **传递方式**: 作为 `customInstructions` 参数
- **默认值**: 见 `settings.ts`

## 提示词优先级

### AIService 层面
1. 如果调用时传入 `customPrompt` 参数，优先使用传入的提示词
2. 否则使用 `this.config.*` (即 settings 中配置的提示词)
3. 如果 settings 中也没有配置，使用代码内置的默认提示词

### Plugin 调用层面
所有 `wiki-manager.tsx` 中的调用都不传 `customPrompt`，直接使用 settings 中的配置：

```typescript
// 步骤1: 原子化拆分
await plugin.aiService.splitIntoAtomicNotes({
  content: fileContent,
  filename: activeFile.basename,
  customPrompt: plugin.settings.atomicSplitPrompt  // 使用 settings
});

// 步骤2: 按长度拆分
await plugin.aiService.splitByLength({
  content: note.content,
  maxLength: plugin.settings.maxNoteLength
  // AIService 内部会使用 this.config.lengthSplitPrompt
});

// 步骤5: 元数据生成
await plugin.aiService.generateEnhancedMetadata({
  content,
  filename: currentFile.basename
  // AIService 内部会使用 this.config.enhancedMetadataPrompt
});
```

## 自定义提示词

### 通过设置界面修改

用户可以在插件设置的 "Advanced" 标签页中直接修改这些提示词配置（需要在设置界面中添加对应的输入框）。

### 通过测试界面修改

在 "Knowledge Test" 标签页中：
1. 点击 "自定义 AI 提示词" 展开提示词编辑区
2. 可以看到所有 8 个提示词的编辑框（按流程顺序排列）
3. 修改后点击 "💾 保存到设置" 将更新到 settings 中
4. 点击 "🔄 重置" 可以恢复为当前 settings 中的值
5. 测试时：
   - 开启自定义提示词开关：使用编辑框中的提示词
   - 关闭自定义提示词开关：使用 settings 中的提示词

### 通过代码修改

直接修改 `settings.ts` 中对应配置项的默认值：

```typescript
export class FileOrganizerSettings {
  // ...
  atomicSplitPrompt = '你的自定义提示词...';
  lengthSplitPrompt = '你的自定义提示词...';
  // ...
}
```

## 占位符使用说明

某些提示词支持占位符，在运行时会被替换为实际值：

### 占位符格式
使用 `${变量名}` 格式，例如：
```
原文件名：${filename}
笔记内容：
${content}
```

### 占位符替换逻辑

在 `ai_service.ts` 中，使用 JavaScript 的 `replace()` 方法替换：

```typescript
const prompt = promptTemplate
  .replace(/\${filename}/g, filename)
  .replace(/\${content}/g, content)
  .replace(/\${maxLength}/g, maxLength.toString());
```

### 自动上下文补充

如果自定义提示词中缺少必要的占位符（如 `${content}`），AIService 会自动在提示词末尾追加上下文信息，确保原始内容不会丢失。

## 测试提示词效果

### 单步测试
在 Knowledge Test 标签页中：
1. 修改测试内容和文件名
2. 自定义提示词（可选）
3. 点击 "🔬 测试拆分" 仅测试拆分功能

### 完整流程测试
1. 点击 "🎯 完整流程测试" 测试所有步骤
2. 查看日志了解每个步骤使用的提示词效果
3. 查看测试结果中的详细信息

### 真实处理测试
1. 点击 "✅ 真实处理测试" 创建实际文件并走完整处理流程
2. 文件会进入 Inbox 队列自动处理
3. 可在 Inbox Logs 中查看详细处理过程

## 最佳实践

### 1. 提示词编写原则
- 明确任务目标和要求
- 提供清晰的输出格式说明
- 使用具体的例子和约束条件
- 考虑边界情况的处理

### 2. 占位符使用
- 始终在提示词中包含 `${content}` 确保原始内容被处理
- 对于文件相关操作，包含 `${filename}` 提供上下文
- 使用清晰的占位符命名

### 3. 测试验证
- 修改提示词后先在测试界面验证效果
- 使用不同类型和长度的内容测试
- 查看日志确认提示词是否按预期工作

### 4. 版本控制
- 重要的提示词修改建议备份原始版本
- 可以使用测试界面的 "重置" 功能恢复默认值
- 在 settings.ts 中添加注释说明修改原因

## 常见问题

### Q: 为什么我的自定义提示词没有生效？
A: 检查以下几点：
1. 是否正确保存到 settings？
2. 占位符格式是否正确？（`${变量名}`）
3. 是否重启了插件？
4. 查看控制台日志确认提示词内容

### Q: 如何查看实际发送给 AI 的完整提示词？
A: 在 settings 中开启 `debugMode`，AIService 会在控制台打印完整的 prompt。

### Q: 某些步骤不想使用自定义提示词怎么办？
A: 
- 对于 `customInstructions` 类型的配置（rename, folder, tags），可以设为空字符串
- 对于完整 prompt 类型的配置，保持默认值或设为空让 AIService 使用内置默认值

### Q: 后端使用的提示词如何修改？
A: `classifyPrompt` 标记为"后端使用"，实际的提示词组合在后端代码中。前端的配置项仅作为文档说明。要真正修改需要访问后端代码。

## 相关文件

- `settings.ts` - 提示词配置定义
- `services/ai_service.ts` - 提示词使用和占位符替换
- `views/settings/knowledge-test-tab.tsx` - 提示词测试界面
- `views/assistant/wiki-manager.tsx` - 实际处理流程
- `index.ts` - Plugin 层面的调用封装

## 更新日志

- 2025-01-XX: 初始版本，添加所有 8 个步骤的提示词配置
- 统一使用 settings 中的配置作为提示词来源
- 在测试界面添加所有提示词的编辑功能
- 按流程顺序重新组织提示词配置
