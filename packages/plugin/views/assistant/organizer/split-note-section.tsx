import * as React from "react";
import { TFile, Notice } from "obsidian";
import FileOrganizer from "../../../index";
import { DEFAULT_ATOMIC_SPLIT_PROMPT } from "../../../prompts";
import { logger } from "../../../services/logger";

// ============ 类型定义 ============
type SplitState = 'idle' | 'analyzing' | 'preview' | 'splitting' | 'completed';

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
 * 按标题层级智能分块
 * @param content 笔记内容
 * @param maxChunkSize 单块最大字符数
 * @param minChunkSize 单块最小字符数
 * @returns 分块后的内容数组
 */
function chunkByHeaders(
  content: string,
  maxChunkSize = 8000,
  minChunkSize = 1000
): ContentChunk[] {
  const chunks: ContentChunk[] = [];
  const lines = content.split('\n');
  let currentChunk: ContentChunk = { title: '开始部分', content: '', level: 999 };

  for (const line of lines) {
    // 匹配 Markdown 标题 (## 或 ### 或 ####)
    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);

    if (headerMatch) {
      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();

      // 遇到同级或更高级标题，且当前块满足最小长度，就切分
      if (level <= currentChunk.level && currentChunk.content.length >= minChunkSize) {
        chunks.push(currentChunk);
        currentChunk = { title, content: line + '\n', level };
      } else {
        // 否则继续累积内容
        currentChunk.content += line + '\n';
        // 如果是第一次遇到标题，更新当前块的标题
        if (currentChunk.level === 999) {
          currentChunk.title = title;
          currentChunk.level = level;
        }
      }
    } else {
      currentChunk.content += line + '\n';
    }

    // 强制分块：超过最大长度，在下一个标题处切分
    if (currentChunk.content.length > maxChunkSize) {
      // 如果已经很长，立即切分（即使没遇到标题）
      if (currentChunk.content.length > maxChunkSize * 1.5) {
        chunks.push(currentChunk);
        currentChunk = { title: '继续部分', content: '', level: 999 };
      }
      // 否则等待下一个标题再切分（上面的逻辑会处理）
    }
  }

  // 最后一块
  if (currentChunk.content.trim().length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * 两阶段处理：先规则分块，再AI原子化
 * @param content 笔记内容
 * @param filename 笔记文件名
 * @param plugin FileOrganizer 插件实例
 * @param customPrompt 自定义提示词
 * @returns 所有原子化笔记
 */
async function splitLargeNote(
  content: string,
  filename: string,
  plugin: FileOrganizer,
  customPrompt: string
): Promise<{ notes: AtomicNote[], chunks: ContentChunk[] }> {
  const LARGE_NOTE_THRESHOLD = 10000; // 10k字符以上才分块

  // 短笔记：直接AI拆分
  if (content.length < LARGE_NOTE_THRESHOLD) {
    const result = await plugin.aiService.splitIntoAtomicNotes({
      content,
      filename,
      customPrompt
    });
    return { notes: result, chunks: [] };
  }

  // 长笔记：第一阶段 - 规则分块
  logger.info(`笔记过长 (${content.length}字符)，开始分块处理...`);
  const chunks = chunkByHeaders(content, 8000, 1000);
  logger.info(`已分为 ${chunks.length} 个块:`, chunks.map(c => ({ title: c.title, length: c.content.length })));

  // 第二阶段：对每个块调用AI拆分
  const allNotes: AtomicNote[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    logger.info(`正在处理第 ${i + 1}/${chunks.length} 块: ${chunk.title}`);

    try {
      const result = await plugin.aiService.splitIntoAtomicNotes({
        content: chunk.content,
        filename: chunk.title || `${filename}_部分${i + 1}`,
        customPrompt
      });

      // 给文件名添加前缀，避免不同块的重名
      const prefixedNotes = result.map(note => ({
        ...note,
        filename: `${chunk.title}_${note.filename}`,
        chunkIndex: i,
        chunkTitle: chunk.title
      }));

      allNotes.push(...prefixedNotes);
    } catch (err: any) {
      logger.error(`处理块 "${chunk.title}" 失败:`, err);
      // 继续处理其他块，不中断整个流程
      allNotes.push({
        filename: `${chunk.title}_处理失败`,
        content: chunk.content,
        knowledgePoint: `处理失败: ${err.message}`
      });
    }
  }

  return { notes: allNotes, chunks };
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
  const [customPrompt, setCustomPrompt] = React.useState<string>('');
  const [deleteOriginal, setDeleteOriginal] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [createdFiles, setCreatedFiles] = React.useState<string[]>([]);
  const [chunks, setChunks] = React.useState<ContentChunk[]>([]);

  // 初始化提示词
  React.useEffect(() => {
    const initialPrompt = plugin.settings.atomicSplitPrompt || DEFAULT_ATOMIC_SPLIT_PROMPT;
    setCustomPrompt(initialPrompt);
  }, [plugin.settings.atomicSplitPrompt]);

  // 判断是否可以拆分
  const contentLength = content.trim().length;
  const canSplit = contentLength >= (plugin.settings.minNoteLength || 100);
  const shouldSuggest = contentLength >= 1000;

  // 获取长度提示
  const getLengthHint = () => {
    if (contentLength < 100) {
      return { text: "笔记太短，无需拆分", color: "fo-text-[--text-muted]" };
    } else if (contentLength >= 1000) {
      return { text: "💡 建议拆分（内容较长）", color: "fo-text-yellow-600" };
    } else {
      return { text: "可选拆分", color: "fo-text-[--text-muted]" };
    }
  };

  const lengthHint = getLengthHint();

  // ============ 核心逻辑函数 ============

  // 1. 点击拆分按钮
  const handleSplitClick = async () => {
    setSplitState('analyzing');
    setError(null);
    setChunks([]);

    try {
      const prompt = customPrompt.trim() || DEFAULT_ATOMIC_SPLIT_PROMPT;

      logger.info("开始分析笔记拆分...");

      // 使用两阶段处理逻辑
      const { notes, chunks: contentChunks } = await splitLargeNote(
        content,
        file.basename,
        plugin,
        prompt
      );

      logger.info("拆分分析结果:", notes);
      logger.info("内容分块:", contentChunks);

      // 判断是否需要拆分
      if (!notes || notes.length === 0) {
        setError('AI 分析失败，未返回结果');
        setSplitState('idle');
        return;
      }

      if (notes.length === 1) {
        // 检查内容是否相同
        const isSameContent = notes[0].content.trim() === content.trim();
        if (isSameContent) {
          setError('AI 认为当前笔记无需拆分（已经是单一知识点）');
          setSplitState('idle');
          return;
        }
      }

      setSplitResult(notes);
      setChunks(contentChunks);
      setSplitState('preview');
    } catch (err: any) {
      logger.error("拆分分析失败:", err);
      setError(`拆分分析失败：${err.message || '未知错误'}`);
      setSplitState('idle');
    }
  };

  // 2. 重新分析（修改提示词后）
  const handleReanalyze = async () => {
    if (!customPrompt.trim()) {
      new Notice("请输入提示词");
      return;
    }
    await handleSplitClick();
  };

  // 3. 确认拆分
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
      // 创建子文件夹
      const splitFolderName = `${file.basename}_拆分`;
      const splitFolderPath = file.parent ? `${file.parent.path}/${splitFolderName}` : splitFolderName;

      logger.info("创建拆分文件夹:", splitFolderPath);

      try {
        await plugin.ensureFolderExists(splitFolderPath);
      } catch (err: any) {
        throw new Error(`创建拆分文件夹失败：${err.message}`);
      }

      // 创建拆分后的笔记
      for (const note of splitResult) {
        if (!note.filename || !note.content) {
          logger.warn("笔记数据不完整，跳过:", note);
          skipped.push(note.filename || '(无标题)');
          continue;
        }

        // 清理文件名（移除非法字符）
        const sanitizedFilename = note.filename.replace(/[\\/:*?"<>|]/g, '_');
        const newPath = `${splitFolderPath}/${sanitizedFilename}.md`;

        logger.info("创建笔记:", newPath);

        // 检查文件是否已存在
        const existingFile = plugin.app.vault.getAbstractFileByPath(newPath);
        if (existingFile) {
          logger.warn(`文件已存在，添加后缀: ${newPath}`);
          // 添加时间戳后缀
          const timestamp = Date.now();
          const newPathWithSuffix = `${splitFolderPath}/${sanitizedFilename}_${timestamp}.md`;
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
        const firstPath = `${splitFolderPath}/${created[0]}.md`;
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

  // 4. 取消拆分
  const handleCancel = () => {
    setSplitState('idle');
    setError(null);
  };

  // 5. 完成后重置
  const handleReset = () => {
    setSplitState('idle');
    setSplitResult([]);
    setError(null);
    setCreatedFiles([]);
  };

  // ============ 渲染函数 ============

  // 如果不能拆分，不显示组件
  if (!canSplit) {
    return null;
  }

  return (
    <div className="split-note-section">
      {splitState === 'idle' && (
        <IdleState
          contentLength={contentLength}
          lengthHint={lengthHint}
          onSplitClick={handleSplitClick}
          error={error}
        />
      )}

      {splitState === 'analyzing' && (
        <AnalyzingState />
      )}

      {splitState === 'preview' && (
        <PreviewState
          splitResult={splitResult}
          chunks={chunks}
          customPrompt={customPrompt}
          deleteOriginal={deleteOriginal}
          onPromptChange={setCustomPrompt}
          onDeleteOriginalChange={setDeleteOriginal}
          onReanalyze={handleReanalyze}
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
          splitFolderPath={file.parent ? `${file.parent.path}/${file.basename}_拆分` : `${file.basename}_拆分`}
          onReset={handleReset}
        />
      )}
    </div>
  );
};

// ============ 子组件 ============

// Idle 状态
const IdleState: React.FC<{
  contentLength: number;
  lengthHint: { text: string; color: string };
  onSplitClick: () => void;
  error: string | null;
}> = ({ contentLength, lengthHint, onSplitClick, error }) => (
  <div className="step-detail fo-p-4 fo-bg-[--background-secondary] fo-rounded-lg fo-mb-4">
    <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
      📄 笔记拆分
    </h3>

    <div className="fo-mb-3 fo-space-y-2">
      <div className="fo-flex fo-items-center fo-gap-3">
        <span className="fo-text-sm fo-text-[--text-muted]">当前长度：</span>
        <span className="fo-font-medium fo-text-[--text-normal]">{contentLength} 字符</span>
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

// Analyzing 状态
const AnalyzingState: React.FC = () => (
  <div className="step-detail fo-p-4 fo-bg-[--background-secondary] fo-rounded-lg fo-mb-4">
    <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
      📄 笔记拆分
    </h3>
    <div className="fo-flex fo-items-center fo-gap-3 fo-text-[--text-muted]">
      <span className="fo-animate-spin">⏳</span>
      <span>AI 分析中，请稍候...</span>
    </div>
  </div>
);

// Preview 状态
const PreviewState: React.FC<{
  splitResult: AtomicNote[];
  chunks: ContentChunk[];
  customPrompt: string;
  deleteOriginal: boolean;
  onPromptChange: (value: string) => void;
  onDeleteOriginalChange: (value: boolean) => void;
  onReanalyze: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  error: string | null;
}> = ({
  splitResult,
  chunks,
  customPrompt,
  deleteOriginal,
  onPromptChange,
  onDeleteOriginalChange,
  onReanalyze,
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
          ℹ️ 笔记较长，已按标题分为 <strong>{chunks.length}</strong> 个块进行处理：
          <ul className="fo-mt-2 fo-pl-4 fo-space-y-1">
            {chunks.map((chunk, idx) => (
              <li key={idx} className="fo-text-xs">
                • {chunk.title} ({Math.round(chunk.content.length / 1000)}k字符)
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
              知识点：{note.knowledgePoint}
            </div>
          )}
          <div className="fo-text-sm fo-text-[--text-muted] fo-ml-6">
            约 {note.content.length} 字符
          </div>
        </div>
      ))}
    </div>

    {/* 自定义提示词 */}
    <div className="fo-mb-3">
      <div className="fo-text-sm fo-text-[--text-muted] fo-mb-2">
        拆分提示词（可选）
      </div>
      <textarea
        value={customPrompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="输入自定义拆分提示词..."
        className="fo-w-full fo-p-2 fo-text-sm fo-bg-[--background-primary] fo-border fo-border-[--background-modifier-border] fo-rounded fo-resize-y"
        rows={4}
        style={{ width: '100%', maxWidth: 'none', display: 'block', boxSizing: 'border-box', minWidth: 0 }}
      />
      <button
        onClick={onReanalyze}
        className="fo-mt-2 fo-px-3 fo-py-1 fo-text-sm fo-bg-[--background-modifier-border] fo-text-[--text-normal] fo-rounded"
      >
        🔄 使用提示词重新分析
      </button>
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
        存放位置：{splitFolderPath}
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
