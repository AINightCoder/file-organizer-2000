// @ts-nocheck
import { TFile, moment, TFolder, Vault } from "obsidian";
import FileOrganizer from "../index";
import { Queue } from "./services/queue";
import {
  FileRecord,
  RecordManager,
  Action,
  FileStatus,
} from "./services/record-manager";
import { QueueStatus } from "./types";
import { logMessage } from "../someUtils";
import { IdService } from "./services/id-service";
import { logger } from "../services/logger";
import {
  initializeTokenCounter,
  getTokenCount,
  cleanup,
} from "../utils/token-counter";
import { isValidExtension, VALID_MEDIA_EXTENSIONS } from "../constants";
import {
  safeCreate,
  safeRename,
  safeCopy,
  safeMove,
  safeModifyContent as safeModify,
} from "../fileUtils";

// Move constants to the top level and ensure they're used consistently
const MAX_CONCURRENT_TASKS = 5;
const MAX_CONCURRENT_MEDIA_TASKS = 2;

export interface FolderSuggestion {
  isNewFolder: boolean;
  score: number;
  folder: string;
  reason: string;
}

export interface LogEntry {
  id: string;
  fileName: string;
  timestamp: string;
  status: "queued" | "processing" | "completed" | "error";
  newPath?: string;
  newName?: string;
  classification?: string;
  addedTags?: string[];
  errors?: string[];
  messages: string[];
}

interface EventRecord {
  id: string;
  fileRecordId: string;
  timestamp: string;
  message: string;
  metadata?: Record<string, any>;
}

interface SplitNote {
  filename: string;
  content: string;
  knowledgePoint?: string;
  metadata?: {
    title: string;
    cate: string;
    subcate: string;
    tags: string[];
    summary: string;
  };
}

// Phase 2: 增强元数据接口
interface EnhancedMetadata {
  title: string;
  category: string;
  subcategory?: string;
  tags: string[];
  summary: string;
  source?: string;
  credibility?: number;
  created?: string;
  updated?: string;
}

interface ProcessingContext {
  inboxFile: TFile;
  containerFile?: TFile;
  attachmentFile?: TFile;
  hash: string;
  content?: string;
  newPath?: string;
  newName?: string;
  tags?: string[];
  plugin: FileOrganizer;
  recordManager: RecordManager;
  idService: IdService;
  queue: Queue<TFile>;
  formattedContent?: string;
  classification?: {
    documentType: string;
    confidence: number;
    reasoning: string;
  };
  suggestedTags?: Array<{
    score: number;
    isNew: boolean;
    tag: string;
    reason: string;
  }>;

  // ===== 新增字段：拆分相关 =====
  splitNotes?: SplitNote[];
  isAtomicNote?: boolean;       // 标记是否是拆分后的笔记
  parentHash?: string;          // 父笔记的hash（用于追踪）
  splitIndex?: number;          // 拆分序号（1/2/3...）

  // ===== Phase 2: 增强元数据 =====
  enhancedMetadata?: EnhancedMetadata;  // 增强元数据

  // ===== Phase 3: 智能分类 =====
  intelligentClassification?: {
    targetFolder: string;      // 目标文件夹路径
    category: string;          // 一级分类
    subcategory?: string;      // 二级分类
    level3?: string;           // 三级分类
    confidence: number;        // 置信度
    reason: string;            // 分类理由
    shouldCreateFolder: boolean; // 是否需要创建文件夹
  };

  // ===== Phase 4: Roadmap关联 =====
  roadmapFile?: TFile;         // Roadmap 文件
  roadmapInsertPosition?: {
    section: string;           // 插入的章节
    lineNumber: number;        // 插入的行号
    reasoning: string;         // 插入理由
  };
}

interface StepValidation {
  isValid: boolean;
  reason?: string;
}

function validateContext(
  context: ProcessingContext,
  requiredFields: (keyof ProcessingContext)[]
): StepValidation {
  for (const field of requiredFields) {
    if (!context[field]) {
      return {
        isValid: false,
        reason: `Missing required field: ${field}`,
      };
    }
  }
  return { isValid: true };
}

function assertInvariant(condition: boolean, message: string) {
  if (!condition) {
    logger.error(`Invariant violation: ${message}`);
    throw new Error(`Invariant violation: ${message}`);
  }
}

export class Inbox {
  protected static instance: Inbox;
  private plugin: FileOrganizer;
  private activeMediaTasks = 0;
  private mediaQueue: Array<TFile> = [];

  private queue: Queue<TFile>;
  private recordManager: RecordManager;
  private idService: IdService;

  private constructor(plugin: FileOrganizer) {
    this.plugin = plugin;
    console.log("initializing inbox", plugin.settings, plugin.app);
    this.recordManager = RecordManager.getInstance(plugin.app);
    this.idService = IdService.getInstance();
    this.initializeQueue();
  }

  public static initialize(plugin: FileOrganizer): Inbox {
    if (!Inbox.instance) {
      Inbox.instance = new Inbox(plugin);
    }
    return Inbox.instance;
  }

  public static getInstance(): Inbox {
    if (!Inbox.instance) {
      throw new Error("Inbox not initialized. Call initialize() first.");
    }
    return Inbox.instance;
  }

  public static cleanup(): void {
    if (Inbox.instance) {
      Inbox.instance.queue.clear();
      cleanup(); // Clean up token counter
      // @ts-ignore - We know what we're doing here
      Inbox.instance = null;
    }
  }

  public enqueueFile(file: TFile): void {
    this.enqueueFiles([file]);
  }

  public enqueueFiles(files: TFile[]): void {
    logMessage(`Enqueuing ${files.length} files`);

    // Separate media and non-media files
    const [mediaFiles, regularFiles] = files.reduce<[TFile[], TFile[]]>(
      (acc, file) => {
        if (this.plugin.shouldCreateMarkdownContainer(file)) {
          acc[0].push(file);
        } else {
          acc[1].push(file);
        }
        return acc;
      },
      [[], []]
    );

    // First enqueue regular files
    for (const file of regularFiles) {
      const hash = this.idService.generateFileHash(file);
      this.recordManager.startTracking(hash, file.basename);
      this.queue.add(file, { metadata: { hash } });
    }

    // Then enqueue media files
    for (const file of mediaFiles) {
      const hash = this.idService.generateFileHash(file);
      this.recordManager.startTracking(hash, file.basename);
      this.queue.add(file, { metadata: { hash } });
    }

    logMessage(
      `Enqueued ${regularFiles.length} regular files and ${mediaFiles.length} media files`
    );
  }

  private initializeQueue(): void {
    this.queue = new Queue<TFile>({
      concurrency: MAX_CONCURRENT_TASKS,
      timeout: 30000,
      onProcess: async (file: TFile, metadata?: Record<string, any>) => {
        try {
          const isMediaFile = this.plugin.shouldCreateMarkdownContainer(file);

          if (isMediaFile) {
            // Check if we can process more media files
            if (this.activeMediaTasks >= MAX_CONCURRENT_MEDIA_TASKS) {
              // Add to media queue and skip for now
              this.mediaQueue.push(file);
              if (metadata?.hash) {
                this.queue.remove(metadata.hash);
              }
              return;
            }
            this.activeMediaTasks++;
          }

          await this.processInboxFile(file, metadata?.hash);

          if (isMediaFile) {
            this.activeMediaTasks--;
            // Process next media file if available
            this.processNextMediaFile();
          }
        } finally {
          if (metadata?.hash) {
            this.queue.remove(metadata.hash);
          }
        }
      },
      onComplete: () => {},
      onError: (error: Error) => {
        logger.error("Queue processing error:", error);
      },
    });
  }

  private async processNextMediaFile(): Promise<void> {
    if (
      this.mediaQueue.length === 0 ||
      this.activeMediaTasks >= MAX_CONCURRENT_MEDIA_TASKS
    ) {
      return;
    }

    const nextFile = this.mediaQueue.shift();
    if (nextFile) {
      const hash = this.idService.generateFileHash(nextFile);
      this.queue.add(nextFile, { metadata: { hash } });
    }
  }

  public getFileStatus(filePath: string): FileRecord | undefined {
    // return this.recordManager.getRecordByPath(filePath);
    return undefined;
  }

  public getFileEvents(fileId: string): EventRecord[] {
    // return this.recordManager.getFileEvents(fileId);
    return [];
  }

  public getAllFiles(): FileRecord[] {
    return this.recordManager.getAllRecords();
  }

  public getQueueStats(): QueueStatus {
    return this.queue.getStats();
  }

  public getMediaProcessingStats(): { active: number; queued: number } {
    return {
      active: this.activeMediaTasks,
      queued: this.mediaQueue.length,
    };
  }

  public getAnalytics(): {
    byStatus: Record<FileStatus, number>;
    totalFiles: number;
    mediaStats: {
      active: number;
      queued: number;
    };
    queueStats: QueueStatus;
  } {
    const records = this.getAllFiles();
    const byStatus = records.reduce((acc, record) => {
      acc[record.status] = (acc[record.status] || 0) + 1;
      return acc;
    }, {} as Record<FileStatus, number>);

    return {
      byStatus,
      totalFiles: records.length,
      mediaStats: this.getMediaProcessingStats(),
      queueStats: this.getQueueStats(),
    };
  }

  // Refactored method using parallel processing where possible
  private async processInboxFile(
    inboxFile: TFile,
    hash?: string
  ): Promise<void> {
    this.recordManager.setStatus(hash, "processing");

    const context: ProcessingContext = {
      inboxFile,
      hash,
      plugin: this.plugin,
      recordManager: this.recordManager,
      idService: this.idService,
      queue: this.queue,
    };

    try {
      // ===== 前置步骤（1-6）=====
      await executeStep(
        context,
        startProcessing,
        Action.CLEANUP,
        Action.ERROR_CLEANUP
      );
      await executeStep(
        context,
        hasValidFileStep,
        Action.VALIDATE,
        Action.ERROR_VALIDATE
      );
      await executeStep(
        context,
        getContainerFileStep,
        Action.CONTAINER,
        Action.ERROR_CONTAINER
      );
      await executeStep(
        context,
        moveAttachmentFile,
        Action.MOVING_ATTACHMENT,
        Action.ERROR_MOVING_ATTACHMENT
      );
      await executeStep(
        context,
        getContentStep,
        Action.EXTRACT,
        Action.ERROR_EXTRACT
      );
      await executeStep(
        context,
        cleanupStep,
        Action.CLEANUP,
        Action.ERROR_CLEANUP
      );

      // ===== 拆分判断点 =====
      if (shouldSplitNote(context)) {
        logger.info("开始笔记拆分流程", { hash: context.hash });

        // 执行拆分步骤
        await executeStep(
          context,
          atomicSplitStep,
          Action.ATOMIC_SPLIT,
          Action.ERROR_ATOMIC_SPLIT
        );
        await executeStep(
          context,
          lengthSplitStep,
          Action.LENGTH_SPLIT,
          Action.ERROR_LENGTH_SPLIT
        );

        // 如果成功拆分
        if (context.splitNotes && context.splitNotes.length > 0) {
          logger.info("拆分成功，开始递归处理", {
            hash: context.hash,
            count: context.splitNotes.length,
          });

          // 删除原笔记
          await executeStep(
            context,
            deleteOriginalNoteStep,
            Action.DELETE_ORIGINAL,
            Action.ERROR_DELETE_ORIGINAL
          );

          // 递归处理每个拆分后的笔记
          for (let i = 0; i < context.splitNotes.length; i++) {
            const splitNote = context.splitNotes[i];

            logger.info("处理拆分笔记", {
              index: i + 1,
              total: context.splitNotes.length,
              filename: splitNote.filename,
            });

            try {
              // 创建新文件（在inbox目录）
              const newFile = await safeCreate(
                context.plugin.app,
                `${context.plugin.settings.pathToWatch}/${splitNote.filename}.md`,
                splitNote.content
              );

              // 如果是第一个笔记且有附件，附加附件
              if (i === 0 && context.attachmentFile) {
                await context.plugin.app.vault.append(
                  newFile,
                  `\n\n![[${context.attachmentFile.name}]]`
                );
              }

              // 创建子上下文并递归处理
              const childContext = createChildContext(context, newFile, splitNote);
              context.recordManager.startTracking(childContext.hash, splitNote.filename);

              // 递归调用（子笔记会被标记为 isAtomicNote，不会再次拆分）
              await this.processInboxFile(newFile, childContext.hash);

            } catch (error) {
              logger.error("处理拆分笔记失败", {
                index: i + 1,
                filename: splitNote.filename,
                error,
              });
              // 继续处理下一个笔记
            }
          }

          // 标记原笔记处理完成
          context.recordManager.setStatus(context.hash, "completed");
          return; // 不再继续处理原笔记
        }
      }

      // ===== 后续步骤（7-13）- 正常处理流程 =====
      await executeStep(
        context,
        recommendClassificationStep,
        Action.CLASSIFY,
        Action.ERROR_CLASSIFY
      );
      await executeStep(
        context,
        recommendFolderStep,
        Action.MOVING,
        Action.ERROR_MOVING
      );
      await executeStep(
        context,
        recommendNameStep,
        Action.RENAME,
        Action.ERROR_RENAME
      );
      await executeStep(
        context,
        formatContentStep,
        Action.FORMATTING,
        Action.ERROR_FORMATTING
      );
      await executeStep(
        context,
        appendAttachmentStep,
        Action.APPEND,
        Action.ERROR_APPEND
      );
      await executeStep(
        context,
        recommendTagsStep,
        Action.TAGGING,
        Action.ERROR_TAGGING
      );
      // Phase 2: 增强元数据处理
      await executeStep(
        context,
        generateEnhancedMetadataStep,
        Action.GENERATE_METADATA,
        Action.ERROR_GENERATE_METADATA
      );
      await executeStep(
        context,
        applyMetadataStep,
        Action.APPLY_METADATA,
        Action.ERROR_APPLY_METADATA
      );
      // Phase 3: 智能分类处理
      await executeStep(
        context,
        intelligentClassificationStep,
        Action.INTELLIGENT_CLASSIFY,
        Action.ERROR_INTELLIGENT_CLASSIFY
      );
      await executeStep(
        context,
        moveToClassifiedFolderStep,
        Action.MOVE_TO_FOLDER,
        Action.ERROR_MOVE_TO_FOLDER
      );
      // Phase 4: Roadmap 关联处理
      await executeStep(
        context,
        findOrCreateRoadmapStep,
        Action.FIND_ROADMAP,
        Action.ERROR_FIND_ROADMAP
      );
      await executeStep(
        context,
        linkToRoadmapStep,
        Action.LINK_TO_ROADMAP,
        Action.ERROR_LINK_TO_ROADMAP
      );
      await executeStep(
        context,
        completeProcessing,
        Action.COMPLETED,
        Action.ERROR_COMPLETE
      );
    } catch (error) {
      await handleError(error, context);
      logger.error("Error processing inbox file:", error);
    }
  }
}
async function moveAttachmentFile(
  context: ProcessingContext
): Promise<ProcessingContext> {
  if (VALID_MEDIA_EXTENSIONS.includes(context.inboxFile.extension)) {
    context.attachmentFile = context.inboxFile;
    await safeMove(
      context.plugin.app,
      context.inboxFile,
      context.plugin.settings.attachmentsPath
    );
  }
  return context;
}

async function getContainerFileStep(
  context: ProcessingContext
): Promise<ProcessingContext> {
  logger.info("Get container file step");
  if (VALID_MEDIA_EXTENSIONS.includes(context.inboxFile?.extension)) {
    const containerFile = await safeCreate(
      context.plugin.app,
      context.inboxFile.basename + ".md",
      ""
    );
    context.containerFile = containerFile;
  } else {
    context.containerFile = context.inboxFile;
  }
  context.recordManager.setFile(context.hash, context.containerFile);
  // return the inboxFile if it is not a media file
  return context;
}

async function hasValidFileStep(
  context: ProcessingContext
): Promise<ProcessingContext> {
  // check if file is valid
  logger.info("Has valid file step");
  // check if file is supported if not bypass
  if (!isValidExtension(context.inboxFile?.extension)) {
    await handleBypass(context, "Unsupported file type");
    throw new Error("Unsupported file type");
  }
  return context;
}

async function recommendNameStep(
  context: ProcessingContext
): Promise<ProcessingContext> {
  const newName = await context.plugin.recommendName(
    context.content,
    context.containerFile.basename
  );
  context.newName = newName[0]?.title;
  // if new name is the same as the old name then don't rename
  if (context.newName === context.containerFile.basename) {
    return context;
  }
  context.recordManager.setNewName(context.hash, context.newName);
  await safeRename(context.plugin.app, context.containerFile, context.newName);
  return context;
}

async function recommendFolderStep(
  context: ProcessingContext
): Promise<ProcessingContext> {
  assertInvariant(
    !!context.content,
    "Content must be available before folder recommendation"
  );
  assertInvariant(
    !!context.containerFile,
    "Container file must exist before moving"
  );

  const newPath = await context.plugin.recommendFolders(
    context.content,
    context.inboxFile.basename
  );

  assertInvariant(
    !!newPath?.[0]?.folder,
    "Folder recommendation must return a valid path"
  );

  context.newPath = newPath[0]?.folder;
  console.log("new path", context.newPath, context.containerFile);
  await safeMove(context.plugin.app, context.containerFile, context.newPath);
  context.recordManager.setFolder(context.hash, context.newPath);
  console.log("moved file to", context.containerFile);

  return context;
}

async function recommendClassificationStep(
  context: ProcessingContext
): Promise<ProcessingContext> {
  // Validate required context
  const validation = validateContext(context, ["content", "containerFile"]);
  if (!validation.isValid) {
    throw new Error(
      `Classification step validation failed: ${validation.reason}`
    );
  }

  const templateNames = await context.plugin.getTemplateNames();
  const result = await context.plugin.classifyContentV2(
    `${context.content}, ${context.containerFile.name}`,
    templateNames
  );
  logger.info("Classification result", result);
  if (!result) return context;
  context.classification = {
    documentType: result,
    confidence: 100,
    reasoning: "N/A",
  };
  return context;
}

// Pipeline processing steps

async function startProcessing(
  context: ProcessingContext
): Promise<ProcessingContext> {
  console.log("startProcessing", context);
  return context;
}

async function getContentStep(
  context: ProcessingContext
): Promise<ProcessingContext> {
  const fileToRead = context.inboxFile;
  const content = await context.plugin.getTextFromFile(fileToRead);
  context.content = content;
  await context.plugin.app.vault.modify(context.containerFile, content);
  return context;
}

async function cleanupStep(
  context: ProcessingContext
): Promise<ProcessingContext> {
  try {
    // Early return if no content
    if (!context.content) {
      await handleBypass(context, "No content available");
    }

    // Strip front matter and trim
    const contentWithoutFrontMatter = context.content
      .replace(/^---\n[\s\S]*?\n---\n/, "")
      .trim();

    // Bypass if content is too short
    if (contentWithoutFrontMatter.length < 5) {
      await handleBypass(context, "Content too short (less than 5 characters)");
    }

    // Set the cleaned content back
    context.content = contentWithoutFrontMatter;
    return context;
  } catch (error) {
    logger.error("Error in preprocessContentStep:", error);
    throw error;
  }
}

// New helper function to handle bypassing
async function handleBypass(
  context: ProcessingContext,
  reason: string
): Promise<void> {
  try {
    logger.info("Bypassing file", context.inboxFile);
    // First mark as bypassed in the record manager

    // Then move the file
    const bypassedFolderPath = context.plugin.settings.bypassedFilePath;
    await safeMove(context.plugin.app, context.inboxFile, bypassedFolderPath);

    context.queue.bypass(context.hash);
    context.recordManager.setStatus(context.hash, "bypassed");
    throw new Error("Bypassed due to " + reason);
  } catch (error) {
    logger.error("Error in handleBypass:", error);
    throw error;
  }
}

async function formatContentStep(
  context: ProcessingContext
): Promise<ProcessingContext> {
  if (!context.classification) {
    logger.info("Skipping formatting: no classification available");
    return context;
  }
  // Early return if no classification
  if (!context.classification.documentType) {
    logger.info("Skipping formatting: no classification available");
    return context;
  }

  // Early return if classification confidence is too low
  if (context.classification.confidence < 80) {
    logger.info("Skipping formatting: classification confidence too low", {
      confidence: context.classification.confidence,
    });
    return context;
  }

  // Early return if no content
  if (!context.content) {
    logger.info("Skipping formatting: no content available");
    return context;
  }

  logger.info("Formatting content step", context.classification);

  // get token amount from token counter
  await initializeTokenCounter();
  const tokenAmount = getTokenCount(context.content);
  cleanup();
  if (tokenAmount > context.plugin.settings.maxFormattingTokens) {
    logger.info("Skipping formatting: content too large", {
      tokenAmount,
      maxFormattingTokens: context.plugin.settings.maxFormattingTokens,
    });
    return context;
  }

  try {
    const instructions = await context.plugin.getTemplateInstructions(
      context.classification.documentType
    );

    if (!instructions) {
      logger.info("Skipping formatting: no instructions available");
      return context;
    }

    const formattedContent = await context.plugin.formatContentV2(
      context.content,
      instructions
    );
    context.formattedContent = formattedContent;

    const referenceFile = await safeCopy(
      context.plugin.app,
      context.containerFile,
      context.plugin.settings.referencePath
    );

    await safeModify(
      context.plugin.app,
      context.containerFile,
      formattedContent
    );

    const markdownLink = context.plugin.app.fileManager.generateMarkdownLink(
      referenceFile,
      context.containerFile.parent.path
    );
    await context.plugin.app.vault.append(
      context.containerFile,
      `\n\n---\nThis file is formatted and the original file is: ${markdownLink}\n\n---\n\n`
    );

    return context;
  } catch (error) {
    logger.error("Error in formatContentStep:", error);
    throw error;
  }
}
async function recommendTagsStep(
  context: ProcessingContext
): Promise<ProcessingContext> {
  const existingTags = await context.plugin.getAllVaultTags();
  const tags = await context.plugin.recommendTags(
    context.content,
    context.containerFile.path,
    existingTags
  );
  context.tags = tags?.map(t => t.tag);
  // for each tag, append it to the file
  for (const tag of context.tags) {
    await context.plugin.appendTag(context.containerFile, tag);
  }
  context.recordManager.setTags(context.hash, context.tags);
  return context;
}
async function appendAttachmentStep(
  context: ProcessingContext
): Promise<ProcessingContext> {
  if (context.attachmentFile) {
    context.plugin.app.vault.append(
      context.containerFile,
      `\n\n![[${context.attachmentFile.name}]]`
    );
  }
  return context;
}

async function completeProcessing(
  context: ProcessingContext
): Promise<ProcessingContext> {
  context.recordManager.setStatus(context.hash, "completed");
  return context;
}

// Error handling

async function handleError(
  error: any,
  context: ProcessingContext
): Promise<void> {
  const lastError = context.recordManager.getLastError(context.hash);

  logger.error(`Error in step ${lastError?.action}:`, {
    error: error.message,
    step: lastError?.action,
    file: context.inboxFile.path,
  });

  context.recordManager.setStatus(context.hash, "error");

  // Different handling based on error type
  switch (lastError?.action) {
    case Action.ERROR_ATOMIC_SPLIT:
    case Action.ERROR_LENGTH_SPLIT:
      // 拆分失败不阻断流程，继续按原笔记处理
      logger.warn("拆分失败，继续按原笔记处理", {
        hash: context.hash,
        error: error.message,
      });
      context.splitNotes = []; // 清空拆分结果
      // 不抛出错误，继续后续步骤
      break;

    case Action.ERROR_DELETE_ORIGINAL:
      // 删除原笔记失败，需要回滚
      logger.error("删除原笔记失败，需要清理拆分笔记", {
        hash: context.hash,
      });
      await rollbackSplitNotes(context);
      await moveFileToErrorFolder(context);
      break;

    case Action.ERROR_MOVING_ATTACHMENT:
    case Action.ERROR_MOVING:
      // Handle file system errors
      await moveFileToErrorFolder(context);
      break;
    case Action.ERROR_CLASSIFY:
    case Action.ERROR_TAGGING:
      // Handle AI-related errors
      await moveToBackupFolder(context);
      break;
    default:
      // Default error handling
      await moveFileToErrorFolder(context);
  }
}

// moveToBackupFolder
async function moveToBackupFolder(context: ProcessingContext): Promise<void> {
  await safeMove(
    context.plugin.app,
    context.inboxFile,
    context.plugin.settings.backupFolderPath
  );
}

// Helper functions for file operations
async function moveFileToErrorFolder(
  context: ProcessingContext
): Promise<void> {
  await safeMove(
    context.plugin.app,
    context.inboxFile,
    context.plugin.settings.errorFilePath
  );
}

// Helper functions for initialization and usage
export function initializeInboxQueue(plugin: FileOrganizer): void {
  Inbox.cleanup();
  Inbox.initialize(plugin);
}

export function enqueueFiles(files: TFile[]): void {
  Inbox.getInstance().enqueueFiles(files);
}

export function getInboxStatus(): QueueStatus {
  return Inbox.getInstance().getQueueStats();
}
// ===== 知识管理：拆分相关函数 =====

/**
 * 判断是否需要拆分笔记
 */
function shouldSplitNote(context: ProcessingContext): boolean {
  const settings = context.plugin.settings;

  // 功能未启用
  if (!settings.enableKnowledgeManagement) {
    return false;
  }

  // 已经是原子化笔记（避免无限递归）
  if (context.isAtomicNote) {
    logger.info("跳过拆分：已经是原子化笔记", { hash: context.hash });
    return false;
  }

  // 内容太短
  const contentLength = context.content?.length || 0;
  if (contentLength < settings.minNoteLength) {
    logger.info("跳过拆分：内容太短", {
      hash: context.hash,
      length: contentLength
    });
    return false;
  }

  // 非文本文件（媒体文件等）
  if (context.attachmentFile) {
    logger.info("跳过拆分：非文本文件", { hash: context.hash });
    return false;
  }

  return true;
}

/**
 * 知识点原子化拆分步骤
 */
async function atomicSplitStep(
  context: ProcessingContext
): Promise<ProcessingContext> {
  const settings = context.plugin.settings;

  // 检查是否启用原子化拆分
  if (!settings.enableAtomicSplit) {
    logger.info("跳过原子化拆分：功能未启用");
    return context;
  }

  logger.info("开始原子化拆分", {
    hash: context.hash,
    filename: context.containerFile.basename
  });

  try {
    // 调用AI服务进行拆分
    const aiService = context.plugin.aiService;
    if (!aiService) {
      throw new Error("AI服务未初始化");
    }

    const atomicNotes = await aiService.splitIntoAtomicNotes({
      content: context.content,
      filename: context.containerFile.basename,
      customPrompt: settings.atomicSplitPrompt
    });

    logger.info("原子化拆分完成", {
      hash: context.hash,
      count: atomicNotes.length
    });

    // 如果只返回一个笔记且内容相同，说明无需拆分
    if (atomicNotes.length === 1 &&
        atomicNotes[0].content.trim() === context.content.trim()) {
      logger.info("无需拆分：内容已是单一知识点");
      context.splitNotes = [];
      return context;
    }

    // 存储拆分结果
    context.splitNotes = atomicNotes.map((note) => ({
      filename: note.filename,
      content: note.content,
      knowledgePoint: note.knowledgePoint,
    }));

    return context;
  } catch (error) {
    logger.error("原子化拆分失败", error);
    // 拆分失败不应阻断流程，继续后续处理
    context.splitNotes = [];
    return context;
  }
}

/**
 * 按最大字数拆分步骤
 */
async function lengthSplitStep(
  context: ProcessingContext
): Promise<ProcessingContext> {
  const settings = context.plugin.settings;

  // 如果没有拆分结果，检查是否需要按长度拆分
  if (!context.splitNotes || context.splitNotes.length === 0) {
    const contentLength = context.content?.length || 0;

    if (contentLength > settings.maxNoteLength) {
      logger.info("开始按长度拆分", {
        hash: context.hash,
        length: contentLength,
        maxLength: settings.maxNoteLength
      });

      try {
        const aiService = context.plugin.aiService;
        if (!aiService) {
          throw new Error("AI服务未初始化");
        }

        const fragments = await aiService.splitByLength({
          content: context.content,
          maxLength: settings.maxNoteLength,
          customPrompt: settings.lengthSplitPrompt
        });

        logger.info("按长度拆分完成", {
          hash: context.hash,
          count: fragments.length
        });

        // 生成拆分笔记
        context.splitNotes = fragments.map((fragment, index) => ({
          filename: `${context.containerFile.basename} ${index + 1}`,
          content: fragment,
        }));
      } catch (error) {
        logger.error("按长度拆分失败", error);
        context.splitNotes = [];
      }
    }
  } else {
    // 对每个原子化拆分的笔记检查长度
    const newSplitNotes: SplitNote[] = [];

    for (const note of context.splitNotes) {
      if (note.content.length > settings.maxNoteLength) {
        logger.info("原子笔记超长，进行长度拆分", {
          filename: note.filename,
          length: note.content.length,
        });

        try {
          const aiService = context.plugin.aiService;
          if (!aiService) {
            throw new Error("AI服务未初始化");
          }

          const fragments = await aiService.splitByLength({
            content: note.content,
            maxLength: settings.maxNoteLength,
            customPrompt: settings.lengthSplitPrompt
          });

          // 为每个片段生成独立笔记
          fragments.forEach((fragment, index) => {
            newSplitNotes.push({
              filename: `${note.filename} ${index + 1}`,
              content: fragment,
              knowledgePoint: note.knowledgePoint,
            });
          });
        } catch (error) {
          logger.error("原子笔记长度拆分失败", error);
          // 失败时保留原笔记
          newSplitNotes.push(note);
        }
      } else {
        newSplitNotes.push(note);
      }
    }

    context.splitNotes = newSplitNotes;
  }

  return context;
}

/**
 * 删除原笔记步骤
 */
async function deleteOriginalNoteStep(
  context: ProcessingContext
): Promise<ProcessingContext> {
  // 只有在成功拆分时才删除
  if (context.splitNotes && context.splitNotes.length > 0) {
    logger.info("删除原笔记", {
      hash: context.hash,
      filename: context.containerFile.basename
    });

    try {
      await context.plugin.app.vault.delete(context.containerFile);

      // 如果有附件文件也一起处理
      if (context.attachmentFile &&
          context.attachmentFile !== context.containerFile) {
        // 保留附件，后续会附加到第一个拆分笔记
      }

      logger.info("原笔记已删除", { hash: context.hash });
    } catch (error) {
      logger.error("删除原笔记失败", error);
      throw error;
    }
  }

  return context;
}

/**
 * 创建子上下文（用于递归处理）
 */
function createChildContext(
  parentContext: ProcessingContext,
  newFile: TFile,
  splitNote: SplitNote
): ProcessingContext {
  const childHash = parentContext.idService.generateFileHash(newFile);

  return {
    inboxFile: newFile,
    containerFile: newFile,
    hash: childHash,
    content: splitNote.content,
    plugin: parentContext.plugin,
    recordManager: parentContext.recordManager,
    idService: parentContext.idService,
    queue: parentContext.queue,

    // 标记为原子化笔记（避免无限递归）
    isAtomicNote: true,
    parentHash: parentContext.hash,
  };
}

/**
 * 回滚拆分笔记（当删除原笔记失败时）
 */
async function rollbackSplitNotes(context: ProcessingContext): Promise<void> {
  if (!context.splitNotes || context.splitNotes.length === 0) {
    return;
  }

  logger.info("开始回滚拆分笔记", {
    hash: context.hash,
    count: context.splitNotes.length,
  });

  for (const splitNote of context.splitNotes) {
    try {
      const filePath = `${context.plugin.settings.pathToWatch}/${splitNote.filename}.md`;
      const file = context.plugin.app.vault.getAbstractFileByPath(filePath);

      if (file instanceof TFile) {
        await context.plugin.app.vault.delete(file);
        logger.info("已删除拆分笔记", { filename: splitNote.filename });
      }
    } catch (error) {
      logger.error("删除拆分笔记失败", {
        filename: splitNote.filename,
        error,
      });
    }
  }
}

// skip actions when settings below are false
function shouldSkipAction(context: ProcessingContext, action: Action): boolean {
  switch (action) {
    case Action.CLASSIFY:
      return !context.plugin.settings.enableDocumentClassification;
    case Action.FORMATTING:
      return !context.plugin.settings.enableDocumentClassification;
    case Action.RENAME:
      return !context.plugin.settings.enableFileRenaming;
    case Action.TAGGING:
      return !context.plugin.settings.useSimilarTags;
    // Phase 2: 增强元数据
    case Action.GENERATE_METADATA:
    case Action.APPLY_METADATA:
      return !context.plugin.settings.enableEnhancedMetadata;
    // Phase 3: 智能分类
    case Action.INTELLIGENT_CLASSIFY:
    case Action.MOVE_TO_FOLDER:
      return !context.plugin.settings.enableIntelligentClassification;
    // Phase 4: Roadmap关联
    case Action.FIND_ROADMAP:
    case Action.LINK_TO_ROADMAP:
      return !context.plugin.settings.enableRoadmapLinking;
    default:
      return false;
  }
}

async function executeStep(
  context: ProcessingContext,
  step: (context: ProcessingContext) => Promise<ProcessingContext>,
  action: Action,
  errorAction: Action
): Promise<ProcessingContext> {
  try {
    if (shouldSkipAction(context, action)) {
      context.recordManager.skipAction(context.hash, action);
      return context;
    }

    context.recordManager.addAction(context.hash, action);
    const result = await step(context);
    context.recordManager.completeAction(context.hash, action);
    return result;
  } catch (error) {
    context.recordManager.addAction(context.hash, errorAction);
    context.recordManager.addError(context.hash, {
      action: errorAction,
      message: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

// ===== Phase 2: 增强元数据相关函数 =====

/**
 * 生成增强元数据步骤
 */
async function generateEnhancedMetadataStep(
  context: ProcessingContext
): Promise<ProcessingContext> {
  const settings = context.plugin.settings;

  // 检查是否启用增强元数据
  if (!settings.enableEnhancedMetadata) {
    logger.info("跳过元数据生成：功能未启用");
    return context;
  }

  logger.info("开始生成增强元数据", {
    hash: context.hash,
    filename: context.containerFile.basename
  });

  try {
    const aiService = context.plugin.aiService;
    if (!aiService) {
      throw new Error("AI服务未初始化");
    }

    // 获取已有分类（从知识库文件夹中提取）
    const existingCategories = await getExistingCategories(context);

    // 调用AI服务生成元数据
    const metadata = await aiService.generateEnhancedMetadata({
      content: context.content,
      filename: context.containerFile.basename,
      existingCategories,
      customPrompt: settings.enhancedMetadataPrompt,
    });

    logger.info("增强元数据生成完成", {
      hash: context.hash,
      metadata,
    });

    context.enhancedMetadata = metadata;
    return context;

  } catch (error) {
    logger.error("生成增强元数据失败", error);
    // 元数据生成失败不阻断流程
    return context;
  }
}

/**
 * 应用元数据到文件 Frontmatter
 */
async function applyMetadataStep(
  context: ProcessingContext
): Promise<ProcessingContext> {
  // 如果没有生成元数据，跳过
  if (!context.enhancedMetadata) {
    logger.info("跳过应用元数据：未生成元数据");
    return context;
  }

  logger.info("开始应用元数据到 Frontmatter", {
    hash: context.hash,
    filename: context.containerFile.basename
  });

  try {
    const metadata = context.enhancedMetadata;
    const file = context.containerFile;

    // 读取当前文件内容
    let content = await context.plugin.app.vault.read(file);

    // 构建 YAML frontmatter
    const frontmatter = `---
title: ${metadata.title}
category: ${metadata.category}
${metadata.subcategory ? `subcategory: ${metadata.subcategory}` : ''}
tags: [${metadata.tags.join(', ')}]
summary: ${metadata.summary}
${metadata.source ? `source: ${metadata.source}` : ''}
${metadata.credibility ? `credibility: ${metadata.credibility}` : ''}
created: ${metadata.created}
updated: ${metadata.updated}
---

`;

    // 检查文件是否已有 frontmatter
    const frontmatterRegex = /^---\n[\s\S]*?\n---\n/;
    if (frontmatterRegex.test(content)) {
      // 替换已有的 frontmatter
      content = content.replace(frontmatterRegex, frontmatter);
    } else {
      // 添加新的 frontmatter
      content = frontmatter + content;
    }

    // 写入文件
    await context.plugin.app.vault.modify(file, content);

    logger.info("元数据应用完成", { hash: context.hash });
    return context;

  } catch (error) {
    logger.error("应用元数据失败", error);
    throw error;
  }
}

/**
 * 获取已有分类列表
 */
async function getExistingCategories(context: ProcessingContext): Promise<string[]> {
  try {
    const knowledgeBaseRoot = context.plugin.settings.knowledgeBaseRoot;
    const folder = context.plugin.app.vault.getAbstractFileByPath(knowledgeBaseRoot);

    if (!folder || !(folder instanceof TFolder)) {
      return [];
    }

    // 获取一级子文件夹作为分类
    const categories: string[] = [];
    for (const child of folder.children) {
      if (child instanceof TFolder) {
        categories.push(child.name);
      }
    }

    logger.info("已有分类", { count: categories.length, categories });
    return categories;

  } catch (error) {
    logger.error("获取已有分类失败", error);
    return [];
  }
}

// ===== Phase 3: 智能分类相关函数 =====

// Import AI service types for Phase 3
import type { FolderStructure, IntelligentClassification } from "../services/ai_service";

/**
 * 获取知识库文件夹结构（Phase 3）
 */
async function getKnowledgeBaseStructure(context: ProcessingContext): Promise<FolderStructure[]> {
  try {
    const knowledgeBaseRoot = context.plugin.settings.knowledgeBaseRoot;
    const folder = context.plugin.app.vault.getAbstractFileByPath(knowledgeBaseRoot);

    if (!folder || !(folder instanceof TFolder)) {
      logger.warn("知识库根目录不存在", { knowledgeBaseRoot });
      return [];
    }

    const structure: FolderStructure[] = [];

    // 递归构建文件夹结构树
    function buildStructure(folder: TFolder, parentPath: string = "", level: number = 1): FolderStructure {
      const folderStructure: FolderStructure = {
        path: folder.path,
        name: folder.name,
        level: level,
        parent: parentPath || undefined,
        children: [],
      };

      // 遍历子文件夹（只包含文件夹，不包含文件）
      for (const child of folder.children) {
        if (child instanceof TFolder) {
          const childStructure = buildStructure(child, folder.path, level + 1);
          folderStructure.children.push(childStructure);
        }
      }

      return folderStructure;
    }

    // 构建一级文件夹结构
    for (const child of folder.children) {
      if (child instanceof TFolder) {
        structure.push(buildStructure(child, folder.path, 1));
      }
    }

    logger.info("知识库结构获取完成", {
      rootPath: knowledgeBaseRoot,
      topLevelFolders: structure.length,
    });

    return structure;
  } catch (error) {
    logger.error("获取知识库结构失败", error);
    return [];
  }
}

/**
 * 智能分类步骤 (Phase 3)
 */
async function intelligentClassificationStep(
  context: ProcessingContext
): Promise<ProcessingContext> {
  const settings = context.plugin.settings;

  // 检查是否启用智能分类
  if (!settings.enableIntelligentClassification) {
    logger.info("跳过智能分类：功能未启用");
    return context;
  }

  // 必须有元数据才能进行智能分类
  if (!context.enhancedMetadata) {
    logger.info("跳过智能分类：未生成元数据");
    return context;
  }

  logger.info("开始智能分类", {
    hash: context.hash,
    filename: context.containerFile.basename,
    category: context.enhancedMetadata.category,
  });

  try {
    const aiService = context.plugin.aiService;
    if (!aiService) {
      throw new Error("AI服务未初始化");
    }

    // 获取知识库结构
    const knowledgeBaseStructure = await getKnowledgeBaseStructure(context);

    // 调用 AI 服务进行智能分类
    const classification = await aiService.generateIntelligentClassification({
      content: context.content,
      metadata: context.enhancedMetadata,
      knowledgeBaseStructure,
    });

    logger.info("智能分类完成", {
      hash: context.hash,
      targetFolder: classification.targetFolder,
      confidence: classification.confidence,
    });

    // 存储分类结果到 context
    context.intelligentClassification = {
      targetFolder: classification.targetFolder,
      category: classification.category,
      subcategory: classification.subcategory,
      level3: classification.level3,
      confidence: classification.confidence,
      reason: classification.reason,
      shouldCreateFolder: classification.shouldCreateFolder,
    };

    return context;
  } catch (error) {
    logger.error("智能分类失败", error);
    // 分类失败不阻断流程，继续使用默认路径
    return context;
  }
}

/**
 * 移动到分类文件夹步骤 (Phase 3)
 */
async function moveToClassifiedFolderStep(
  context: ProcessingContext
): Promise<ProcessingContext> {
  // 如果没有分类结果，跳过
  if (!context.intelligentClassification) {
    logger.info("跳过移动文件：未进行智能分类");
    return context;
  }

  const classification = context.intelligentClassification;

  logger.info("开始移动到分类文件夹", {
    hash: context.hash,
    targetFolder: classification.targetFolder,
  });

  try {
    const targetFolder = classification.targetFolder;
    const app = context.plugin.app;

    // 检查目标文件夹是否存在
    let folder = app.vault.getAbstractFileByPath(targetFolder);

    // 如果文件夹不存在且需要创建
    if (!folder && classification.shouldCreateFolder) {
      logger.info("目标文件夹不存在，开始创建", {
        targetFolder,
      });

      // 递归创建文件夹路径
      await createFolderRecursively(app, targetFolder);
      folder = app.vault.getAbstractFileByPath(targetFolder);
    }

    // 确认文件夹存在后再移动
    if (folder && folder instanceof TFolder) {
      // 移动文件到目标文件夹
      await safeMove(app, context.containerFile, targetFolder);

      logger.info("文件移动完成", {
        hash: context.hash,
        targetFolder,
        filename: context.containerFile.basename,
      });

      // 更新记录
      context.newPath = targetFolder;
      context.recordManager.setFolder(context.hash, targetFolder);
    } else {
      throw new Error(`目标文件夹不存在或创建失败: ${targetFolder}`);
    }

    return context;
  } catch (error) {
    logger.error("移动到分类文件夹失败", error);
    throw error;
  }
}

/**
 * 递归创建文件夹路径
 */
async function createFolderRecursively(app: any, folderPath: string): Promise<void> {
  const parts = folderPath.split("/").filter(p => p.length > 0);
  let currentPath = "";

  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;

    // 检查当前路径是否存在
    const existing = app.vault.getAbstractFileByPath(currentPath);
    if (!existing) {
      logger.info("创建文件夹", { path: currentPath });
      await app.vault.createFolder(currentPath);
    }
  }
}

// ===== Phase 4: Roadmap 关联相关函数 =====

/**
 * 查找或创建 Roadmap 步骤 (Phase 4)
 */
async function findOrCreateRoadmapStep(
  context: ProcessingContext
): Promise<ProcessingContext> {
  const settings = context.plugin.settings;

  // 检查是否启用 Roadmap 关联
  if (!settings.enableRoadmapLinking) {
    logger.info("跳过 Roadmap 关联：功能未启用");
    return context;
  }

  // 必须有分类信息和元数据
  if (!context.intelligentClassification || !context.enhancedMetadata) {
    logger.info("跳过 Roadmap 关联：未进行分类或未生成元数据");
    return context;
  }

  logger.info("开始查找或创建 Roadmap", {
    hash: context.hash,
    category: context.intelligentClassification.category,
    subcategory: context.intelligentClassification.subcategory,
  });

  try {
    const classification = context.intelligentClassification;
    const metadata = context.enhancedMetadata;

    // 构建 Roadmap 文件路径
    // 格式：{targetFolder}/01.Roadmap/{领域} Roadmap.md
    const roadmapFolder = `${classification.targetFolder}/${settings.roadmapFolder}`;
    const roadmapFileName = `${metadata.category} Roadmap.md`;
    const roadmapPath = `${roadmapFolder}/${roadmapFileName}`;

    logger.info("Roadmap 路径", { roadmapPath });

    // 检查 Roadmap 文件是否存在
    let roadmapFile = context.plugin.app.vault.getAbstractFileByPath(roadmapPath) as TFile;

    if (!roadmapFile) {
      // Roadmap 不存在，创建新的
      logger.info("Roadmap 不存在，开始生成", { domain: metadata.category });

      // 确保文件夹存在
      await createFolderRecursively(context.plugin.app, roadmapFolder);

      // 调用 AI 服务生成 Roadmap
      const aiService = context.plugin.aiService;
      if (!aiService) {
        throw new Error("AI服务未初始化");
      }

      const roadmapContent = await aiService.generateRoadmap({
        domain: metadata.category,
        customPrompt: settings.roadmapPrompt,
      });

      // 创建 Roadmap 文件
      roadmapFile = await context.plugin.app.vault.create(roadmapPath, roadmapContent);
      logger.info("Roadmap 创建成功", { path: roadmapPath });

    } else {
      // Roadmap 存在，检查是否有效
      const roadmapContent = await context.plugin.app.vault.read(roadmapFile);

      if (roadmapContent.trim().length < 100) {
        // 内容太短，重新生成
        logger.info("Roadmap 内容太短，重新生成", { path: roadmapPath });

        const aiService = context.plugin.aiService;
        if (!aiService) {
          throw new Error("AI服务未初始化");
        }

        const newRoadmapContent = await aiService.generateRoadmap({
          domain: metadata.category,
          customPrompt: settings.roadmapPrompt,
        });

        await context.plugin.app.vault.modify(roadmapFile, newRoadmapContent);
        logger.info("Roadmap 重新生成完成", { path: roadmapPath });
      }
    }

    // 存储 Roadmap 文件到 context
    context.roadmapFile = roadmapFile;

    logger.info("Roadmap 查找/创建完成", {
      hash: context.hash,
      roadmapPath: roadmapFile.path,
    });

    return context;
  } catch (error) {
    logger.error("查找/创建 Roadmap 失败", error);
    // Roadmap 关联失败不阻断流程
    return context;
  }
}

/**
 * 链接到 Roadmap 步骤 (Phase 4)
 */
async function linkToRoadmapStep(
  context: ProcessingContext
): Promise<ProcessingContext> {
  // 如果没有 Roadmap 文件，跳过
  if (!context.roadmapFile) {
    logger.info("跳过链接到 Roadmap：未找到 Roadmap 文件");
    return context;
  }

  logger.info("开始链接到 Roadmap", {
    hash: context.hash,
    roadmapPath: context.roadmapFile.path,
    notePath: context.containerFile.path,
  });

  try {
    const aiService = context.plugin.aiService;
    if (!aiService) {
      throw new Error("AI服务未初始化");
    }

    // 读取 Roadmap 内容
    const roadmapContent = await context.plugin.app.vault.read(context.roadmapFile);

    // 调用 AI 服务查找插入位置
    const insertPosition = await aiService.findRoadmapInsertPosition({
      roadmapContent,
      noteContent: context.content,
      noteTitle: context.containerFile.basename,
      notePath: context.containerFile.path,
    });

    logger.info("找到插入位置", {
      section: insertPosition.section,
      lineNumber: insertPosition.lineNumber,
      reasoning: insertPosition.reasoning,
    });

    // 存储插入位置信息
    context.roadmapInsertPosition = {
      section: insertPosition.section,
      lineNumber: insertPosition.lineNumber,
      reasoning: insertPosition.reasoning,
    };

    // 在 Roadmap 中插入双向链接
    await insertBacklinkToRoadmap(
      context.plugin.app,
      context.roadmapFile,
      insertPosition,
      context.containerFile
    );

    logger.info("链接到 Roadmap 完成", {
      hash: context.hash,
      section: insertPosition.section,
    });

    return context;
  } catch (error) {
    logger.error("链接到 Roadmap 失败", error);
    throw error;
  }
}

/**
 * 在 Roadmap 中插入双向链接（辅助函数）
 */
async function insertBacklinkToRoadmap(
  app: any,
  roadmapFile: TFile,
  position: { lineNumber: number; section: string; prependLines?: string[] },
  noteFile: TFile
): Promise<void> {
  try {
    // 读取 Roadmap 内容
    const content = await app.vault.read(roadmapFile);
    const lines = content.split("\n");

    // 构建双向链接
    const backlink = `[[${noteFile.basename}]]`;

    // 检查链接是否已存在
    if (content.includes(backlink)) {
      logger.info("链接已存在，跳过插入", {
        roadmapPath: roadmapFile.path,
        notePath: noteFile.path,
      });
      return;
    }

    // 在指定行号插入（行号从1开始，数组索引从0开始）
    let insertIndex = Math.max(0, Math.min(position.lineNumber - 1, lines.length));
    // 如需创建模块/知识点，先插入这些行
    if (position.prependLines && position.prependLines.length > 0) {
      lines.splice(insertIndex, 0, ...position.prependLines);
      insertIndex += position.prependLines.length;
    }
    // 再插入双链
    lines.splice(insertIndex, 0, backlink);

    // 写回文件
    await app.vault.modify(roadmapFile, lines.join("\n"));

    logger.info("双向链接插入成功", {
      roadmapPath: roadmapFile.path,
      notePath: noteFile.path,
      lineNumber: position.lineNumber,
    });
  } catch (error) {
    logger.error("插入双向链接失败", error);
    throw error;
  }
}
