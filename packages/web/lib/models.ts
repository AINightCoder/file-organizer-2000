import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

// 强制使用单一模型配置
const FORCE_MODEL = "deepseek-chat" as const;

// 环境变量验证
const validateEnvVariables = () => {
  const requiredVars = {
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
  };

  const missingVars = Object.entries(requiredVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    console.warn(`Missing required environment variables: ${missingVars.join(', ')}`);
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
};

validateEnvVariables();

// 创建 DeepSeek 客户端
const deepseek = createOpenAICompatible({
  name: 'deepseek',
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  headers: {
    Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
  },
});

// 单例模型实例
let modelInstance: any = null;

// 获取模型实例
const getModelInstance = () => {
  if (!modelInstance) {
    try {
      modelInstance = deepseek(FORCE_MODEL);
      console.log(`Created new instance of ${FORCE_MODEL}`);
    } catch (error) {
      console.error(`Failed to create ${FORCE_MODEL} instance:`, error);
      throw error;
    }
  }
  return modelInstance;
};

export const getModel = (name?: string) => {
  // 忽略传入的模型名称，始终返回 deepseek-chat
  if (name && name !== FORCE_MODEL) {
    console.warn(`Requested model "${name}" ignored, using ${FORCE_MODEL} instead`);
  }
  
  try {
    const instance = getModelInstance();
    console.log(`Using model ${FORCE_MODEL}`);
    return instance;
  } catch (error) {
    console.error("Error getting model:", error);
    throw error;
  }
};

// 只返回强制使用的模型
export const getAvailableModels = () => {
  return [FORCE_MODEL];
};

// 导出配置供其他模块使用
export const MODEL_SETTINGS = {
  DEFAULT: FORCE_MODEL,
  FALLBACK: FORCE_MODEL,
  CURRENT: FORCE_MODEL,
} as const;

// 为了向后兼容，保留一些可能被其他地方使用的接口
export const DEFAULT_MODEL = FORCE_MODEL;
export const isModelAvailable = (name: string) => name === FORCE_MODEL;
