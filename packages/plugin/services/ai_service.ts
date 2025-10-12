import { z } from "zod";
import { logger } from "./logger";
import { generateObject, generateText, LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOllama } from "ollama-ai-provider";
import { FileOrganizerSettings } from "../settings";
import { DEFAULT_FOLDER_PROMPT, DEFAULT_LENGTH_SPLIT_PROMPT, DEFAULT_ATOMIC_SPLIT_PROMPT, DEFAULT_ENHANCED_METADATA_PROMPT, DEFAULT_ROADMAP_PROMPT } from "../prompts";

// Types
export interface TagSuggestion {
  score: number;
  isNew: boolean;
  tag: string;
  reason: string;
}

export interface GenerateTagsOptions {
  content: string;
  fileName: string;
  existingTags?: string[];
  customInstructions?: string;
  count?: number;
}

export interface AIServiceConfig {
  modelName: string;
  apiKey: string;
  debug?: boolean;
  baseURL?: string;
}

// 添加Title相关的类型定义
export interface TitleSuggestion {
  score: number;
  title: string;
  reason: string;
}

export interface GenerateTitleOptions {
  content: string;
  fileName: string;
  customInstructions?: string;
  count?: number;
}

// 添加Folder相关的类型定义
export interface FolderSuggestion {
  score: number;
  isNewFolder: boolean;
  folder: string;
  reason: string;
}

export interface GenerateFolderOptions {
  content: string;
  fileName: string;
  folders: string[];
  customInstructions?: string;
  count?: number;
}

// 添加原子化拆分相关的类型定义
export interface AtomicNote {
  filename: string;
  content: string;
  knowledgePoint?: string;
}

export interface SplitIntoAtomicNotesOptions {
  content: string;
  filename: string;
  customPrompt?: string;
}

export interface SplitByLengthOptions {
  content: string;
  maxLength?: number;
  customPrompt?: string;
}

// 添加增强元数据相关的类型定义 (Phase 2)
export interface EnhancedMetadata {
  title: string;
  category: string;
  subcategory?: string;
  tags: string[];
  summary: string;
  source?: string;
  credibility?: number;  // 1-5分
  created?: string;
  updated?: string;
}

export interface GenerateMetadataOptions {
  content: string;
  filename: string;
  existingCategories?: string[];
  customPrompt?: string;
}

// 添加智能分类相关的类型定义 (Phase 3)
export interface FolderStructure {
  path: string;              // 文件夹路径
  name: string;              // 文件夹名称
  level: number;             // 层级 (1, 2, 3)
  parent?: string;           // 父文件夹路径
  children?: FolderStructure[]; // 子文件夹
}

export interface IntelligentClassification {
  targetFolder: string;      // 目标文件夹路径 (相对于 vault 根目录)
  category: string;          // 一级分类名称
  subcategory?: string;      // 二级分类名称
  level3?: string;           // 三级分类名称 (可选)
  confidence: number;        // 分类置信度 0-100
  reason: string;            // 分类理由
  shouldCreateFolder: boolean; // 是否需要创建新文件夹
}

export interface GenerateClassificationOptions {
  content: string;
  metadata: EnhancedMetadata;
  knowledgeBaseStructure: FolderStructure[];
  customPrompt?: string;
}

// 添加 Roadmap 相关的类型定义 (Phase 4)
export interface RoadmapInsertPosition {
  section: string;           // 插入的章节名称
  lineNumber: number;        // 插入的行号
  reasoning: string;         // 插入理由
}

export interface GenerateRoadmapOptions {
  domain: string;            // 领域名称
  customPrompt?: string;
}

export interface FindInsertPositionOptions {
  roadmapContent: string;    // Roadmap 内容
  noteContent: string;       // 笔记内容
  noteTitle: string;         // 笔记标题
  notePath: string;          // 笔记路径
}

// Schema definitions
const tagsSchema = z.object({
  suggestedTags: z.array(z.object({
    score: z.number().min(0).max(100),
    isNew: z.boolean(),
    tag: z.string(),
    reason: z.string(),
  }))
});

// 原子化拆分 Schema
const atomicSplitSchema = z.object({
  notes: z.array(
    z.object({
      title: z.string().describe("笔记标题，清晰描述性强"),
      content: z.string().describe("笔记内容，完整的markdown格式"),
      knowledgePoint: z.string().optional().describe("知识点描述，一句话说明核心概念"),
    })
  ),
});

// 长度拆分 Schema
const lengthSplitSchema = z.object({
  fragments: z.array(z.string()).describe("拆分后的内容片段"),
});

// 添加Title相关的Schema
const shouldRenameSchema = z.object({
  score: z.number().min(0).max(100),
  shouldRename: z.boolean(),
  reason: z.string(),
});

const titleSchema = z.object({
  suggestedTitles: z.array(
    z.object({
      score: z.number().min(0).max(100),
      title: z.string(),
      reason: z.string(),
    })
  ).min(1),
});

// 添加Folder相关的Schema
const folderSchema = z.object({
  suggestedFolders: z.array(
    z.object({
      score: z.number().min(0).max(100),
      isNewFolder: z.boolean(),
      folder: z.string(),
      reason: z.string(),
    })
  ).min(1),
});

// 增强元数据 Schema (Phase 2)
const metadataSchema = z.object({
  title: z.string().describe("笔记标题"),
  category: z.string().describe("一级分类，如：技术、生活、工作等"),
  subcategory: z.string().optional().describe("二级分类，更细致的分类"),
  tags: z.array(z.string()).describe("相关标签，3-5个"),
  summary: z.string().describe("内容摘要，100字以内"),
  source: z.string().optional().describe("来源信息，如：书籍、文章、课程等"),
  credibility: z.number().min(1).max(5).optional().describe("可信度评分，1-5分"),
});

// 智能分类 Schema (Phase 3)
const classificationSchema = z.object({
  targetFolder: z.string().describe("目标文件夹路径，如：1.Area/技术/前端开发"),
  category: z.string().describe("一级分类名称"),
  subcategory: z.string().optional().describe("二级分类名称"),
  level3: z.string().optional().describe("三级分类名称"),
  confidence: z.number().min(0).max(100).describe("分类置信度评分"),
  reason: z.string().describe("分类理由，说明为什么选择这个分类"),
  shouldCreateFolder: z.boolean().describe("如果目标文件夹不存在，是否应该创建"),
});

// Roadmap 插入位置 Schema (Phase 4)
const roadmapInsertPositionSchema = z.object({
  section: z.string().describe("插入的章节名称，如：初级（入门基础）或 中级（进阶提升）"),
  lineNumber: z.number().describe("插入的行号"),
  reasoning: z.string().describe("为什么选择这个位置的理由"),
});

export class AIService {
  private config: FileOrganizerSettings;
  private model: LanguageModel;
  private models: Record<string, LanguageModel> = {} as Record<string, LanguageModel>;
  private initialized: boolean = false;

  constructor(config: FileOrganizerSettings) {
    this.config = config;
    if (config.debugMode) {
      logger.configure(true);
    }

    try {
      this.initializeModels();
      this.model = this.getModel(config.DEFAULT_MODEL);
      this.initialized = true;
      logger.info("AIService initialized with model:", config.DEFAULT_MODEL);
    } catch (error) {
      logger.error("Failed to initialize AIService:", error);
      throw error;
    }
  }

  private initializeModels() {
    const deepseek = createOpenAICompatible({
      name: "deepseek",
      baseURL: this.config.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      headers: {
        Authorization: `Bearer ${this.config.DEEPSEEK_API_KEY}`,
      },
    });
    const minimax = createOpenAICompatible({
      name: "minimax",
      baseURL: this.config.MINIMAX_BASE_URL || "https://api.minimax.chat/v1",
      headers: {
        Authorization: `Bearer ${this.config.MINIMAX_API_KEY}`,
      },
    });
    const siliconflow = createOpenAICompatible({
      name: "siliconflow",
      baseURL: this.config.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1",
      headers: {
        Authorization: `Bearer ${this.config.SILICONFLOW_API_KEY}`,
      },
      fetch: (url, options) => {
        console.log("Fetching URL:", url);
        console.log("Fetching Options:", options);
        // 发送请求并返回响应
        return fetch(url, options)
        .then(response => {
            return response.json().then(data => {
                // 在此处添加自定义的响应处理逻辑
                // 例如，处理响应数据、错误处理等
                console.log("Custom fetch Response:", data);
                
                // 获取原始的 arguments 字符串
                let rawArguments = data.choices[0].message.tool_calls[0].function.arguments;
                // 使用正则表达式匹配并提取 JSON 字符串
                const match = rawArguments.match(/```json(.*)```/);
                if (match && match[1]) {
                    // 提取的 JSON 字符串
                    rawArguments = match[1];
                }
                // 创建新的响应对象，使用修改后的数据
                data.choices[0].message.tool_calls[0].function.arguments = rawArguments;
                console.log("Final Raw Arguments:", data.choices[0].message.tool_calls[0].function.arguments);
                // 返回一个新的response, 数据为修改后的data
                const modifiedResponse = new Response(JSON.stringify(data), {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers
                });

                // 返回新的响应对象
                return modifiedResponse;
            });
        })
        .catch(error => {
            // 处理请求或响应中的错误
            console.error('请求错误:', error);
            throw error;
        });
      },
    });
    const ollama = createOllama({
      baseURL: this.config.OLLAMA_BASE_URL || "http://192.168.1.177:11434/api",
    });
    // 修改后的 Google 配置，使用 createOpenAICompatible
    const google = createOpenAICompatible({
        name: "google",
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", // Google Gemini API 的基础 URL
        headers: {
        Authorization: `Bearer ${this.config.GOOGLE_API_KEY || "AIzaSyDgEEWTvaopxXSOw2m8hbKE6iKIpjgXFQ"}`,
        },
    });

    this.models = {
        "deepseek": deepseek(this.config.DEEPSEEK_MODEL || "deepseek-chat"),
        "minimax": minimax(this.config.MINIMAX_MODEL || "minimax"),
        "siliconflow": siliconflow(this.config.SILICONFLOW_MODEL || "siliconflow"),
        "ollama": ollama(this.config.OLLAMA_MODEL || "phi4"),
        "openai": createOpenAI({
          apiKey: this.config.OPENAI_API_KEY,
          baseURL: this.config.OPENAI_BASE_URL || undefined,
        })(this.config.OPENAI_MODEL || "gpt-4o"),
        "anthropic": createAnthropic({apiKey: this.config.ANTHROPIC_API_KEY,})(this.config.ANTHROPIC_MODEL || "claude-3-5-sonnet-20240620"),
        "google": google(this.config.GOOGLE_MODEL || "gemini-2.0-flash"), 
    };
  }

  private getAvailableModels = () => {
    return Object.keys(this.models);
  };

  private getModel(name: string): LanguageModel {
    if (!this.models[name]) {
      logger.warn(`Model ${name} not found, falling back to deepseek`);
      return this.models["deepseek"];
    }
    logger.info(`Using model ${name}`);
    return this.models[name];
  }

  async generateTags(options: GenerateTagsOptions): Promise<TagSuggestion[]> {
    try {
      logger.info("Generating tags with options:", options);
      const { content, fileName, existingTags = [], customInstructions = "", count = 3 } = options;

      // 验证输入
      if (!content || !fileName) {
        logger.error("Invalid input:", { content: !!content, fileName: !!fileName });
        throw new Error("Content and fileName are required");
      }

      this.model = this.getModel(this.config.DEFAULT_MODEL);
      logger.info(`Using model ${this.config.DEFAULT_MODEL} : ${this.model} from ${this.models}`);
      // Prepare custom instructions: prefer passed customInstructions, then settings, then empty
      let instructionTemplate = customInstructions || this.config.customTagInstructions || "";
      // If template lacks content or existingTags context, append them so AI always sees necessary info
      const hasContentPlaceholder = /\$\{content\}/.test(instructionTemplate);
      const hasExistingTagsPlaceholder = /\$\{existingTags\}/.test(instructionTemplate);
      if (!hasExistingTagsPlaceholder && existingTags && existingTags.length > 0) {
        instructionTemplate = `${instructionTemplate}\n\n已有标签参考: ${existingTags.join(", ")}`;
      }
      if (!hasContentPlaceholder) {
        instructionTemplate = `${instructionTemplate}\n\n内容摘要(前${Math.min(500, content.length)}字符): ${content.substring(0, Math.min(500, content.length))}`;
      }

      const response = await generateObject({
        model: this.model,
        schema: tagsSchema,
        system: `You are a precise tag generator. Analyze content and suggest ${count} relevant tags. ${instructionTemplate ? `Follow these custom instructions: ${instructionTemplate}` : ''}\n\nGuidelines:\n- Prefer existing tags when appropriate (score them higher)\n- Create specific, meaningful new tags when needed\n- Score based on relevance (0-100)\n- Include brief reasoning for each tag\n- Focus on key themes, topics, and document type`,
        prompt: `File: "${fileName}"\n\nContent: """\n${content}\n"""`,
      });

      logger.info("Raw AI response:", response);

      // Sort tags by score and format response
      const sortedTags: TagSuggestion[] = response.object.suggestedTags
        .sort((a, b) => b.score - a.score)
        .map(tag => ({
          score: tag.score,
          isNew: tag.isNew,
          tag: tag.tag.startsWith('#') ? tag.tag : `#${tag.tag}`,
          reason: tag.reason
        }));

      logger.info("Generated tags:", sortedTags);
      return sortedTags;

    } catch (e: any) {
      logger.error("Error generating tags:", e);
      throw e;
    }
  }

  async generateTitle(options: GenerateTitleOptions): Promise<TitleSuggestion[]> {
    try {
      logger.info("Generating title with options:", options);
      const { content, fileName, customInstructions = "", count = 3 } = options;

      // 验证输入
      if (!content || !fileName) {
        logger.error("Invalid input:", { content: !!content, fileName: !!fileName });
        throw new Error("Content and fileName are required");
      }

    //   // 1. 首先检查是否需要重命名
    //   const shouldRename = await generateObject({
    //     model: this.model,
    //     schema: shouldRenameSchema,
    //     prompt: `Given the content and file name: "${fileName}", should we rename the file? Content: "${content}", based on ${customInstructions}`,
    //   });

    //   logger.info("Should rename check:", shouldRename.object);

    //   // 如果不需要重命名，返回原文件名
    //   if (!shouldRename.object.shouldRename) {
    //     return [{
    //       score: shouldRename.object.score,
    //       title: fileName,
    //       reason: shouldRename.object.reason,
    //     }];
    //   }

      // 2. 生成新的标题建议
      // Ensure rename instructions include sufficient context; if missing, append content/filename summary
      let instructions = customInstructions || this.config.renameInstructions || "";
      const hasContentPlaceholder = /\$\{content\}/.test(instructions);
      const hasFileNamePlaceholder = /\$\{fileName\}/.test(instructions);
      if (!hasFileNamePlaceholder) instructions = `${instructions}\n\n原文件名: ${fileName}`;
      if (!hasContentPlaceholder) instructions = `${instructions}\n\n内容摘要(前${Math.min(500, content.length)}字符): ${content.substring(0, Math.min(500, content.length))}`;

      const response = await generateObject({
        model: this.model,
        schema: titleSchema,
        system: `Given the content and file name: "${fileName}", suggest exactly ${count} clear titles. Avoid special characters. Instructions: "${instructions}"`,
        prompt: `Content: "${content}"`,
      });

      logger.info("Raw AI response:", response);

      // 处理并排序标题建议
      const sortedTitles = response.object.suggestedTitles
        .sort((a, b) => b.score - a.score)
        .map(title => ({
          score: title.score,
          title: title.title,
          reason: title.reason
        }));

      logger.info("Generated titles:", sortedTitles);
      return sortedTitles;

    } catch (e: any) {
      logger.error("Error generating title:", e);
      if (e instanceof z.ZodError) {
        throw new Error(`Invalid response format: ${e.message}`);
      }
      throw new Error(`Failed to generate title: ${e?.message || String(e)}`);
    }
  }

  async generateFolder(options: GenerateFolderOptions): Promise<FolderSuggestion[]> {
    try {
      logger.info("Generating folder suggestions with options:", options);
      const { content, fileName, folders, customInstructions = "", count = 3 } = options;

      // 验证输入
      if (!content || !fileName || !Array.isArray(folders)) {
        logger.error("Invalid input:", { 
          content: !!content, 
          fileName: !!fileName,
          folders: Array.isArray(folders)
        });
        throw new Error("Content, fileName and folders array are required");
      }

  // 处理 customInstructions（优先使用传入值，否则使用 settings），并在缺少关键上下文时追加
  const instructionSource = customInstructions || this.config.customFolderInstructions || "";

  // 如果没有提供自定义提示词，则使用内置的默认提示词（基于 docs/flow/参考流程.md 中的知识库结构与归档工作流）
  // 当 caller 或 settings 都未提供自定义指令时，使用集中式默认提示词；否则使用传入的指令
  let instruction = instructionSource && instructionSource.trim() ? instructionSource : DEFAULT_FOLDER_PROMPT;
      const hasFileName = /\$\{fileName\}/.test(instruction);
      const hasContent = /\$\{content\}/.test(instruction);
      const appendixParts: string[] = [];
      if (!hasFileName) appendixParts.push(`原文件名: ${fileName}`);
      if (!hasContent) appendixParts.push(`内容:\n${content}`);
      if (appendixParts.length > 0) {
        instruction = `${instruction}\n\n${appendixParts.join('\n\n')}`;
      }
      // 替换占位符（如果存在）
      instruction = instruction.replace(/\$\{fileName\}/g, fileName).replace(/\$\{content\}/g, content);

      // Debug: log which instruction source is used and the final instruction passed to the model
      try {
        logger.info("Folder instruction source:", { instructionSource });
        logger.info("Folder instruction (final):", { instruction });
      } catch (logErr) {
        // don't break flow if logging fails
        console.warn('Failed to log folder instruction debug info', logErr);
      }

      const response = await generateObject({
        model: this.model,
        schema: folderSchema,
        system: `Given the content and file name: "${fileName}", suggest exactly ${count} folders. You can use: ${folders.join(", ")}. If none are relevant, suggest new folders. ${instruction ? `Instructions: "${instruction}"` : ""}`,
        prompt: `Content: "${content}"`,
      });

      logger.info("Raw AI response:", response);

      // 处理并排序文件夹建议
      const sortedFolders = response.object.suggestedFolders
        .sort((a, b) => b.score - a.score)
        .map(folder => ({
          score: folder.score,
          isNewFolder: folder.isNewFolder,
          folder: folder.folder,
          reason: folder.reason
        }));

      logger.info("Generated folder suggestions:", sortedFolders);
      return sortedFolders;

    } catch (e: any) {
      logger.error("Error generating folder suggestions:", e);
      if (e instanceof z.ZodError) {
        throw new Error(`Invalid response format: ${e.message}`);
      }
      throw new Error(`Failed to generate folder suggestions: ${e?.message || String(e)}`);
    }
  }

  /**
   * 原子化拆分笔记
   * @param options 拆分选项
   * @returns 拆分后的原子化笔记数组
   */
  async splitIntoAtomicNotes(options: SplitIntoAtomicNotesOptions): Promise<AtomicNote[]> {
    try {
      logger.info("Splitting into atomic notes with options:", options);
      const { content, filename, customPrompt } = options;

      // 验证输入
      if (!content || !filename) {
        logger.error("Invalid input:", { content: !!content, filename: !!filename });
        throw new Error("Content and filename are required");
      }

      // Prompt selection order: caller.customPrompt -> settings.atomicSplitPrompt -> DEFAULT_ATOMIC_SPLIT_PROMPT
      const template = customPrompt?.trim() || this.config.atomicSplitPrompt || DEFAULT_ATOMIC_SPLIT_PROMPT;

      // Ensure placeholders or append content/filename
      let prompt = template;
      const hasFilenamePlaceholder = /\$\{filename\}/.test(template);
      const hasContentPlaceholder = /\$\{content\}/.test(template);
      if (!hasFilenamePlaceholder) prompt = `${prompt}\n\n原文件名：${filename}`;
      if (!hasContentPlaceholder) prompt = `${prompt}\n\n笔记内容：\n${content}`;

      // Replace placeholders if present
      prompt = prompt.replace(/\$\{filename\}/g, filename).replace(/\$\{content\}/g, content);

      // Debug
      try {
        const promptSource = customPrompt ? 'caller' : (this.config.atomicSplitPrompt ? 'settings' : 'default');
        logger.info('Atomic split prompt source:', { promptSource });
        logger.info('Atomic split prompt (final):', { prompt: prompt.substring(0, 1000) });
      } catch (logErr) {
        console.warn('Failed to log atomic split prompt debug info', logErr);
      }

      const response = await generateObject({
        model: this.model,
        schema: atomicSplitSchema,
        system: "You are an expert at analyzing and splitting notes into atomic, self-contained knowledge units. Each note should focus on a single concept or idea.",
        prompt: prompt,
      });

      logger.info("Raw AI response:", response);

      // 验证返回格式
      if (!Array.isArray(response.object.notes)) {
        throw new Error("AI返回格式错误：期望 { notes: [...] }");
      }

      const atomicNotes: AtomicNote[] = response.object.notes.map((note: any) => ({
        filename: note.title || "未命名笔记",
        content: note.content || "",
        knowledgePoint: note.knowledgePoint,
      }));

      logger.info("Generated atomic notes:", atomicNotes);
      return atomicNotes;

    } catch (e: any) {
      logger.error("Error splitting into atomic notes:", e);
      if (e instanceof z.ZodError) {
        throw new Error(`Invalid response format: ${e.message}`);
      }
      throw new Error(`Failed to split into atomic notes: ${e?.message || String(e)}`);
    }
  }

  /**
   * 按长度智能拆分内容
   * @param options 拆分选项
   * @returns 拆分后的内容片段数组
   */
  async splitByLength(options: SplitByLengthOptions): Promise<string[]> {
    try {
      logger.info("Splitting by length with options:", options);
      const { content, maxLength = 3000, customPrompt } = options;

      // 如果内容不超过限制，直接返回
      if (content.length <= maxLength) {
        return [content];
      }

      // 使用 settings 中的提示词模板，如果没有则使用默认
      // Prompt selection order: caller.customPrompt -> settings.lengthSplitPrompt -> DEFAULT_LENGTH_SPLIT_PROMPT
      let template = customPrompt || this.config.lengthSplitPrompt || DEFAULT_LENGTH_SPLIT_PROMPT;

      // 如果模板缺少关键占位符，则在末尾补充对应上下文，保证原文被注入
      let promptTemplate = template;
      const hasContentPlaceholder = /\$\{content\}/.test(template);
      const hasMaxLengthPlaceholder = /\$\{maxLength\}/.test(template);
      if (!hasMaxLengthPlaceholder) {
        promptTemplate = `${promptTemplate}\n\n最大长度限制: ${maxLength}`;
      }
      if (!hasContentPlaceholder) {
        promptTemplate = `${promptTemplate}\n\n内容：\n${content}`;
      }

      // 替换占位符（如果存在）
      const prompt = promptTemplate
        .replace(/\$\{maxLength\}/g, maxLength.toString())
        .replace(/\$\{content\}/g, content);

      // Debug: log which prompt source is used and the final prompt passed to the model
      try {
        const promptSource = customPrompt ? 'caller' : (this.config.lengthSplitPrompt ? 'settings' : 'default');
        logger.info('Length split prompt source:', { promptSource });
        logger.info('Length split prompt (final):', { prompt: prompt.substring(0, 1000) });
      } catch (logErr) {
        console.warn('Failed to log length split prompt debug info', logErr);
      }

      const response = await generateObject({
        model: this.model,
        schema: lengthSplitSchema,
        system: "You are an expert at intelligently splitting long content while preserving semantic coherence and context.",
        prompt: prompt,
      });

      logger.info("Raw AI response:", response);

      if (!Array.isArray(response.object.fragments)) {
        throw new Error("AI返回格式错误：期望 { fragments: [...] }");
      }

      logger.info("Generated fragments:", response.object.fragments);
      return response.object.fragments;

    } catch (e: any) {
      logger.error("Error splitting by length:", e);
      if (e instanceof z.ZodError) {
        throw new Error(`Invalid response format: ${e.message}`);
      }
      throw new Error(`Failed to split by length: ${e?.message || String(e)}`);
    }
  }

  /**
   * 生成增强元数据 (Phase 2)
   * @param options 生成选项
   * @returns 增强元数据对象
   */
  async generateEnhancedMetadata(options: GenerateMetadataOptions): Promise<EnhancedMetadata> {
    try {
      logger.info("Generating enhanced metadata with options:", options);
      const { content, filename, existingCategories = [], customPrompt } = options;

      // 验证输入
      if (!content || !filename) {
        logger.error("Invalid input:", { content: !!content, filename: !!filename });
        throw new Error("Content and filename are required");
      }

      const categoriesHint = existingCategories.length > 0
        ? `已有分类参考: ${existingCategories.join(", ")}`
        : "可以创建新的分类";

      // Prompt selection order: caller.customPrompt -> settings.enhancedMetadataPrompt -> DEFAULT_ENHANCED_METADATA_PROMPT
      const template = customPrompt || this.config.enhancedMetadataPrompt || DEFAULT_ENHANCED_METADATA_PROMPT;

      let prompt = template;
      const hasCategoriesHint = /\$\{categoriesHint\}/.test(template);
      const hasFilename = /\$\{filename\}/.test(template);
      const hasContent = /\$\{content\}/.test(template);
      if (!hasCategoriesHint) prompt = `${prompt}\n\n已有分类参考: ${categoriesHint}`;
      if (!hasFilename) prompt = `${prompt}\n\n原文件名: ${filename}`;
      if (!hasContent) prompt = `${prompt}\n\n笔记内容:\n${content}`;

      prompt = prompt
        .replace(/\$\{categoriesHint\}/g, categoriesHint)
        .replace(/\$\{filename\}/g, filename)
        .replace(/\$\{content\}/g, content);

      // Debug
      try {
        const promptSource = customPrompt ? 'caller' : (this.config.enhancedMetadataPrompt ? 'settings' : 'default');
        logger.info('Enhanced metadata prompt source:', { promptSource });
        logger.info('Enhanced metadata prompt (final):', { prompt: prompt.substring(0, 1000) });
      } catch (logErr) {
        console.warn('Failed to log enhanced metadata prompt debug info', logErr);
      }

      const response = await generateObject({
        model: this.model,
        schema: metadataSchema,
        system: "You are an expert at analyzing content and generating structured metadata. Focus on accuracy, clarity, and usefulness for knowledge management.",
        prompt: prompt,
      });

      logger.info("Raw AI response:", response);

      // 构建元数据对象
      const metadata: EnhancedMetadata = {
        title: response.object.title,
        category: response.object.category,
        subcategory: response.object.subcategory,
        tags: response.object.tags.map(tag => tag.startsWith('#') ? tag : `#${tag}`),
        summary: response.object.summary,
        source: response.object.source,
        credibility: response.object.credibility,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      logger.info("Generated metadata:", metadata);
      return metadata;

    } catch (e: any) {
      logger.error("Error generating enhanced metadata:", e);
      if (e instanceof z.ZodError) {
        throw new Error(`Invalid response format: ${e.message}`);
      }
      throw new Error(`Failed to generate enhanced metadata: ${e?.message || String(e)}`);
    }
  }

  /**
   * 智能分类 - 基于元数据和知识库结构确定目标文件夹 (Phase 3)
   * @param options 分类选项
   * @returns 智能分类结果
   */
  async generateIntelligentClassification(options: GenerateClassificationOptions): Promise<IntelligentClassification> {
    try {
      logger.info("Generating intelligent classification with options:", options);
      const { content, metadata, knowledgeBaseStructure, customPrompt } = options;

      // 验证输入
      if (!content || !metadata) {
        logger.error("Invalid input:", { content: !!content, metadata: !!metadata });
        throw new Error("Content and metadata are required");
      }

      // 构建知识库结构描述
      const structureDescription = this.buildStructureDescription(knowledgeBaseStructure);

      const prompt = customPrompt || `基于笔记内容和元数据，确定最合适的知识库分类路径。

**笔记元数据**：
- 标题: ${metadata.title}
- 一级分类: ${metadata.category}
- 二级分类: ${metadata.subcategory || "无"}
- 标签: ${metadata.tags.join(", ")}
- 摘要: ${metadata.summary}

**现有知识库结构**：
${structureDescription}

**任务要求**：
1. 根据元数据中的 category 和 subcategory 确定目标文件夹路径
2. 优先使用已存在的文件夹路径
3. 如果现有结构中没有匹配的分类，可以建议创建新文件夹
4. 支持多层级结构（1级/2级/3级）
5. 路径格式：knowledgeBaseRoot/category/subcategory/level3
6. 评估分类的置信度（0-100分）
7. 说明分类理由

**笔记内容摘要**：
${content.substring(0, 500)}...`;

      const response = await generateObject({
        model: this.model,
        schema: classificationSchema,
        system: "You are an expert at organizing knowledge and determining the most appropriate folder structure for notes. Consider semantic meaning, existing structure, and user intent.",
        prompt: prompt,
      });

      logger.info("Raw AI response:", response);

      // 构建分类结果
      const classification: IntelligentClassification = {
        targetFolder: response.object.targetFolder,
        category: response.object.category,
        subcategory: response.object.subcategory,
        level3: response.object.level3,
        confidence: response.object.confidence,
        reason: response.object.reason,
        shouldCreateFolder: response.object.shouldCreateFolder,
      };

      logger.info("Generated classification:", classification);
      return classification;

    } catch (e: any) {
      logger.error("Error generating intelligent classification:", e);
      if (e instanceof z.ZodError) {
        throw new Error(`Invalid response format: ${e.message}`);
      }
      throw new Error(`Failed to generate intelligent classification: ${e?.message || String(e)}`);
    }
  }

  /**
   * 构建知识库结构描述（用于 AI 提示词）
   */
  private buildStructureDescription(structure: FolderStructure[]): string {
    if (!structure || structure.length === 0) {
      return "知识库为空，可以创建新的分类结构";
    }

    const lines: string[] = [];
    const buildTree = (folders: FolderStructure[], indent: string = "") => {
      for (const folder of folders) {
        lines.push(`${indent}- ${folder.name} (${folder.path})`);
        if (folder.children && folder.children.length > 0) {
          buildTree(folder.children, indent + "  ");
        }
      }
    };

    buildTree(structure);
    return lines.join("\n");
  }

  /**
   * 生成 Roadmap 学习路线图 (Phase 4)
   * @param options 生成选项
   * @returns Roadmap 内容（Markdown 格式）
   */
  async generateRoadmap(options: GenerateRoadmapOptions): Promise<string> {
    try {
      logger.info("Generating roadmap with options:", options);
      const { domain, customPrompt } = options;

      // 验证输入
      if (!domain) {
        logger.error("Invalid input:", { domain: !!domain });
        throw new Error("Domain is required");
      }

      // Prompt selection order: caller.customPrompt -> settings.roadmapPrompt -> DEFAULT_ROADMAP_PROMPT
      const template = customPrompt || this.config.roadmapPrompt || DEFAULT_ROADMAP_PROMPT;
      // If template contains ${domain}, replace. Otherwise append domain context
      const finalPrompt = template.includes('${domain}') ? template.replace(/\$\{domain\}/g, domain) : `${template}\n\n领域: ${domain}`;

      // Debug
      try {
        const promptSource = customPrompt ? 'caller' : (this.config.roadmapPrompt ? 'settings' : 'default');
        logger.info('Roadmap prompt source:', { promptSource });
        logger.info('Roadmap prompt (final):', { prompt: finalPrompt.substring(0, 1000) });
      } catch (logErr) {
        console.warn('Failed to log roadmap prompt debug info', logErr);
      }

      const response = await generateText({
        model: this.model,
        system: "You are an expert educator with 20 years of experience. Create comprehensive, structured learning roadmaps that help learners progress systematically from beginner to expert level.",
        prompt: finalPrompt,
      });

      logger.info("Roadmap generated successfully");
      return response.text;

    } catch (e: any) {
      logger.error("Error generating roadmap:", e);
      throw new Error(`Failed to generate roadmap: ${e?.message || String(e)}`);
    }
  }

  /**
   * 查找 Roadmap 中的插入位置 (Phase 4)
   * @param options 查找选项
   * @returns 插入位置信息
   */
  async findRoadmapInsertPosition(options: FindInsertPositionOptions): Promise<RoadmapInsertPosition> {
    try {
      logger.info("Finding roadmap insert position with options:", options);
      const { roadmapContent, noteContent, noteTitle, notePath } = options;

      // 验证输入
      if (!roadmapContent || !noteContent || !noteTitle) {
        logger.error("Invalid input:", {
          roadmapContent: !!roadmapContent,
          noteContent: !!noteContent,
          noteTitle: !!noteTitle,
        });
        throw new Error("Roadmap content, note content, and note title are required");
      }

      // 提取 Roadmap 的章节结构
      const sections = this.extractRoadmapSections(roadmapContent);
      const sectionsInfo = sections.map(s => `第 ${s.lineNumber} 行: ${s.title}`).join("\n");

      const prompt = `分析笔记内容，确定在学习路线图中最合适的插入位置。

**笔记标题**: ${noteTitle}
**笔记内容摘要**: ${noteContent.substring(0, 500)}...

**学习路线图结构**:
${sectionsInfo}

**任务要求**:
1. 根据笔记内容的难度和主题，确定应该插入到哪个章节
2. 选择合适的行号插入（通常在该章节的核心知识点列表中）
3. 说明选择该位置的理由

**学习路线图内容**:
${roadmapContent}`;

      const response = await generateObject({
        model: this.model,
        schema: roadmapInsertPositionSchema,
        system: "You are an expert at analyzing content and determining appropriate placement in learning roadmaps. Consider the difficulty level, topic relevance, and logical flow of the roadmap.",
        prompt: prompt,
      });

      logger.info("Insert position found:", response.object);

      return {
        section: response.object.section,
        lineNumber: response.object.lineNumber,
        reasoning: response.object.reasoning,
      };

    } catch (e: any) {
      logger.error("Error finding roadmap insert position:", e);
      if (e instanceof z.ZodError) {
        throw new Error(`Invalid response format: ${e.message}`);
      }
      throw new Error(`Failed to find insert position: ${e?.message || String(e)}`);
    }
  }

  /**
   * 提取 Roadmap 的章节结构（辅助方法）
   */
  private extractRoadmapSections(content: string): Array<{ title: string; lineNumber: number; level: number }> {
    const lines = content.split("\n");
    const sections: Array<{ title: string; lineNumber: number; level: number }> = [];

    lines.forEach((line, index) => {
      // 匹配 Markdown 标题 (## 或 ###)
      const match = line.match(/^(#{2,3})\s+(.+)$/);
      if (match) {
        const level = match[1].length; // ## = 2, ### = 3
        const title = match[2].trim();
        sections.push({
          title,
          lineNumber: index + 1,
          level,
        });
      }
    });

    return sections;
  }
}
