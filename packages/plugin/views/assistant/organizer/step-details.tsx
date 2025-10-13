import * as React from "react";

// ============ 通用步骤详情组件 ============
interface StepDetailProps {
  stepNumber: number;
  stepName: string;
  icon: string;
  result: any;
  onApply: () => void;
  onRetry: (params?: any) => void;
}

// 步骤1: 文件重命名详情
export const RenameStepDetail: React.FC<StepDetailProps> = ({
  stepNumber,
  stepName,
  icon,
  result,
  onApply,
  onRetry
}) => {
  const data = result?.data;

  if (data?.noChange) {
    return (
      <div className="step-detail p-4 bg-[--background-secondary] rounded-lg">
        <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
          {icon} 步骤{stepNumber}: {stepName}
        </h3>
        <div className="fo-mb-3 fo-text-sm fo-text-[--text-muted]">
          ℹ️ 文件名已合适，无需重命名
        </div>
        <div className="fo-flex fo-gap-2">
          <button
            onClick={onApply}
            className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium"
          >
            ✓ 继续
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="step-detail p-4 bg-[--background-secondary] rounded-lg">
      <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
        {icon} 步骤{stepNumber}: {stepName}
      </h3>

      <div className="fo-mb-3 fo-text-sm">
        <div className="fo-text-green-600">状态: ✅ 重命名建议已生成</div>
      </div>

      <div className="fo-mb-3 fo-space-y-2">
        <div className="fo-flex fo-items-center fo-gap-2">
          <span className="fo-text-[--text-muted]">原名称:</span>
          <span className="fo-font-medium">{data?.oldName}</span>
        </div>
        <div className="fo-flex fo-items-center fo-gap-2">
          <span className="fo-text-[--text-muted]">建议名称:</span>
          <span className="fo-font-medium fo-text-[--interactive-accent]">{data?.newName}</span>
        </div>
      </div>

      {data?.suggestions && data.suggestions.length > 1 && (
        <details className="fo-mb-3">
          <summary className="fo-text-xs fo-text-[--text-muted] fo-cursor-pointer">
            查看更多建议 ({data.suggestions.length})
          </summary>
          <div className="fo-mt-2 fo-space-y-1 fo-pl-4">
            {data.suggestions.slice(1).map((s: any, idx: number) => (
              <div key={idx} className="fo-text-sm fo-text-[--text-muted]">
                • {s.title}
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="fo-flex fo-gap-2">
        <button
          onClick={onApply}
          className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium"
        >
          ✓ 应用并继续
        </button>
        <button
          onClick={() => onRetry()}
          className="fo-px-4 fo-py-2 fo-bg-[--background-modifier-border] fo-text-[--text-normal] fo-rounded"
        >
          🔄 重新生成
        </button>
      </div>
    </div>
  );
};

// 步骤2: 格式优化详情
export const FormatStepDetail: React.FC<StepDetailProps> = ({
  stepNumber,
  stepName,
  icon,
  result,
  onApply,
  onRetry
}) => {
  const data = result?.data;
  const [showPreview, setShowPreview] = React.useState(false);
  const [customPrompt, setCustomPrompt] = React.useState('');

  if (data?.noChange) {
    return (
      <div className="step-detail p-4 bg-[--background-secondary] rounded-lg">
        <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
          {icon} 步骤{stepNumber}: {stepName}
        </h3>
        <div className="fo-mb-3 fo-text-sm fo-text-[--text-muted]">
          ℹ️ 内容格式已合适，无需优化
        </div>
        <div className="fo-flex fo-gap-2">
          <button
            onClick={onApply}
            className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium"
          >
            ✓ 继续
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="step-detail p-4 bg-[--background-secondary] rounded-lg">
      <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
        {icon} 步骤{stepNumber}: {stepName}
      </h3>

      <div className="fo-mb-3 fo-text-sm">
        <div className="fo-text-green-600">状态: ✅ 格式优化完成</div>
      </div>

      <div className="fo-mb-3 fo-space-y-2">
        <div className="fo-text-sm fo-text-[--text-muted]">
          📊 变更概览:
        </div>
        <div className="fo-pl-4 fo-space-y-1 fo-text-sm">
          <div>• 内容长度: {data?.oldLength} → {data?.newLength} 字符
            {data?.diff > 0 && <span className="fo-text-green-600"> (+{data.diff})</span>}
            {data?.diff < 0 && <span className="fo-text-red-600"> ({data.diff})</span>}
          </div>
        </div>
      </div>

      <div className="fo-mb-3">
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="fo-text-sm fo-text-[--interactive-accent] hover:fo-underline"
        >
          {showPreview ? '隐藏预览 ▲' : '查看预览 ▼'}
        </button>
        {showPreview && (
          <div className="fo-mt-2 fo-p-3 fo-bg-[--background-primary] fo-rounded fo-text-xs fo-max-h-60 fo-overflow-y-auto fo-whitespace-pre-wrap">
            {data?.fullContent || data?.preview || '无预览'}
          </div>
        )}
      </div>

      <details className="fo-mb-3">
        <summary className="fo-text-xs fo-text-[--text-muted] fo-cursor-pointer">
          自定义提示词重试
        </summary>
        <div className="fo-mt-2">
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="输入自定义格式化提示词..."
            className="fo-w-full fo-p-2 fo-text-sm fo-bg-[--background-primary] fo-border fo-border-[--background-modifier-border] fo-rounded"
            rows={3}
          />
        </div>
      </details>

      <div className="fo-flex fo-gap-2">
        <button
          onClick={onApply}
          className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium"
        >
          ✓ 应用并继续
        </button>
        <button
          onClick={() => onRetry(customPrompt ? { prompt: customPrompt } : undefined)}
          className="fo-px-4 fo-py-2 fo-bg-[--background-modifier-border] fo-text-[--text-normal] fo-rounded"
        >
          🔄 重新优化
        </button>
      </div>
    </div>
  );
};

// 步骤3: 二级目录分类详情
export const Level2FolderStepDetail: React.FC<StepDetailProps> = ({
  stepNumber,
  stepName,
  icon,
  result,
  onApply,
  onRetry
}) => {
  const data = result?.data;

  if (data?.noChange) {
    return (
      <div className="step-detail p-4 bg-[--background-secondary] rounded-lg">
        <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
          {icon} 步骤{stepNumber}: {stepName}
        </h3>
        <div className="fo-mb-3 fo-text-sm fo-text-[--text-muted]">
          ℹ️ 无文件夹推荐
        </div>
        <div className="fo-flex fo-gap-2">
          <button
            onClick={onApply}
            className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium"
          >
            ✓ 继续
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="step-detail p-4 bg-[--background-secondary] rounded-lg">
      <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
        {icon} 步骤{stepNumber}: {stepName}
      </h3>

      <div className="fo-mb-3 fo-text-sm">
        <div className="fo-text-green-600">状态: ✅ 二级目录已选择</div>
      </div>

      <div className="fo-mb-3 fo-space-y-2">
        <div className="fo-flex fo-items-center fo-gap-2">
          <span className="fo-text-[--text-muted]">选择目录:</span>
          <span className="fo-font-medium fo-text-[--interactive-accent]">{data?.level2Folder}</span>
        </div>
      </div>

      {data?.suggestions && data.suggestions.length > 1 && (
        <details className="fo-mb-3">
          <summary className="fo-text-xs fo-text-[--text-muted] fo-cursor-pointer">
            查看其他建议 ({data.suggestions.length})
          </summary>
          <div className="fo-mt-2 fo-space-y-1 fo-pl-4">
            {data.suggestions.map((s: any, idx: number) => (
              <div key={idx} className="fo-text-sm fo-text-[--text-muted]">
                • {s.folder} {s.score && `(${Math.round(s.score * 100)}%)`}
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="fo-flex fo-gap-2">
        <button
          onClick={onApply}
          className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium"
        >
          ✓ 应用并继续
        </button>
        <button
          onClick={() => onRetry()}
          className="fo-px-4 fo-py-2 fo-bg-[--background-modifier-border] fo-text-[--text-normal] fo-rounded"
        >
          🔄 重新分类
        </button>
      </div>
    </div>
  );
};

// 步骤4: 三级目录分类详情
export const Level3FolderStepDetail: React.FC<StepDetailProps> = ({
  stepNumber,
  stepName,
  icon,
  result,
  onApply,
  onRetry
}) => {
  const data = result?.data;

  if (data?.noChange) {
    return (
      <div className="step-detail p-4 bg-[--background-secondary] rounded-lg">
        <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
          {icon} 步骤{stepNumber}: {stepName}
        </h3>
        <div className="fo-mb-3 fo-text-sm fo-text-[--text-muted]">
          ℹ️ 步骤3未选择二级目录，跳过三级分类
        </div>
        <div className="fo-flex fo-gap-2">
          <button
            onClick={onApply}
            className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium"
          >
            ✓ 继续
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="step-detail p-4 bg-[--background-secondary] rounded-lg">
      <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
        {icon} 步骤{stepNumber}: {stepName}
      </h3>

      <div className="fo-mb-3 fo-text-sm">
        <div className="fo-text-green-600">状态: ✅ 文件已移动到最终目录</div>
      </div>

      <div className="fo-mb-3 fo-space-y-2">
        <div className="fo-flex fo-items-center fo-gap-2">
          <span className="fo-text-[--text-muted]">最终目录:</span>
          <span className="fo-font-medium fo-text-[--interactive-accent]">{data?.finalFolder}</span>
        </div>
      </div>

      {data?.level3Candidates && data.level3Candidates.length > 0 && (
        <details className="fo-mb-3">
          <summary className="fo-text-xs fo-text-[--text-muted] fo-cursor-pointer">
            查看候选目录 ({data.level3Candidates.length})
          </summary>
          <div className="fo-mt-2 fo-space-y-1 fo-pl-4 fo-max-h-32 fo-overflow-y-auto">
            {data.level3Candidates.map((folder: string, idx: number) => (
              <div key={idx} className="fo-text-sm fo-text-[--text-muted]">
                • {folder}
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="fo-flex fo-gap-2">
        <button
          onClick={onApply}
          className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium"
        >
          ✓ 应用并继续
        </button>
        <button
          onClick={() => onRetry()}
          className="fo-px-4 fo-py-2 fo-bg-[--background-modifier-border] fo-text-[--text-normal] fo-rounded"
        >
          🔄 重新分类
        </button>
      </div>
    </div>
  );
};

// 步骤5: 元数据生成详情
export const MetadataStepDetail: React.FC<StepDetailProps> = ({
  stepNumber,
  stepName,
  icon,
  result,
  onApply,
  onRetry
}) => {
  const data = result?.data;
  const [showYaml, setShowYaml] = React.useState(false);

  return (
    <div className="step-detail p-4 bg-[--background-secondary] rounded-lg">
      <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
        {icon} 步骤{stepNumber}: {stepName}
      </h3>

      <div className="fo-mb-3 fo-text-sm">
        <div className="fo-text-green-600">状态: ✅ 元数据已生成并写入</div>
      </div>

      <div className="fo-mb-3 fo-space-y-2">
        <div className="fo-text-sm fo-text-[--text-muted]">
          📊 元数据信息:
        </div>
        <div className="fo-pl-4 fo-space-y-1 fo-text-sm">
          <div>• 分类: {data?.cate || '未设置'}</div>
          <div>• 子分类: {data?.subcate || '未设置'}</div>
          {data?.metadata?.title && <div>• 标题: {data.metadata.title}</div>}
          {data?.metadata?.tags && data.metadata.tags.length > 0 && (
            <div>• 标签: {data.metadata.tags.join(', ')}</div>
          )}
        </div>
      </div>

      <div className="fo-mb-3">
        <button
          onClick={() => setShowYaml(!showYaml)}
          className="fo-text-sm fo-text-[--interactive-accent] hover:fo-underline"
        >
          {showYaml ? '隐藏YAML ▲' : '查看完整YAML ▼'}
        </button>
        {showYaml && (
          <div className="fo-mt-2 fo-p-3 fo-bg-[--background-primary] fo-rounded fo-text-xs fo-max-h-60 fo-overflow-y-auto fo-font-mono">
            <pre>{data?.yamlPreview || '无预览'}</pre>
          </div>
        )}
      </div>

      <div className="fo-flex fo-gap-2">
        <button
          onClick={onApply}
          className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium"
        >
          ✓ 应用并继续
        </button>
        <button
          onClick={() => onRetry()}
          className="fo-px-4 fo-py-2 fo-bg-[--background-modifier-border] fo-text-[--text-normal] fo-rounded"
        >
          🔄 重新生成
        </button>
      </div>
    </div>
  );
};

// 步骤6: Roadmap关联详情
export const RoadmapStepDetail: React.FC<StepDetailProps> = ({
  stepNumber,
  stepName,
  icon,
  result,
  onApply,
  onRetry
}) => {
  const data = result?.data;

  if (data?.disabled) {
    return (
      <div className="step-detail p-4 bg-[--background-secondary] rounded-lg">
        <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
          {icon} 步骤{stepNumber}: {stepName}
        </h3>
        <div className="fo-mb-3 fo-text-sm fo-text-[--text-muted]">
          ℹ️ Roadmap关联功能未启用
        </div>
        <div className="fo-flex fo-gap-2">
          <button
            onClick={onApply}
            className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium"
          >
            ✓ 完成
          </button>
        </div>
      </div>
    );
  }

  if (data?.noCategory) {
    return (
      <div className="step-detail p-4 bg-[--background-secondary] rounded-lg">
        <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
          {icon} 步骤{stepNumber}: {stepName}
        </h3>
        <div className="fo-mb-3 fo-text-sm fo-text-[--text-muted]">
          ℹ️ 无法确定领域分类，未关联Roadmap
        </div>
        <div className="fo-flex fo-gap-2">
          <button
            onClick={onApply}
            className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium"
          >
            ✓ 完成
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="step-detail p-4 bg-[--background-secondary] rounded-lg">
      <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
        {icon} 步骤{stepNumber}: {stepName}
      </h3>

      <div className="fo-mb-3 fo-text-sm">
        <div className="fo-text-green-600">状态: ✅ 已关联到Roadmap</div>
      </div>

      <div className="fo-mb-3 fo-space-y-2">
        <div className="fo-flex fo-items-center fo-gap-2">
          <span className="fo-text-[--text-muted]">Roadmap路径:</span>
          <span className="fo-font-medium fo-text-xs">{data?.roadmapPath}</span>
        </div>
        <div className="fo-flex fo-items-center fo-gap-2">
          <span className="fo-text-[--text-muted]">关联笔记:</span>
          <span className="fo-font-medium">[[{data?.linkedNote}]]</span>
        </div>
      </div>

      <div className="fo-flex fo-gap-2">
        <button
          onClick={onApply}
          className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium"
        >
          ✓ 完成流程
        </button>
        <button
          onClick={() => onRetry()}
          className="fo-px-4 fo-py-2 fo-bg-[--background-modifier-border] fo-text-[--text-normal] fo-rounded"
        >
          🔄 重新关联
        </button>
      </div>
    </div>
  );
};
