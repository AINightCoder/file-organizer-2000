import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOllama } from "ollama-ai-provider";

const DEFAULT_MODEL = process.env.DEFAULT_MODEL;
// 创建 DeepSeek 客户端
const deepseek = createOpenAICompatible({
  name: "deepseek",
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  headers: {
    Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
  },
});

// 创建 Ollama 客户端
const ollama = createOllama({
  // custom settings
  baseURL: process.env.OLLAMA_BASE_URL || "http://192.168.1.177:11434/api",
});

const models = {
  "deepseek-chat": deepseek("deepseek-chat"),
  "ollama-qwen2.5": ollama("qwen2.5:32b-instruct-q4_K_M"),
  "ollama-llama3.2": ollama("llama3.2"),
  "ollama-phi4": ollama("phi4"),
  "gpt-4o": createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })("gpt-4o"),
  "gpt-4o-2024-08-06": createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })("gpt-4o-2024-08-06"),
  "gpt-4o-mini": createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })("gpt-4o-mini"),
  "claude-3-5-sonnet-20240620": createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })("claude-3-5-sonnet-20240620"),
  "claude-3-5-sonnet-20241022": createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })("claude-3-5-sonnet-20241022"),
  "claude-3-5-haiku-20241022": createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })("claude-3-5-haiku-20241022"),
  "gemini-2.0-flash-exp": createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
  })("gemini-2.0-flash-exp", {
    useSearchGrounding: true,
  }),
  "gemini-1.5-pro-search": createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
  })("gemini-1.5-pro"),
  // bedrock
  ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        // Llama Models
        "llama-3-3-70b": createAmazonBedrock({
          region: process.env.AWS_REGION || "us-west-2",
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        })("meta.llama3-3-70b-instruct-v1:0"),
        "llama-3-2-90b": createAmazonBedrock({
          region: process.env.AWS_REGION || "us-west-2",
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        })("meta.llama3-2-90b-instruct-v1:0"),
        // Mistral Models
        "mistral-large": createAmazonBedrock({
          region: process.env.AWS_REGION || "us-west-2",
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        })("mistral.mistral-large-2407-v1:0"),
        "mixtral-8x7b": createAmazonBedrock({
          region: process.env.AWS_REGION || "us-west-2",
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        })("mistral.mixtral-8x7b-instruct-v0:1"),
        // Anthropic Models
        "anthropic.claude-3-5-sonnet-20240620-v1:0": createAmazonBedrock({
          region: process.env.AWS_REGION || "us-west-2",
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        })("anthropic.claude-3-5-sonnet-20240620-v1:0"),
        "anthropic.claude-3-5-haiku-20241022-v1:0": createAmazonBedrock({
          region: process.env.AWS_REGION || "us-west-2",
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        })("anthropic.claude-3-5-haiku-20241022-v1:0"),
      }
    : {}),
};

// 环境变量验证
// const validateEnvVariables = () => {
//   const requiredVars = {
//     DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
//     DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
//   };

//   const missingVars = Object.entries(requiredVars)
//     .filter(([_, value]) => !value)
//     .map(([key]) => key);

//   if (missingVars.length > 0) {
//     console.warn(
//       `Missing required environment variables: ${missingVars.join(", ")}`
//     );
//     throw new Error(
//       `Missing required environment variables: ${missingVars.join(", ")}`
//     );
//   }
// };
// validateEnvVariables();

// 单例模型实例
// let modelInstance = null;

// // 获取模型实例
// const getModelInstance = () => {
//   if (!modelInstance) {
//     try {
//       modelInstance = deepseek(FORCE_MODEL);
//       console.log(`Created new instance of ${FORCE_MODEL}`);
//     } catch (error) {
//       console.error(`Failed to create ${FORCE_MODEL} instance:`, error);
//       throw error;
//     }
//   }
//   return modelInstance;
// };

// export const getModel = (name?: string) => {
//   // 忽略传入的模型名称，始终返回 deepseek-chat
//   if (name && name !== FORCE_MODEL) {
//     console.warn(
//       `Requested model "${name}" ignored, using ${FORCE_MODEL} instead`
//     );
//   }

//   try {
//     const instance = getModelInstance();
//     console.log(`Using model ${FORCE_MODEL}`);
//     return instance;
//   } catch (error) {
//     console.error("Error getting model:", error);
//     throw error;
//   }
// };

// 只返回强制使用的模型
// export const getAvailableModels = () => {
//   return [FORCE_MODEL];
// };

export const getModel = (name: string) => {
  if (!models[name]) {
    console.log(`Model ${name} not found`);
    console.log(`Defaulting to ${DEFAULT_MODEL}`);
    return models[DEFAULT_MODEL];
  }
  console.log(`Using model ${name}`);
  return models[name];
};

export const getAvailableModels = () => {
  return Object.keys(models);
};
