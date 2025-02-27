import { z } from "zod";
import { logger } from "./logger";
import { generateObject, LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOllama } from "ollama-ai-provider";
import { FileOrganizerSettings } from "../settings";

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

// Schema definitions
const tagsSchema = z.object({
  suggestedTags: z.array(z.object({
    score: z.number().min(0).max(100),
    isNew: z.boolean(),
    tag: z.string(),
    reason: z.string(),
  }))
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

export class AIService {
  private config: FileOrganizerSettings;
  private model: LanguageModel;
  private models: Record<string, LanguageModel>;
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
        "openai": createOpenAI({apiKey: this.config.OPENAI_API_KEY,})(this.config.OPENAI_MODEL || "gpt-4o"),
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
      const response = await generateObject({
        model: this.model,
        schema: tagsSchema,
        system: `You are a precise tag generator. Analyze content and suggest ${count} relevant tags.
                ${existingTags.length ? `Consider existing tags: ${existingTags.join(", ")}` : 'Create new tags if needed.'}
                ${customInstructions ? `Follow these custom instructions: ${customInstructions}` : ''}
                
                Guidelines:
                - Prefer existing tags when appropriate (score them higher)
                - Create specific, meaningful new tags when needed
                - Score based on relevance (0-100)
                - Include brief reasoning for each tag
                - Focus on key themes, topics, and document type`,
        prompt: `File: "${fileName}"
                
                Content: """
                ${content}
                """`,
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

    } catch (error) {
      logger.error("Error generating tags:", error);
      throw error;
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
      const response = await generateObject({
        model: this.model,
        schema: titleSchema,
        system: `Given the content and file name: "${fileName}", suggest exactly ${count} clear titles. Avoid special characters. ${
          customInstructions ? `Instructions: "${customInstructions}"` : ""
        }`,
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

    } catch (error) {
      logger.error("Error generating title:", error);
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid response format: ${error.message}`);
      }
      throw new Error(`Failed to generate title: ${error.message}`);
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

      const response = await generateObject({
        model: this.model,
        schema: folderSchema,
        system: `Given the content and file name: "${fileName}", suggest exactly ${count} folders. You can use: ${folders.join(
          ", "
        )}. If none are relevant, suggest new folders. ${
          customInstructions ? `Instructions: "${customInstructions}"` : ""
        }`,
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

    } catch (error) {
      logger.error("Error generating folder suggestions:", error);
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid response format: ${error.message}`);
      }
      throw new Error(`Failed to generate folder suggestions: ${error.message}`);
    }
  }
}
