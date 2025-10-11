export class FileOrganizerSettings {
  API_KEY = "";
  isLicenseValid = false;
  useLogs = true;
  defaultDestinationPath = ".fileorganizer2000/Processed";
  referencePath = ".fileorganizer2000/References";
  attachmentsPath = ".fileorganizer2000/Processed/Attachments";
  pathToWatch = ".fileorganizer2000/Inbox";
  logFolderPath = ".fileorganizer2000/Logs";
  backupFolderPath = ".fileorganizer2000/Backups";
  templatePaths = ".fileorganizer2000/Templates";
  fabricPaths = ".fileorganizer2000/Fabric";
  bypassedFilePath = ".fileorganizer2000/Bypassed";
  errorFilePath = ".fileorganizer2000/Errors";

  // inbox settings
  useSimilarTags = true;
  enableDocumentClassification = false;
  // not working atm
  enableFileRenaming = true;

  renameInstructions =
    "If document has a human readable name, use it. Otherwise, create a concise, descriptive name for the document based on its key content. Prioritize clarity and searchability, using specific terms that will make the document easy to find later. Avoid generic words and focus on unique, identifying elements.";
  usePro = true;
  useSimilarTagsInFrontmatter = false;
  enableAtomicNotes = false;
  ignoreFolders = [""];
  stagingFolder = ".fileorganizer2000/staging";
  enableSelfHosting = false;
  selfHostingURL = "http://localhost:3000";
  enableScreenpipe = false;
  enableFabric = false;
  useFolderEmbeddings = false;
  useVaultTitles = true;
  customFolderInstructions = "";

  selectedModel: "gpt-4o" | "llama3.2" | "gemini-2.0-flash-exp" = "gpt-4o";
  Model_BASE_URL="https://api.deepseek.com";
  Model_API_KEY="sk-e4ad7f13f96747c38168a0cd8ec346f2";
  Model_Name="deepseek";
  customModelName = "llama3.2";

  DEFAULT_MODEL="google";
  
  DEEPSEEK_BASE_URL="https://api.deepseek.com";
  DEEPSEEK_API_KEY="sk-e4ad7f13f96747c38168a0cd8ec346f2";
  DEEPSEEK_MODEL="deepseek-chat";

  MINIMAX_BASE_URL="https://api.minimax.chat/v1";
  MINIMAX_API_KEY="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJHcm91cE5hbWUiOiLpq5jlgaUiLCJVc2VyTmFtZSI6IumrmOWBpSIsIkFjY291bnQiOiIiLCJTdWJqZWN0SUQiOiIxODc5MTc0MDkzMzc5NDg2MTEyIiwiUGhvbmUiOiIxNTcxMDU3OTIxNiIsIkdyb3VwSUQiOiIxODc5MTc0MDkzMzY2OTAzMjAwIiwiUGFnZU5hbWUiOiIiLCJNYWlsIjoiIiwiQ3JlYXRlVGltZSI6IjIwMjUtMDEtMTggMTA6MDI6MDkiLCJUb2tlblR5cGUiOjEsImlzcyI6Im1pbmltYXgifQ.bWQ4dNCBxe0r03YT_W7f5ULN-1qcx4rLX5Rru-7JJQEipQWorkQdF5FamoS8KAwF1rk8Nqlin9FfpHe9C60oaaOh9IxA_Yok4OiCQpGGyy7HlMzUdTjMoePFDcfQHjaJdt2yADOP_NxVWNsnjk6KRyWohPZXDuKfrT0B15gngsJ7qFaOiCnElp1aAU-9uG-6GItCi4YkK8r5xj_YrxOiOFbNHY8tEnljz5NKhQrdhP_Wc8eWGmhwNLYONCwZMk4YHEmGDeY0bOAqw4xVkc3EH6boBOmWflg-tkksClpub8EmOBzPKHKR4Um66EvsyjevY1HrhsSMLVXWArrejpS-qQ";
  MINIMAX_MODEL="MiniMax-Text-01";

  SILICONFLOW_BASE_URL="https://api.siliconflow.cn/v1";
  SILICONFLOW_API_KEY="sk-sgctuzhvqkhvopraqiqisvgmjscfyjnnhariipzecxkyzgzf";
  SILICONFLOW_MODEL="deepseek-ai/DeepSeek-V3";
  // SILICONFLOW_MODEL="meta-llama/Llama-3.3-70B-Instruct"
  // SILICONFLOW_MODEL="Qwen/Qwen2.5-72B-Instruct-128K"

  OLLAMA_BASE_URL="http://192.168.1.177:11434/api";
  // OLLAMA_MODEL="deepseek-r1:32b"
  // OLLAMA_MODEL="deepseek-coder-v2:16b"
  OLLAMA_MODEL="qwen2.5:32b-instruct-q4_K_M";
  // OLLAMA_MODEL="llama3.2"
  // OLLAMA_MODEL="phi4"

  OPENAI_BASE_URL="";
  OPENAI_API_KEY="";
  OPENAI_MODEL="gpt-4o";
  // OPENAI_MODEL=gpt-4o-2024-08-06
  // OPENAI_MODEL=gpt-4o-mini

  ANTHROPIC_API_KEY="";
  ANTHROPIC_MODEL = "claude-3-5-sonnet-20240620";
  // ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
  // ANTHROPIC_MODEL=claude-3-5-haiku-20241022

  GOOGLE_API_KEY="AIzaSyDgEEWTvaopxXSOw2m8hbKE6iKIpjgXFZQ";
  GOOGLE_MODEL="gemini-2.0-flash";
  // GOOGLE_MODEL=gemini-1.5-pro

  tagScoreThreshold = 70;
  formatBehavior: "override" | "newFile" = "override";
  useInbox = false;
  enableAutoProcessing = false;
  imageInstructions =
    "Analyze the image and provide a clear, detailed description focusing on the main elements, context, and any text visible in the image. Include relevant details that would be useful for searching and organizing the image later.";
  debugMode = false;
  enableTitleSuggestions = false;
  // use for sampling of the recommend fucntions
  contentCutoffChars = 1000;
  // use to prevent formatting of big file
  maxFormattingTokens = 100 * 1000;
  screenpipeTimeRange = 8; // Default to 8 hours
  // used only in screenpipe right now
  queryScreenpipeLimit = 250;
  customTagInstructions =
    "Generate tags that capture the main topics, themes, and type of content in the document. Focus on specific, meaningful tags that will help with organization and retrieval.";
  hasCatalystAccess = null;
  isManualRefresh = true; // 是否只在手动刷新时重新生成建议

  // ===== 知识管理相关配置 =====

  // 总开关
  enableKnowledgeManagement = true;

  // 原子化拆分
  enableAtomicSplit = true;          // 启用知识点原子化拆分
  maxNoteLength = 3000;              // 单个笔记最大字符数
  minNoteLength = 100;               // 笔记最小长度（低于此值不拆分）

  // 知识库结构
  knowledgeBaseRoot = "1.Area";      // 知识库根目录
  projectRoot = "2.Project";         // 项目根目录
  archiveRoot = "3.Archive";         // 归档根目录

  // 拆分策略
  splitStrategy: "atomic" | "length" | "both" = "both";

  // AI 提示词
  atomicSplitPrompt = '分析以下笔记内容，按照单一知识点原则拆分成独立的原子化笔记。\n\n要求：\n1. 每个笔记专注一个核心概念或知识点\n2. 保持每个笔记的语义完整性和独立性\n3. 为每个笔记提供清晰的标题和知识点说明\n4. 如果内容本身已经是单一知识点，返回包含原内容的单个笔记\n\n原文件名：${filename}\n\n笔记内容：\n${content}';

  // 元数据模板（阶段2）
  enableEnhancedMetadata = false;    // 启用增强元数据

  // 智能分类（阶段3）
  enableIntelligentClassification = false; // 启用智能分类系统

  // Roadmap关联（阶段4）
  enableRoadmapLinking = false;      // 启用Roadmap自动关联
  roadmapFolder = "01.Roadmap";      // Roadmap文件夹名称
}

export const DEFAULT_SETTINGS = new FileOrganizerSettings();
