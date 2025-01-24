import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOllama } from "ollama-ai-provider";

const DEFAULT_MODEL = process.env.DEFAULT_MODEL;
const deepseek = createOpenAICompatible({
  name: "deepseek",
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  headers: {
    Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
  },
});
const minimax = createOpenAICompatible({
  name: "minimax",
  baseURL: process.env.MINIMAX_BASE_URL || "https://api.minimax.chat/v1",
  headers: {
    Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`,
  },
});
const siliconflow = createOpenAICompatible({
  name: "siliconflow",
  baseURL: process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1",
  headers: {
    Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY}`,
  },
});
const ollama = createOllama({
  baseURL: process.env.OLLAMA_BASE_URL || "http://192.168.1.177:11434/api",
});

const models = {
  deepseek: deepseek(process.env.DEEPSEEK_MODEL || "deepseek-chat"),
  minimax: minimax(process.env.MINIMAX_MODEL || "minimax"),
  siliconflow: siliconflow(process.env.SILICONFLOW_MODEL || "siliconflow"),
  ollama: ollama(process.env.OLLAMA_MODEL || "phi4"),
  openai: createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })(process.env.OPENAI_MODEL || "gpt-4o"),
  anthropic: createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })(process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20240620"),
  google: createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
  })(process.env.GOOGLE_MODEL || "gemini-2.0-flash-exp", {
    useSearchGrounding: true,
  }),
  // bedrock
  ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        aws: createAmazonBedrock({
          region: process.env.AWS_REGION || "us-west-2",
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        })(process.env.AWS_MODEL || "meta.llama3-3-70b-instruct-v1:0"),
      }
    : {}),
};

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
