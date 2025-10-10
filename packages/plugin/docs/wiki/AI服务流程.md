# AI 服务流程

## 概述

File Organizer 2000 的 AI 服务负责提供智能推荐功能，包括标签推荐、文件名推荐、文件夹推荐和文档分类。本文档详细说明 AI 服务的架构和各个功能的执行流程。

## AI 服务架构

```mermaid
flowchart TB
    subgraph AIService ["AI 服务架构"]
        Config["配置"] --> Init["初始化"]
        Init --> ModelInit["初始化模型提供商"]
        
        ModelInit --> OpenAI["OpenAI"]
        ModelInit --> Anthropic["Anthropic/Claude"]
        ModelInit --> Google["Google/Gemini"]
        ModelInit --> DeepSeek["DeepSeek"]
        ModelInit --> Minimax["Minimax"]
        ModelInit --> SiliconFlow["SiliconFlow"]
        ModelInit --> Ollama["Ollama 本地"]
        
        OpenAI --> Models["模型字典"]
        Anthropic --> Models
        Google --> Models
        DeepSeek --> Models
        Minimax --> Models
        SiliconFlow --> Models
        Ollama --> Models
        
        Models --> SelectModel["选择模型"]
        SelectModel --> DefaultModel["默认模型"]
        
        DefaultModel --> Services["AI 服务"]
        
        Services --> TagService["标签推荐"]
        Services --> TitleService["标题推荐"]
        Services --> FolderService["文件夹推荐"]
    end
    
    style AIService fill:#f0f0f0
    style Config fill:#e1f5e1
    style Services fill:#d4edda
```

## AI 提供商配置

### 支持的提供商

| 提供商 | 配置项 | 默认模型 | 说明 |
|--------|--------|---------|------|
| OpenAI | `OPENAI_API_KEY`, `OPENAI_MODEL` | `gpt-4o` | OpenAI 官方 API |
| Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | `claude-3-5-sonnet-20240620` | Claude 系列模型 |
| Google | `GOOGLE_API_KEY`, `GOOGLE_MODEL` | `gemini-2.0-flash` | Gemini 系列模型 |
| DeepSeek | `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `DEEPSEEK_BASE_URL` | `deepseek-chat` | DeepSeek API |
| Minimax | `MINIMAX_API_KEY`, `MINIMAX_MODEL`, `MINIMAX_BASE_URL` | `minimax` | Minimax API |
| SiliconFlow | `SILICONFLOW_API_KEY`, `SILICONFLOW_MODEL`, `SILICONFLOW_BASE_URL` | `siliconflow` | SiliconFlow API |
| Ollama | `OLLAMA_MODEL`, `OLLAMA_BASE_URL` | `phi4` | 本地 Ollama 服务 |

### 模型初始化流程

```mermaid
sequenceDiagram
    participant Config as 配置
    participant AIService as AI 服务
    participant Provider as AI 提供商
    participant Model as 模型实例
    
    Config->>AIService: 创建实例
    AIService->>AIService: initializeModels()
    
    loop 每个提供商
        AIService->>Provider: 创建提供商客户端
        Provider->>Model: 创建模型实例
        Model-->>AIService: 返回模型
        AIService->>AIService: 添加到模型字典
    end
    
    AIService->>AIService: getModel(DEFAULT_MODEL)
    AIService-->>Config: 初始化完成
```

### 特殊配置 - SiliconFlow

SiliconFlow 提供商包含自定义的响应处理逻辑：

```typescript
// 特殊处理：从响应中提取 JSON
fetch: (url, options) => {
  return fetch(url, options)
    .then(response => {
      return response.json().then(data => {
        // 提取嵌入在 markdown 代码块中的 JSON
        let rawArguments = data.choices[0].message.tool_calls[0].function.arguments;
        const match = rawArguments.match(/```json(.*)```/);
        if (match && match[1]) {
          rawArguments = match[1];
        }
        // 修改响应数据
        data.choices[0].message.tool_calls[0].function.arguments = rawArguments;
        // 返回修改后的响应
        return new Response(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      });
    });
}
```

## 标签推荐流程

### 流程图

```mermaid
flowchart TD
    Start(["开始标签推荐"]) --> CheckEnabled{"标签推荐启用?"}
    CheckEnabled -->|"否"| Skip["跳过标签推荐"]
    CheckEnabled -->|"是"| GetTags["获取所有现有标签"]
    
    GetTags --> PrepareInput["准备输入数据"]
    PrepareInput --> ValidateInput{"输入有效?"}
    
    ValidateInput -->|"否"| Error["抛出错误"]
    ValidateInput -->|"是"| SelectModel["选择 AI 模型"]
    
    SelectModel --> BuildPrompt["构建提示词"]
    
    subgraph PromptConstruction ["提示词构建"]
        BuildPrompt --> SystemPrompt["系统提示"]
        BuildPrompt --> ExistingTags["现有标签列表"]
        BuildPrompt --> CustomInstructions["自定义指令"]
        BuildPrompt --> Guidelines["推荐指南"]
        
        SystemPrompt --> CombineSystem["组合系统提示"]
        ExistingTags --> CombineSystem
        CustomInstructions --> CombineSystem
        Guidelines --> CombineSystem
        
        CombineSystem --> UserPrompt["用户提示"]
        UserPrompt --> FileName["文件名"]
        UserPrompt --> Content["文件内容"]
    end
    
    UserPrompt --> CallAI["调用 AI API"]
    CallAI --> GenerateObject["generateObject"]
    GenerateObject --> Schema["Zod Schema 验证"]
    
    Schema --> ValidateSchema{"Schema 有效?"}
    ValidateSchema -->|"否"| SchemaError["Schema 错误"]
    ValidateSchema -->|"是"| ParseResponse["解析响应"]
    
    ParseResponse --> SortTags["按评分排序"]
    SortTags --> FormatTags["格式化标签"]
    
    FormatTags --> AddHash{"标签以 # 开头?"}
    AddHash -->|"否"| PrependHash["添加 # 前缀"]
    AddHash -->|"是"| KeepTag["保持原样"]
    
    PrependHash --> ReturnTags["返回标签列表"]
    KeepTag --> ReturnTags
    
    ReturnTags --> ApplyTags["应用标签"]
    
    ApplyTags --> CheckMethod{"添加方法?"}
    CheckMethod -->|"Frontmatter"| AddToFM["添加到 frontmatter"]
    CheckMethod -->|"内联"| AddInline["添加到文件首行"]
    
    AddToFM --> CheckExists1{"标签已存在?"}
    AddInline --> CheckExists2{"标签已存在?"}
    
    CheckExists1 -->|"是"| SkipTag1["跳过"]
    CheckExists1 -->|"否"| AppendFM["追加到 frontmatter"]
    
    CheckExists2 -->|"是"| SkipTag2["跳过"]
    CheckExists2 -->|"否"| AppendInline["追加到首行"]
    
    AppendFM --> Done(["完成"])
    AppendInline --> Done
    SkipTag1 --> Done
    SkipTag2 --> Done
    Skip --> Done
    Error --> Done
    SchemaError --> Done
    
    style Start fill:#e1f5e1
    style Done fill:#d4edda
    style PromptConstruction fill:#f0f0f0
```

### 标签推荐 Schema

```typescript
const tagsSchema = z.object({
  suggestedTags: z.array(z.object({
    score: z.number().min(0).max(100),  // 相关性评分 0-100
    isNew: z.boolean(),                  // 是否为新标签
    tag: z.string(),                     // 标签名称
    reason: z.string(),                  // 推荐理由
  }))
});
```

### 系统提示词

```
You are a precise tag generator. Analyze content and suggest {count} relevant tags.
Consider existing tags: {existingTags}
Create new tags if needed.
Follow these custom instructions: {customInstructions}

Guidelines:
- Prefer existing tags when appropriate (score them higher)
- Create specific, meaningful new tags when needed
- Score based on relevance (0-100)
- Include brief reasoning for each tag
- Focus on key themes, topics, and document type
```

### 标签应用逻辑

```mermaid
flowchart TD
    Start(["开始应用标签"]) --> FormatTag["格式化标签"]
    FormatTag --> CheckPrefix{"以 # 开头?"}
    CheckPrefix -->|"否"| AddPrefix["添加 # 前缀"]
    CheckPrefix -->|"是"| KeepFormat["保持格式"]
    
    AddPrefix --> CheckSetting{"使用 Frontmatter?"}
    KeepFormat --> CheckSetting
    
    CheckSetting -->|"是"| UseFM["Frontmatter 模式"]
    CheckSetting -->|"否"| UseInline["内联模式"]
    
    UseFM --> CheckFMExists{"Frontmatter 中存在?"}
    CheckFMExists -->|"是"| SkipFM["跳过"]
    CheckFMExists -->|"否"| AppendFM["添加到 tags 数组"]
    
    UseInline --> ReadContent["读取文件内容"]
    ReadContent --> CheckInlineExists{"内容中存在?"}
    CheckInlineExists -->|"是"| SkipInline["跳过"]
    CheckInlineExists -->|"否"| CheckFirstLine{"检查首行"}
    
    CheckFirstLine --> IsAllTags{"首行全是标签?"}
    IsAllTags -->|"是"| AppendToLine["追加到首行"]
    IsAllTags -->|"否"| InsertNewLine["插入新行"]
    
    AppendFM --> Done(["完成"])
    SkipFM --> Done
    SkipInline --> Done
    AppendToLine --> Done
    InsertNewLine --> Done
    
    style Start fill:#e1f5e1
    style Done fill:#d4edda
```

## 标题推荐流程

### 流程图

```mermaid
flowchart TD
    Start(["开始标题推荐"]) --> CheckEnabled{"重命名启用?"}
    CheckEnabled -->|"否"| Skip["跳过重命名"]
    CheckEnabled -->|"是"| PrepareInput["准备输入数据"]
    
    PrepareInput --> ValidateInput{"输入有效?"}
    ValidateInput -->|"否"| Error["抛出错误"]
    ValidateInput -->|"是"| SelectModel["选择 AI 模型"]
    
    SelectModel --> BuildPrompt["构建提示词"]
    
    subgraph PromptConstruction ["提示词构建"]
        BuildPrompt --> SystemPrompt["系统提示"]
        SystemPrompt --> FileName["当前文件名"]
        SystemPrompt --> Count["建议数量"]
        SystemPrompt --> CustomInstructions["自定义指令"]
        
        FileName --> CombineSystem["组合系统提示"]
        Count --> CombineSystem
        CustomInstructions --> CombineSystem
        
        CombineSystem --> UserPrompt["用户提示"]
        UserPrompt --> Content["文件内容"]
    end
    
    UserPrompt --> CallAI["调用 AI API"]
    CallAI --> GenerateObject["generateObject"]
    GenerateObject --> Schema["Zod Schema 验证"]
    
    Schema --> ValidateSchema{"Schema 有效?"}
    ValidateSchema -->|"否"| SchemaError["Schema 错误"]
    ValidateSchema -->|"是"| ParseResponse["解析响应"]
    
    ParseResponse --> SortTitles["按评分排序"]
    SortTitles --> ReturnTitles["返回标题列表"]
    
    ReturnTitles --> SelectTop["选择最高分标题"]
    SelectTop --> CheckSame{"与当前名称相同?"}
    
    CheckSame -->|"是"| SkipRename["跳过重命名"]
    CheckSame -->|"否"| ApplyRename["应用新名称"]
    
    ApplyRename --> UpdateFile["更新文件名"]
    UpdateFile --> UpdateRecord["更新处理记录"]
    
    UpdateRecord --> Done(["完成"])
    SkipRename --> Done
    Skip --> Done
    Error --> Done
    SchemaError --> Done
    
    style Start fill:#e1f5e1
    style Done fill:#d4edda
    style PromptConstruction fill:#f0f0f0
```

### 标题推荐 Schema

```typescript
const titleSchema = z.object({
  suggestedTitles: z.array(
    z.object({
      score: z.number().min(0).max(100),  // 适合度评分 0-100
      title: z.string(),                   // 建议的标题
      reason: z.string(),                  // 推荐理由
    })
  ).min(1),  // 至少返回 1 个建议
});
```

### 系统提示词

```
Given the content and file name: "{fileName}", suggest exactly {count} clear titles.
Avoid special characters.
Instructions: "{customInstructions}"
```

## 文件夹推荐流程

### 流程图

```mermaid
flowchart TD
    Start(["开始文件夹推荐"]) --> GetFolders["获取所有用户文件夹"]
    
    GetFolders --> FilterFolders["过滤忽略的文件夹"]
    
    subgraph FolderFiltering ["文件夹过滤"]
        FilterFolders --> CheckWildcard{"ignoreFolders 包含 *?"}
        CheckWildcard -->|"是"| ReturnEmpty["返回空列表"]
        CheckWildcard -->|"否"| ApplyFilters["应用过滤规则"]
        
        ApplyFilters --> IgnoreList["忽略列表"]
        IgnoreList --> System1["pathToWatch"]
        IgnoreList --> System2["defaultDestinationPath"]
        IgnoreList --> System3["attachmentsPath"]
        IgnoreList --> System4["backupFolderPath"]
        IgnoreList --> System5["templatePaths"]
        IgnoreList --> System6["fabricPaths"]
        IgnoreList --> System7["errorFilePath"]
        IgnoreList --> System8[".fileorganizer2000"]
        IgnoreList --> System9["/"]
        IgnoreList --> Custom["自定义忽略文件夹"]
        
        System1 --> FilterOut["过滤掉匹配的文件夹"]
        System2 --> FilterOut
        System3 --> FilterOut
        System4 --> FilterOut
        System5 --> FilterOut
        System6 --> FilterOut
        System7 --> FilterOut
        System8 --> FilterOut
        System9 --> FilterOut
        Custom --> FilterOut
    end
    
    FilterOut --> PrepareInput["准备输入数据"]
    ReturnEmpty --> Skip["跳过推荐"]
    
    PrepareInput --> ValidateInput{"输入有效?"}
    ValidateInput -->|"否"| Error["抛出错误"]
    ValidateInput -->|"是"| SelectModel["选择 AI 模型"]
    
    SelectModel --> BuildPrompt["构建提示词"]
    
    subgraph PromptConstruction ["提示词构建"]
        BuildPrompt --> SystemPrompt["系统提示"]
        SystemPrompt --> FileName["文件名"]
        SystemPrompt --> FolderList["文件夹列表"]
        SystemPrompt --> Count["建议数量"]
        SystemPrompt --> CustomInstructions["自定义指令"]
        
        FileName --> CombineSystem["组合系统提示"]
        FolderList --> CombineSystem
        Count --> CombineSystem
        CustomInstructions --> CombineSystem
        
        CombineSystem --> UserPrompt["用户提示"]
        UserPrompt --> Content["文件内容"]
    end
    
    UserPrompt --> CallAI["调用 AI API"]
    CallAI --> GenerateObject["generateObject"]
    GenerateObject --> Schema["Zod Schema 验证"]
    
    Schema --> ValidateSchema{"Schema 有效?"}
    ValidateSchema -->|"否"| SchemaError["Schema 错误"]
    ValidateSchema -->|"是"| ParseResponse["解析响应"]
    
    ParseResponse --> SortFolders["按评分排序"]
    SortFolders --> ReturnFolders["返回文件夹列表"]
    
    ReturnFolders --> SelectTop["选择最高分文件夹"]
    SelectTop --> CheckNew{"是新文件夹?"}
    
    CheckNew -->|"是"| CreateFolder["创建文件夹"]
    CheckNew -->|"否"| UseExisting["使用现有文件夹"]
    
    CreateFolder --> MoveFile["移动文件"]
    UseExisting --> MoveFile
    
    MoveFile --> UpdateRecord["更新处理记录"]
    UpdateRecord --> Done(["完成"])
    
    Skip --> Done
    Error --> Done
    SchemaError --> Done
    
    style Start fill:#e1f5e1
    style Done fill:#d4edda
    style FolderFiltering fill:#f0f0f0
    style PromptConstruction fill:#f0f0f0
```

### 文件夹推荐 Schema

```typescript
const folderSchema = z.object({
  suggestedFolders: z.array(
    z.object({
      score: z.number().min(0).max(100),  // 适合度评分 0-100
      isNewFolder: z.boolean(),            // 是否为新文件夹
      folder: z.string(),                  // 文件夹路径
      reason: z.string(),                  // 推荐理由
    })
  ).min(1),  // 至少返回 1 个建议
});
```

### 系统提示词

```
Given the content and file name: "{fileName}", suggest exactly {count} folders.
You can use: {folders}.
If none are relevant, suggest new folders.
Instructions: "{customInstructions}"
```

## 文档分类流程

### 流程图

```mermaid
flowchart TD
    Start(["开始文档分类"]) --> CheckEnabled{"分类启用?"}
    CheckEnabled -->|"否"| Skip["跳过分类"]
    CheckEnabled -->|"是"| CheckRefresh{"手动刷新模式?"}
    
    CheckRefresh -->|"是且无刷新键"| Skip
    CheckRefresh -->|"否或有刷新键"| GetTemplates["获取所有模板名称"]
    
    GetTemplates --> PrepareContent["准备内容"]
    PrepareContent --> TrimContent["截取内容"]
    
    TrimContent --> CallAPI["调用分类 API"]
    
    subgraph APICall ["API 调用"]
        CallAPI --> Endpoint["POST /api/classify1"]
        Endpoint --> Headers["设置请求头"]
        Headers --> Auth["Authorization: Bearer token"]
        Headers --> ContentType["Content-Type: application/json"]
        
        Auth --> Body["请求体"]
        ContentType --> Body
        
        Body --> BodyContent["content: 截取的内容"]
        Body --> BodyTemplates["templateNames: 模板列表"]
    end
    
    Body --> SendRequest["发送请求"]
    SendRequest --> CheckStatus{"状态码 200?"}
    
    CheckStatus -->|"否"| APIError["分类失败"]
    CheckStatus -->|"是"| ParseResponse["解析响应"]
    
    ParseResponse --> ExtractType["提取文档类型"]
    ExtractType --> ReturnType["返回分类结果"]
    
    ReturnType --> StoreResult["存储分类结果"]
    StoreResult --> Done(["完成"])
    
    Skip --> Done
    APIError --> Done
    
    style Start fill:#e1f5e1
    style Done fill:#d4edda
    style APICall fill:#f0f0f0
```

### 分类请求格式

```typescript
// 请求
POST /api/classify1
{
  "content": "截取的文件内容 (前 N 个字符)",
  "templateNames": ["模板1", "模板2", "模板3", ...]
}

// 响应
{
  "documentType": "匹配的模板名称"
}
```

### 内容截取逻辑

```typescript
const cutoff = settings.contentCutoffChars;
const trimmedContent = content.slice(0, cutoff);
```

## 通用错误处理

```mermaid
flowchart TD
    Start(["开始 AI 调用"]) --> TryCall["尝试调用"]
    TryCall --> Success{"成功?"}
    
    Success -->|"是"| ValidateResponse["验证响应"]
    Success -->|"否"| CatchError["捕获错误"]
    
    ValidateResponse --> IsValid{"响应有效?"}
    IsValid -->|"是"| ReturnData["返回数据"]
    IsValid -->|"否"| ValidationError["验证错误"]
    
    CatchError --> ErrorType{"错误类型"}
    
    ErrorType -->|"Network"| NetworkError["网络错误"]
    ErrorType -->|"API"| APIError["API 错误"]
    ErrorType -->|"Schema"| SchemaError["Schema 错误"]
    ErrorType -->|"Other"| GenericError["通用错误"]
    
    NetworkError --> LogError["记录错误"]
    APIError --> LogError
    SchemaError --> LogError
    GenericError --> LogError
    ValidationError --> LogError
    
    LogError --> ThrowError["抛出错误"]
    ThrowError --> HandleError["错误处理器"]
    
    HandleError --> MoveBackup["移动到备份文件夹"]
    MoveBackup --> UpdateStatus["更新状态为 error"]
    
    ReturnData --> Done(["完成"])
    UpdateStatus --> Done
    
    style Start fill:#e1f5e1
    style Done fill:#d4edda
    style LogError fill:#f8d7da
```

## AI 调用序列图

### 标签推荐序列

```mermaid
sequenceDiagram
    participant Plugin as FileOrganizer
    participant AIService as AI 服务
    participant Model as AI 模型
    participant Vault as Obsidian Vault
    
    Plugin->>Vault: getAllVaultTags()
    Vault-->>Plugin: 返回现有标签列表
    
    Plugin->>AIService: recommendTags(content, filePath, existingTags)
    AIService->>AIService: 验证输入
    AIService->>AIService: getModel(DEFAULT_MODEL)
    
    AIService->>Model: generateObject(prompt, schema)
    Model-->>AIService: 返回标签建议
    
    AIService->>AIService: 按评分排序
    AIService->>AIService: 格式化标签 (添加 #)
    AIService-->>Plugin: 返回标签列表
    
    loop 每个标签
        Plugin->>Plugin: appendTag(file, tag)
        Plugin->>Plugin: 检查标签是否存在
        alt 标签不存在
            Plugin->>Vault: 添加标签
        end
    end
    
    Plugin->>Plugin: 更新处理记录
```

### 标题推荐序列

```mermaid
sequenceDiagram
    participant Plugin as FileOrganizer
    participant AIService as AI 服务
    participant Model as AI 模型
    participant Vault as Obsidian Vault
    
    Plugin->>AIService: recommendName(content, fileName)
    AIService->>AIService: 验证输入
    AIService->>AIService: getModel(DEFAULT_MODEL)
    
    AIService->>Model: generateObject(prompt, schema)
    Model-->>AIService: 返回标题建议
    
    AIService->>AIService: 按评分排序
    AIService-->>Plugin: 返回标题列表
    
    Plugin->>Plugin: 选择最高分标题
    
    alt 标题与当前名称不同
        Plugin->>Vault: rename(file, newName)
        Vault-->>Plugin: 重命名成功
        Plugin->>Plugin: 更新处理记录
    else 标题相同
        Plugin->>Plugin: 跳过重命名
    end
```

### 文件夹推荐序列

```mermaid
sequenceDiagram
    participant Plugin as FileOrganizer
    participant AIService as AI 服务
    participant Model as AI 模型
    participant Vault as Obsidian Vault
    
    Plugin->>Plugin: getAllUserFolders()
    Plugin->>Plugin: 过滤忽略的文件夹
    
    Plugin->>AIService: recommendFolders(content, fileName, folders)
    AIService->>AIService: 验证输入
    AIService->>AIService: getModel(DEFAULT_MODEL)
    
    AIService->>Model: generateObject(prompt, schema)
    Model-->>AIService: 返回文件夹建议
    
    AIService->>AIService: 按评分排序
    AIService-->>Plugin: 返回文件夹列表
    
    Plugin->>Plugin: 选择最高分文件夹
    
    alt 是新文件夹
        Plugin->>Vault: createFolder(newPath)
    end
    
    Plugin->>Vault: moveFile(file, targetFolder)
    Vault-->>Plugin: 移动成功
    Plugin->>Plugin: 更新处理记录
```

## 性能优化策略

### 1. 内容截取
```typescript
// 减少 API 调用成本
const cutoff = settings.contentCutoffChars;
const trimmedContent = content.slice(0, cutoff);
```

### 2. 批量处理
- 使用队列管理 AI 调用
- 避免并发过多导致 API 限流

### 3. 缓存策略
- 可以缓存相似内容的分类结果
- 减少重复 API 调用

### 4. Schema 验证
- 使用 Zod 确保响应格式正确
- 早期发现并处理格式错误

## 配置建议

### 内容截取字符数
| 文档类型 | 建议值 | 说明 |
|---------|--------|------|
| 短文本 | 500-1000 | 快速处理，成本低 |
| 中等文本 | 2000-3000 | 平衡准确性和成本 |
| 长文本 | 5000-8000 | 更准确，成本较高 |

### 模型选择
| 任务 | 推荐模型 | 原因 |
|------|---------|------|
| 标签推荐 | GPT-4o, Claude | 需要理解语义 |
| 标题生成 | GPT-4o, Gemini | 创造性命名 |
| 文件夹推荐 | DeepSeek, GPT-3.5 | 分类任务 |
| 文档分类 | DeepSeek, GPT-3.5 | 简单分类 |

## 总结

AI 服务采用了：
- ✅ 多提供商支持 - 灵活选择 AI 服务
- ✅ Schema 验证 - 确保响应格式正确
- ✅ 错误处理 - 完善的错误恢复机制
- ✅ 内容优化 - 智能截取减少成本
- ✅ 可配置性 - 灵活的提示词和参数
- ✅ 评分排序 - 选择最佳建议
