import { z } from "zod";
import { logger } from "./logger";
import { generateObject, LanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";

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

  constructor(config: AIServiceConfig) {
    this.config = config;
    if (config.debug) {
      logger.configure(true);
    }
    this.initializeModel();
  }

  private initializeModel() {
    // Initialize model based on config.modelName
    switch (this.config.modelName) {
      case "gpt-4":
      case "gpt-4-turbo":
      case "gpt-3.5-turbo":
        this.model = openai(this.config.modelName);
        break;
      default:
        throw new Error(`Unsupported model: ${this.config.modelName}`);
    }
  }

  async generateTags(options: GenerateTagsOptions): Promise<TagSuggestion[]> {
    try {
      logger.info("Generating tags with options:", options);
      const { content, fileName, existingTags = [], customInstructions = "", count = 3 } = options;

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
      if (error instanceof z.ZodError) {
        throw new Error(`Invalid response format: ${error.message}`);
      }
      throw new Error(`Failed to generate tags: ${error.message}`);
    }
  }
}
