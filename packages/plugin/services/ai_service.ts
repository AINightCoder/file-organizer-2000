import { z } from "zod";
import { logger } from "./logger";
import { generateObject, LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOllama } from "ollama-ai-provider";

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

// Schema definitions
const tagsSchema = z.object({
  suggestedTags: z.array(z.object({
    score: z.number().min(0).max(100),
    isNew: z.boolean(),
    tag: z.string(),
    reason: z.string(),
  }))
});

export class AIService {
  private config: AIServiceConfig;
  private model: LanguageModel;
  private models: Record<string, LanguageModel>;
  private initialized: boolean = false;

  constructor(config: AIServiceConfig) {
    if (!config.apiKey) {
      logger.error("No API key provided");
    //   throw new Error("API key is required");
    }

    this.config = config;
    if (config.debug) {
      logger.configure(true);
    }

    try {
      this.initializeModels();
      this.model = this.getModel(config.modelName);
      this.initialized = true;
      logger.info("AIService initialized with model:", config.modelName);
    } catch (error) {
      logger.error("Failed to initialize AIService:", error);
      throw error;
    }
  }

  private initializeModels() {
    const deepseek = createOpenAICompatible({
      name: "deepseek",
      baseURL: this.config.baseURL || "https://api.deepseek.com",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });
    const minimax = createOpenAICompatible({
      name: "minimax",
      baseURL: this.config.baseURL || "https://api.minimax.chat/v1",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });
    const siliconflow = createOpenAICompatible({
      name: "siliconflow",
      baseURL: this.config.baseURL || "https://api.siliconflow.cn/v1",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });
    const ollama = createOllama({
      baseURL: this.config.baseURL || "http://192.168.1.177:11434/api",
    });

    this.models = {
        "deepseek": deepseek(process.env.DEEPSEEK_MODEL || "deepseek-chat"),
        "minimax": minimax(process.env.MINIMAX_MODEL || "minimax"),
        "siliconflow": siliconflow(process.env.SILICONFLOW_MODEL || "siliconflow"),
        "ollama": ollama(process.env.OLLAMA_MODEL || "phi4"),
        "openai": createOpenAI({apiKey: process.env.OPENAI_API_KEY,})(process.env.OPENAI_MODEL || "gpt-4o"),
        "anthropic": createAnthropic({apiKey: process.env.ANTHROPIC_API_KEY,})(process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20240620"),
        "google": createGoogleGenerativeAI({apiKey: process.env.GOOGLE_API_KEY,})(process.env.GOOGLE_MODEL || "gemini-2.0-flash-exp", {useSearchGrounding: true,}),
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

      this.model = this.getModel(this.config.modelName);
      logger.info(`Using model ${this.config.modelName} : ${this.model} from ${this.models}`);
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
}
