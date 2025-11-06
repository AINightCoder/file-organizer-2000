import * as React from "react";
import { TFile, Notice } from "obsidian";
import FileOrganizer from "../../../index";
import { logger } from "../../../services/logger";

// ============ 类型定义 ============
type SplitState = 'idle' | 'preview' | 'splitting' | 'completed';

interface AtomicNote {
  filename: string;
  content: string;
  knowledgePoint?: string;
  chunkIndex?: number;
  chunkTitle?: string;
}

interface SplitNoteSectionProps {
  plugin: FileOrganizer;
  file: TFile;
  content: string;
  onSplitComplete?: () => void;
}

interface ContentChunk {
  title: string;
  content: string;
  level: number;
}

// ============ 工具函数 ============

/**
 * 统计文本词数（兼容中英文混合）
 * - 中文字符：每个字算一个词
 * - 英文单词：按空格分隔统计
 * - 数字：连续数字算一个词
 * @param text 文本内容
 * @returns 词数
 */
function countWords(text: string): number {
  if (!text || text.trim().length === 0) return 0;

  let wordCount = 0;

  // 匹配中文字符（CJK统一表意文字）
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g);
  wordCount += chineseChars ? chineseChars.length : 0;

  // 移除中文字符后，统计英文单词和数字
  const nonChinese = text.replace(/[\u4e00-\u9fa5]/g, ' ');

  // 匹配英文单词和数字（连续的字母或数字）
  const words = nonChinese.match(/[a-zA-Z0-9]+/g);
  wordCount += words ? words.length : 0;

  return wordCount;
}

/**
 * 找到文档中所有存在的标题级别
 * @param content 笔记内容
 * @returns 按级别排序的数组（如[1,2,3]），如果没有标题则返回空数组
 */
function findAllHeaderLevels(content: string): number[] {
  const lines = content.split('\n');
  const levels = new Set<number>();

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headerMatch) {
      levels.add(headerMatch[1].length);
    }
  }

  return Array.from(levels).sort((a, b) => a - b);
}

/**
 * 找到文档中最高级别的标题（数字最小）
 * @param content 笔记内容
 * @returns 最高级别（1-6），如果没有标题则返回null
 */
function findTopHeaderLevel(content: string): number | null {
  const levels = findAllHeaderLevels(content);
  return levels.length > 0 ? levels[0] : null;
}

/**
 * 按指定级别标题拆分笔记
 * @param content 笔记内容
 * @param targetLevel 目标标题级别
 * @returns 拆分后的章节数组
 */
function splitByHeaderLevel(
  content: string,
  targetLevel: number
): ContentChunk[] {
  const chunks: ContentChunk[] = [];
  const lines = content.split('\n');
  let currentChunk: ContentChunk | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);

    // 遇到目标级别标题，开始新章节
    if (headerMatch && headerMatch[1].length === targetLevel) {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      const title = headerMatch[2].trim();
      currentChunk = { title, content: line + '\n', level: targetLevel };
    } else {
      // 累积内容到当前章节
      if (!currentChunk) {
        // 文档开头没有标题的内容
        currentChunk = { title: '前言', content: line + '\n', level: targetLevel };
      } else {
        currentChunk.content += line + '\n';
      }
    }
  }

  // 添加最后一个章节
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * 按最高级别标题拆分笔记，如果只有一个章节则尝试下一级，合并太短的章节
 * @param content 笔记内容
 * @param minChunkWords 单个章节最小词数（少于此值会和下一章合并）
 * @returns 拆分后的章节数组
 */
function splitByTopHeaders(
  content: string,
  minChunkWords = 3000
): ContentChunk[] {
  // 找到所有存在的标题级别
  const allLevels = findAllHeaderLevels(content);

  // 如果没有标题，整个文档作为一个块
  if (allLevels.length === 0) {
    return [{ title: '全文', content, level: 0 }];
  }

  // 尝试从最高级别开始拆分，如果只有1个章节则尝试下一级
  let chunks: ContentChunk[] = [];
  for (const level of allLevels) {
    chunks = splitByHeaderLevel(content, level);

    // 如果拆分出多个章节，就使用这个级别
    if (chunks.length > 1) {
      logger.info(`使用${level}级标题拆分，得到${chunks.length}个章节`);
      break;
    }
  }

  // 如果所有级别都试过了还是只有1个章节，返回原样
  if (chunks.length <= 1) {
    return chunks;
  }

  // 合并太短的章节
  const mergedChunks: ContentChunk[] = [];
  let i = 0;
  while (i < chunks.length) {
    let current = chunks[i];

    // 如果当前章节太短，且不是最后一章，则和下一章合并
    while (i < chunks.length - 1 && countWords(current.content) < minChunkWords) {
      const next = chunks[i + 1];
      current = {
        title: `${current.title}+${next.title}`,
        content: current.content + next.content,
        level: current.level
      };
      i++;
    }

    mergedChunks.push(current);
    i++;
  }

  return mergedChunks;
}

/**
 * 按标题拆分笔记为独立文件
 * @param content 笔记内容
 * @param originalFilename 原笔记文件名（不含扩展名）
 * @returns 拆分后的笔记和章节信息
 */
function splitNoteByHeaders(
  content: string,
  originalFilename: string
): { notes: AtomicNote[], chunks: ContentChunk[] } {
  logger.info(`开始按标题拆分笔记...`);

  // 根据文档总词数动态决定合并阈值
  const totalWords = countWords(content);
  const minChunkWords = totalWords < 3000 ? 500 : 3000;

  logger.info(`文档总词数: ${totalWords}, 使用合并阈值: ${minChunkWords}`);

  // 按最高级别标题拆分+合并短章节
  const chunks = splitByTopHeaders(content, minChunkWords);
  logger.info(`已分为 ${chunks.length} 个章节:`, chunks.map(c => ({ title: c.title, words: countWords(c.content) })));

  // 将每个章节转换为笔记，文件名添加原笔记名前缀
  const notes: AtomicNote[] = chunks.map((chunk, idx) => ({
    filename: `${originalFilename}_${chunk.title}`,
    content: chunk.content,
    knowledgePoint: `第${idx + 1}部分`,
    chunkIndex: idx,
    chunkTitle: chunk.title
  }));

  return { notes, chunks };
}

// ============ 主组件 ============
export const SplitNoteSection: React.FC<SplitNoteSectionProps> = ({
  plugin,
  file,
  content,
  onSplitComplete
}) => {
  // 状态管理
  const [splitState, setSplitState] = React.useState<SplitState>('idle');
  const [splitResult, setSplitResult] = React.useState<AtomicNote[]>([]);
  const [deleteOriginal, setDeleteOriginal] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [createdFiles, setCreatedFiles] = React.useState<string[]>([]);
  const [chunks, setChunks] = React.useState<ContentChunk[]>([]);

  // 计算笔记词数
  const contentWordCount = countWords(content.trim());

  // 获取长度提示
  const getLengthHint = () => {
    if (contentWordCount < 100) {
      return { text: "笔记较短", color: "fo-text-[--text-muted]" };
    } else if (contentWordCount >= 3000) {
      return { text: "💡 建议拆分（内容较长）", color: "fo-text-yellow-600" };
    } else {
      return { text: "可拆分", color: "fo-text-[--text-muted]" };
    }
  };

  const lengthHint = getLengthHint();

  // ============ 核心逻辑函数 ============

  // 1. 点击拆分按钮
  const handleSplitClick = () => {
    setError(null);
    setChunks([]);

    try {
      logger.info("开始按标题拆分笔记...");

      // 使用新的规则拆分逻辑（传入原文件名）
      const { notes, chunks: contentChunks } = splitNoteByHeaders(content, file.basename);

      logger.info("拆分结果:", notes);
      logger.info("章节信息:", contentChunks);

      // 判断是否可以拆分
      if (!notes || notes.length === 0) {
        setError('拆分失败，未找到有效章节');
        setSplitState('idle');
        return;
      }

      if (notes.length === 1) {
        const allLevels = findAllHeaderLevels(content);
        if (allLevels.length === 0) {
          setError('当前笔记无法拆分（没有找到任何标题）');
        } else {
          setError('当前笔记无法拆分（所有标题级别都只有一个标题）');
        }
        setSplitState('idle');
        return;
      }

      setSplitResult(notes);
      setChunks(contentChunks);
      setSplitState('preview');
    } catch (err: any) {
      logger.error("拆分失败:", err);
      setError(`拆分失败：${err.message || '未知错误'}`);
      setSplitState('idle');
    }
  };

  // 2. 确认拆分
  const handleConfirmSplit = async () => {
    // 验证拆分结果
    if (!splitResult || splitResult.length === 0) {
      setError('拆分结果为空，无法执行');
      return;
    }

    setSplitState('splitting');
    setError(null);
    const created: string[] = [];
    const skipped: string[] = [];

    try {
      // 直接使用原笔记所在的目录
      const targetFolderPath = file.parent ? file.parent.path : '';

      logger.info("保存拆分笔记到目录:", targetFolderPath);

      // 创建拆分后的笔记
      for (const note of splitResult) {
        if (!note.filename || !note.content) {
          logger.warn("笔记数据不完整，跳过:", note);
          skipped.push(note.filename || '(无标题)');
          continue;
        }

        // 清理文件名（移除非法字符）
        const sanitizedFilename = note.filename.replace(/[\\/:*?"<>|]/g, '_');
        const newPath = targetFolderPath ? `${targetFolderPath}/${sanitizedFilename}.md` : `${sanitizedFilename}.md`;

        logger.info("创建笔记:", newPath);

        // 检查文件是否已存在
        const existingFile = plugin.app.vault.getAbstractFileByPath(newPath);
        if (existingFile) {
          logger.warn(`文件已存在，添加后缀: ${newPath}`);
          // 添加时间戳后缀
          const timestamp = Date.now();
          const newPathWithSuffix = targetFolderPath
            ? `${targetFolderPath}/${sanitizedFilename}_${timestamp}.md`
            : `${sanitizedFilename}_${timestamp}.md`;
          await plugin.app.vault.create(newPathWithSuffix, note.content);
          created.push(`${sanitizedFilename}_${timestamp}`);
        } else {
          await plugin.app.vault.create(newPath, note.content);
          created.push(sanitizedFilename);
        }
      }

      // 检查是否创建了任何文件
      if (created.length === 0) {
        throw new Error('未成功创建任何笔记文件');
      }

      // 处理原笔记
      if (deleteOriginal) {
        logger.info("删除原笔记:", file.path);
        try {
          await plugin.app.vault.delete(file);
        } catch (err: any) {
          logger.error("删除原笔记失败:", err);
          new Notice(`⚠️ 警告：拆分成功，但删除原笔记失败：${err.message}`, 5000);
        }
      }

      setCreatedFiles(created);
      setSplitState('completed');

      // 通知父组件刷新
      onSplitComplete?.();

      // 自动打开第一个笔记
      if (created.length > 0) {
        const firstPath = targetFolderPath ? `${targetFolderPath}/${created[0]}.md` : `${created[0]}.md`;
        const firstFile = plugin.app.vault.getAbstractFileByPath(firstPath);
        if (firstFile instanceof TFile) {
          await plugin.app.workspace.getLeaf().openFile(firstFile);
        }
      }

      // 显示结果通知
      let noticeMsg = `✅ 已拆分为 ${created.length} 个笔记`;
      if (skipped.length > 0) {
        noticeMsg += `\n⚠️ ${skipped.length} 个笔记因数据不完整被跳过`;
      }
      new Notice(noticeMsg, 5000);
    } catch (err: any) {
      logger.error("拆分执行失败:", err);
      setError(`拆分失败：${err.message || '未知错误'}`);
      setSplitState('preview');
      new Notice(`❌ 拆分失败：${err.message}`, 6000);
    }
  };

  // 3. 取消拆分
  const handleCancel = () => {
    setSplitState('idle');
    setError(null);
  };

  // 4. 完成后重置
  const handleReset = () => {
    setSplitState('idle');
    setSplitResult([]);
    setError(null);
    setCreatedFiles([]);
  };

  // ============ 渲染函数 ============

  return (
    <div className="split-note-section">
      {splitState === 'idle' && (
        <IdleState
          contentWordCount={contentWordCount}
          lengthHint={lengthHint}
          onSplitClick={handleSplitClick}
          error={error}
        />
      )}

      {splitState === 'preview' && (
        <PreviewState
          splitResult={splitResult}
          chunks={chunks}
          deleteOriginal={deleteOriginal}
          onDeleteOriginalChange={setDeleteOriginal}
          onConfirm={handleConfirmSplit}
          onCancel={handleCancel}
          error={error}
        />
      )}

      {splitState === 'splitting' && (
        <SplittingState />
      )}

      {splitState === 'completed' && (
        <CompletedState
          createdFiles={createdFiles}
          splitFolderPath={file.parent ? file.parent.path : ''}
          onReset={handleReset}
        />
      )}
    </div>
  );
};

// ============ 子组件 ============

// Idle 状态
const IdleState: React.FC<{
  contentWordCount: number;
  lengthHint: { text: string; color: string };
  onSplitClick: () => void;
  error: string | null;
}> = ({ contentWordCount, lengthHint, onSplitClick, error }) => (
  <div className="step-detail fo-p-4 fo-bg-[--background-secondary] fo-rounded-lg fo-mb-4">
    <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
      📄 笔记拆分
    </h3>

    <div className="fo-mb-3 fo-space-y-2">
      <div className="fo-flex fo-items-center fo-gap-3">
        <span className="fo-text-sm fo-text-[--text-muted]">当前长度：</span>
        <span className="fo-font-medium fo-text-[--text-normal]">{contentWordCount} 词</span>
      </div>
      <div className={`fo-text-sm ${lengthHint.color}`}>
        {lengthHint.text}
      </div>
    </div>

    {error && (
      <div className="fo-mb-3 fo-p-3 fo-bg-red-50 dark:fo-bg-red-950 fo-rounded fo-border fo-border-red-200 dark:fo-border-red-800">
        <div className="fo-text-red-800 dark:fo-text-red-200 fo-text-sm">
          ℹ️ {error}
        </div>
      </div>
    )}

    <button
      onClick={onSplitClick}
      className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium"
    >
      📄 拆分当前笔记
    </button>
  </div>
);

// Preview 状态
const PreviewState: React.FC<{
  splitResult: AtomicNote[];
  chunks: ContentChunk[];
  deleteOriginal: boolean;
  onDeleteOriginalChange: (value: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  error: string | null;
}> = ({
  splitResult,
  chunks,
  deleteOriginal,
  onDeleteOriginalChange,
  onConfirm,
  onCancel,
  error
}) => (
  <div className="step-detail fo-p-4 fo-bg-[--background-secondary] fo-rounded-lg fo-mb-4">
    <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
      📄 笔记拆分 - 预览
    </h3>

    {/* 分块信息提示 */}
    {chunks.length > 0 && (
      <div className="fo-mb-3 fo-p-3 fo-bg-blue-50 dark:fo-bg-blue-950 fo-rounded fo-border fo-border-blue-200 dark:fo-border-blue-800">
        <div className="fo-text-blue-800 dark:fo-text-blue-200 fo-text-sm">
          ℹ️ 已按最高级标题拆分为 <strong>{chunks.length}</strong> 个章节：
          <ul className="fo-mt-2 fo-pl-4 fo-space-y-1">
            {chunks.map((chunk, idx) => (
              <li key={idx} className="fo-text-xs">
                • {chunk.title} ({countWords(chunk.content)} 词)
              </li>
            ))}
          </ul>
        </div>
      </div>
    )}

    <div className="fo-mb-3 fo-text-sm fo-text-[--text-muted]">
      将拆分为 {splitResult.length} 个笔记：
    </div>

    {/* 拆分结果预览 */}
    <div className="fo-mb-4 fo-space-y-3 fo-max-h-96 fo-overflow-y-auto">
      {splitResult.map((note, idx) => (
        <div
          key={idx}
          className="fo-p-3 fo-border fo-border-[--background-modifier-border] fo-rounded fo-bg-[--background-primary]"
        >
          <div className="fo-flex fo-items-center fo-gap-2 fo-mb-2">
            <span className="fo-font-semibold">{idx + 1}️⃣</span>
            <span className="fo-font-medium fo-text-[--text-normal]">
              {note.filename}
            </span>
          </div>
          {note.knowledgePoint && (
            <div className="fo-text-sm fo-text-[--text-muted] fo-ml-6 fo-mb-1">
              {note.knowledgePoint}
            </div>
          )}
          <div className="fo-text-sm fo-text-[--text-muted] fo-ml-6">
            约 {countWords(note.content)} 词
          </div>
        </div>
      ))}
    </div>

    {/* 原笔记处理选项 */}
    <div className="fo-mb-4">
      <div className="fo-text-sm fo-text-[--text-muted] fo-mb-2">
        原笔记处理
      </div>
      <div className="fo-space-y-2">
        <label className="fo-flex fo-items-center fo-gap-2 fo-cursor-pointer">
          <input
            type="radio"
            checked={deleteOriginal}
            onChange={() => onDeleteOriginalChange(true)}
            className="fo-cursor-pointer"
          />
          <span className="fo-text-sm fo-text-[--text-normal]">拆分后删除原笔记</span>
        </label>
        <label className="fo-flex fo-items-center fo-gap-2 fo-cursor-pointer">
          <input
            type="radio"
            checked={!deleteOriginal}
            onChange={() => onDeleteOriginalChange(false)}
            className="fo-cursor-pointer"
          />
          <span className="fo-text-sm fo-text-[--text-normal]">拆分后保留原笔记</span>
        </label>
      </div>
    </div>

    {error && (
      <div className="fo-mb-3 fo-p-3 fo-bg-red-50 dark:fo-bg-red-950 fo-rounded fo-border fo-border-red-200 dark:fo-border-red-800">
        <div className="fo-text-red-800 dark:fo-text-red-200 fo-text-sm">
          ❌ {error}
        </div>
      </div>
    )}

    {/* 操作按钮 */}
    <div className="fo-flex fo-gap-2">
      <button
        onClick={onConfirm}
        className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium"
      >
        ✅ 确认拆分
      </button>
      <button
        onClick={onCancel}
        className="fo-px-4 fo-py-2 fo-bg-[--background-modifier-border] fo-text-[--text-normal] fo-rounded"
      >
        ❌ 取消
      </button>
    </div>
  </div>
);

// Splitting 状态
const SplittingState: React.FC = () => (
  <div className="step-detail fo-p-4 fo-bg-[--background-secondary] fo-rounded-lg fo-mb-4">
    <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
      📄 笔记拆分
    </h3>
    <div className="fo-flex fo-items-center fo-gap-3 fo-text-[--text-muted]">
      <span className="fo-animate-spin">⏳</span>
      <span>正在创建拆分笔记...</span>
    </div>
  </div>
);

// Completed 状态
const CompletedState: React.FC<{
  createdFiles: string[];
  splitFolderPath: string;
  onReset: () => void;
}> = ({ createdFiles, splitFolderPath, onReset }) => (
  <div className="step-detail fo-p-4 fo-bg-[--background-secondary] fo-rounded-lg fo-mb-4">
    <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
      ✅ 拆分完成
    </h3>

    <div className="fo-mb-4 fo-space-y-2">
      <div className="fo-text-sm fo-text-[--text-muted]">
        已拆分为 {createdFiles.length} 个笔记：
      </div>
      <ul className="fo-pl-6 fo-space-y-1">
        {createdFiles.map((filename, idx) => (
          <li key={idx} className="fo-text-sm fo-text-[--text-normal]">
            • {filename}
          </li>
        ))}
      </ul>
      <div className="fo-text-sm fo-text-[--text-muted] fo-mt-2">
        存放位置：{splitFolderPath || '根目录'}
      </div>
    </div>

    <button
      onClick={onReset}
      className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium"
    >
      ✅ 知道了
    </button>
  </div>
);
