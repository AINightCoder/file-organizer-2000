import * as React from "react";

// ============ 通用步骤详情组件 ============
interface StepDetailProps {
  stepNumber: number;
  stepName: string;
  icon: string;
  result: any;
  plugin?: any;
  onApply: (userChoice?: any) => void;
  onRetry: (params?: any) => void;
}

// 步骤1: 文件重命名详情
export const RenameStepDetail: React.FC<StepDetailProps> = ({
  stepNumber,
  stepName,
  icon,
  result,
  plugin,
  onApply,
  onRetry
}) => {
  const data = result?.data;
  const [selectedName, setSelectedName] = React.useState<string>(data?.newName || '');
  const [customName, setCustomName] = React.useState<string>('');
  const [showCustomInput, setShowCustomInput] = React.useState(false);
  const [customPrompt, setCustomPrompt] = React.useState<string>('');
  React.useEffect(() => {
    const initial = (
      (result && (result as any).data && (result as any).data.promptUsed) ||
      (result && (result as any).data && (result as any).data.settingsPrompt) ||
  (plugin && (plugin.settings as any) && (plugin.settings as any).renameInstructions) ||
      (result && (result as any).data && (result as any).data.systemDefaultPrompt) ||
      ''
    ) as string;
    if (initial && initial !== customPrompt) {
      setCustomPrompt(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, plugin]);

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
            onClick={() => onApply()}
            className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium"
          >
            ✓ 继续
          </button>
        </div>
      </div>
    );
  }

  const suggestions = data?.suggestions || [];
  const oldName = data?.oldName || '';

  const handleApplyClick = () => {
    const finalName = showCustomInput && customName.trim()
      ? customName.trim()
      : selectedName;
    onApply({ selectedName: finalName });
  };

  return (
    <div className="step-detail p-4 bg-[--background-secondary] rounded-lg">
      <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
        {icon} 步骤{stepNumber}: {stepName}
      </h3>

      <div className="fo-mb-3 fo-text-sm">
        <div className="fo-text-green-600">状态: ✅ 重命名建议已生成</div>
      </div>

      <div className="fo-mb-3">
        <div className="fo-flex fo-items-center fo-gap-3 fo-mb-2">
          <span className="fo-text-sm fo-text-[--text-muted]">当前名称:</span>
          <span className="fo-font-medium fo-text-[--text-normal]">{oldName}</span>
        </div>
      </div>

      <div className="fo-mb-3">
        <div className="fo-text-sm fo-text-[--text-muted] fo-mb-2">
          📝 请选择新的文件名：
        </div>
        <div className="fo-space-y-3 fo-max-h-80 fo-overflow-y-auto">
          {suggestions.map((suggestion: any, idx: number) => {
            const isSelected = selectedName === suggestion.title && !showCustomInput;

            return (
              <div
                key={idx}
                onClick={() => {
                  setSelectedName(suggestion.title);
                  setShowCustomInput(false);
                }}
                className={`fo-p-3 fo-border fo-rounded fo-cursor-pointer fo-transition-colors ${
                  isSelected
                    ? 'fo-border-[--interactive-accent] fo-bg-[--interactive-accent]/10'
                    : 'fo-border-[--background-modifier-border] hover:fo-border-[--interactive-accent]/50 hover:fo-bg-[--background-modifier-hover]'
                }`}
              >
                <div className="fo-flex fo-items-center fo-gap-3">
                  <input
                    type="radio"
                    checked={isSelected}
                    onChange={() => {
                      setSelectedName(suggestion.title);
                      setShowCustomInput(false);
                    }}
                    className="fo-cursor-pointer"
                  />
                  <span className="fo-font-medium fo-text-[--text-normal] fo-flex-1">
                    {suggestion.title}
                  </span>
                  {idx === 0 && (
                    <span
                      className="fo-inline-flex fo-items-center fo-gap-1 fo-text-xs fo-font-semibold fo-rounded fo-px-2 fo-py-0.5"
                      style={{ fontSize: '0.68rem', color: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.12)', border: '1px solid rgba(37, 99, 235, 0.25)' }}
                    >
                      推荐
                    </span>
                  )}
                </div>
                {suggestion.reason && (
                  <div
                    className="fo-mt-2 fo-ml-6 fo-leading-snug fo-text-[--text-muted] fo-opacity-80"
                    style={{ fontSize: '0.72rem' }}
                  >
                    💡 {suggestion.reason}
                  </div>
                )}
              </div>
            );
          })}

          {/* 自定义选项 */}
          <div
            onClick={() => {
              setShowCustomInput(true);
              setCustomName(oldName);
            }}
            className={`fo-p-3 fo-border fo-rounded fo-cursor-pointer fo-transition-colors ${
              showCustomInput
                ? 'fo-border-[--interactive-accent] fo-bg-[--interactive-accent]/10'
                : 'fo-border-[--background-modifier-border] hover:fo-border-[--interactive-accent]/50 hover:fo-bg-[--background-modifier-hover]'
            }`}
          >
            <div className="fo-flex fo-items-center fo-gap-3">
              <input
                type="radio"
                checked={showCustomInput}
                onChange={() => {
                  setShowCustomInput(true);
                  setCustomName(oldName);
                }}
                className="fo-cursor-pointer"
              />
              <span className="fo-font-medium fo-text-[--text-normal]">
                自定义文件名
              </span>
            </div>
            {showCustomInput && (
              <div className="fo-mt-2 fo-ml-6">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="输入自定义文件名..."
                  className="fo-w-full fo-px-3 fo-py-2 fo-text-sm fo-bg-[--background-primary] fo-border fo-border-[--background-modifier-border] fo-rounded focus:fo-border-[--interactive-accent] focus:fo-outline-none"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="fo-mb-3">
        <div className="fo-text-sm fo-text-[--text-muted] fo-mb-2">重命名 Prompt（可选）</div>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="为重命名提供提示词，影响AI生成建议..."
          className="fo-w-full fo-p-2 fo-text-sm fo-bg-[--background-primary] fo-border fo-border-[--background-modifier-border] fo-rounded fo-resize-y"
          rows={3}
          style={{ width: '100%', maxWidth: 'none', display: 'block', boxSizing: 'border-box', minWidth: 0 }}
        />
      </div>

      <div className="fo-flex fo-gap-2">
        <button
          onClick={handleApplyClick}
          disabled={!selectedName && (!showCustomInput || !customName.trim())}
          className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium disabled:fo-opacity-50 disabled:fo-cursor-not-allowed"
        >
          ✓ 应用并继续
        </button>
        <button
          onClick={() => onRetry(customPrompt && customPrompt.trim().length > 0 ? { prompt: customPrompt.trim() } : undefined)}
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
  const [customPrompt, setCustomPrompt] = React.useState('');
  React.useEffect(() => {
    const initial = (
      (result && (result as any).data && (result as any).data.promptUsed) ||
      (result && (result as any).data && (result as any).data.settingsPrompt) ||
      (result && (result as any).data && (result as any).data.systemDefaultPrompt) ||
      ''
    ) as string;
    if (initial && initial !== customPrompt) {
      setCustomPrompt(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

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

      {/* 预览功能已移除 */}

      <div className="fo-mb-3">
        <div className="fo-text-sm fo-text-[--text-muted] fo-mb-2">格式优化 Prompt（可选）</div>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="为格式优化提供提示词，影响AI优化方式..."
          className="fo-w-full fo-p-2 fo-text-sm fo-bg-[--background-primary] fo-border fo-border-[--background-modifier-border] fo-rounded fo-resize-y"
          rows={3}
          style={{ width: '100%', maxWidth: 'none', display: 'block', boxSizing: 'border-box', minWidth: 0 }}
        />
      </div>

      <div className="fo-flex fo-gap-2">
        <button
          onClick={onApply}
          className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium"
        >
          ✓ 应用并继续
        </button>
        <button
          onClick={() => onRetry({ prompt: customPrompt.trim() })}
          disabled={customPrompt.trim().length === 0}
          className="fo-px-4 fo-py-2 fo-bg-[--background-modifier-border] fo-text-[--text-normal] fo-rounded disabled:fo-opacity-50 disabled:fo-cursor-not-allowed"
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
  plugin,
  onApply,
  onRetry
}) => {
  const data = result?.data;
  const [selectedFolder, setSelectedFolder] = React.useState<string>(data?.level2Folder || '');
  const [customPrompt, setCustomPrompt] = React.useState<string>('');

  React.useEffect(() => {
    const initial = (
      (result && (result as any).data && (result as any).data.promptUsed) ||
      (plugin && (plugin.settings as any) && (plugin.settings as any).customFolderInstructions) ||
      ''
    ) as string;
    if (initial && initial !== customPrompt) setCustomPrompt(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, plugin]);

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

  const suggestions = data?.suggestions || [];
  const sortedSuggestions = [...suggestions].sort((a, b) => (b.score || 0) - (a.score || 0));

  return (
    <div className="step-detail p-4 bg-[--background-secondary] rounded-lg">
      <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
        {icon} 步骤{stepNumber}: {stepName}
      </h3>

      <div className="fo-mb-3 fo-text-sm">
        <div className="fo-text-green-600">状态: ✅ 文件夹建议已生成</div>
      </div>

      <div className="fo-mb-3">
        <div className="fo-text-sm fo-text-[--text-muted] fo-mb-2">
          📁 请选择目标二级目录：
        </div>
        <div className="fo-space-y-3 fo-max-h-96 fo-overflow-y-auto">
          {sortedSuggestions.map((suggestion: any, idx: number) => {
            const isSelected = selectedFolder === suggestion.folder;
            // scorePercent UI removed

            return (
              <div
                key={idx}
                onClick={() => setSelectedFolder(suggestion.folder)}
                className={`fo-p-3 fo-border fo-rounded fo-cursor-pointer fo-transition-colors ${
                  isSelected
                    ? 'fo-border-[--interactive-accent] fo-bg-[--interactive-accent]/10'
                    : 'fo-border-[--background-modifier-border] hover:fo-border-[--interactive-accent]/50 hover:fo-bg-[--background-modifier-hover]'
                }`}
              >
                <div className="fo-flex fo-items-start fo-justify-between fo-gap-3">
                  <div className="fo-flex-1">
                    <div className="fo-flex fo-items-center fo-gap-3 fo-flex-wrap">
                      <input
                        type="radio"
                        checked={isSelected}
                        onChange={() => setSelectedFolder(suggestion.folder)}
                        className="fo-cursor-pointer"
                      />
                      <span className="fo-font-medium fo-text-[--text-normal]">
                        {suggestion.folder}
                      </span>
                      {idx === 0 && (
                        <span
                          className="fo-inline-flex fo-items-center fo-gap-1 fo-text-xs fo-font-semibold fo-rounded fo-px-2 fo-py-0.5"
                          style={{ fontSize: '0.68rem', color: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.12)', border: '1px solid rgba(37, 99, 235, 0.25)' }}
                        >
                          推荐
                        </span>
                      )}
                      {suggestion.exists && (
                        <span
                          className="fo-inline-flex fo-items-center fo-gap-1 fo-text-xs fo-font-medium fo-rounded fo-px-2 fo-py-0.5"
                          style={{
                            fontSize: '0.68rem',
                            color: '#16a34a',
                            backgroundColor: 'rgba(22, 163, 74, 0.12)',
                            border: '1px solid rgba(22, 163, 74, 0.25)',
                          }}
                        >
                          已存在
                        </span>
                      )}

                    </div>
                    {suggestion.reason && (
                      <div
                        className="fo-mt-2 fo-ml-6 fo-leading-snug fo-text-[--text-muted] fo-opacity-80"
                        style={{ fontSize: '0.72rem' }}
                      >
                        💡 {suggestion.reason}
                      </div>
                    )}
                  </div>
                  {/* scorePercent display removed */}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="fo-mb-3">
        <div className="fo-text-sm fo-text-[--text-muted] fo-mb-2">二级目录分类 Prompt（可选）</div>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="为二级目录分类提供提示词，影响AI分类建议..."
          className="fo-w-full fo-p-2 fo-text-sm fo-bg-[--background-primary] fo-border fo-border-[--background-modifier-border] fo-rounded fo-resize-y"
          rows={3}
          style={{ width: '100%', maxWidth: 'none', display: 'block', boxSizing: 'border-box', minWidth: 0 }}
        />
      </div>

      <div className="fo-flex fo-gap-2">
        <button
          onClick={() => onApply({ selectedFolder })}
          disabled={!selectedFolder}
          className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium disabled:fo-opacity-50 disabled:fo-cursor-not-allowed"
        >
          ✓ 应用并继续
        </button>
        <button
          onClick={() => onRetry(customPrompt && customPrompt.trim().length > 0 ? { prompt: customPrompt.trim() } : undefined)}
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
  plugin,
  onApply,
  onRetry
}) => {
  const data = result?.data;
  const [selectedFolder, setSelectedFolder] = React.useState<string>(data?.finalFolder || '');
  const [customPrompt, setCustomPrompt] = React.useState<string>('');

  React.useEffect(() => {
    if (data?.finalFolder && data.finalFolder !== selectedFolder) {
      setSelectedFolder(data.finalFolder);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.finalFolder]);

  React.useEffect(() => {
    const initial = (
      (result && (result as any).data && (result as any).data.promptUsed) ||
      (result && (result as any).data && (result as any).data.settingsPrompt) ||
      ''
    ) as string;
    if (initial && initial !== customPrompt) {
      setCustomPrompt(initial);
    }
    // eslint-disable-next-line react-hooks-exhaustive-deps
  }, [result]);

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

  const suggestions = React.useMemo(() => {
    if (Array.isArray(data?.suggestions) && data.suggestions.length > 0) {
      return data.suggestions.map((suggestion: any) => ({
        folder: suggestion.folder,
        score: suggestion.score,
        exists: typeof suggestion.exists === 'boolean' ? suggestion.exists : undefined,
        reason: suggestion.reason,
        isNewFolder: suggestion.isNewFolder
      }));
    }

    if (Array.isArray(data?.level3Candidates) && data.level3Candidates.length > 0) {
      return data.level3Candidates.map((folder: string) => ({
        folder,
        score: data?.finalFolder === folder ? 1 : 0,
        exists: undefined,
        reason: undefined,
        isNewFolder: false
      }));
    }

    return [];
  }, [data]);

  const sortedSuggestions = React.useMemo(
    () => [...suggestions].sort((a, b) => ((b.score || 0) - (a.score || 0))),
    [suggestions]
  );

  const handleApplyClick = () => {
    if (!selectedFolder) return;
    const trimmed = customPrompt.trim();
    onApply({
      selectedFolder,
      prompt: trimmed.length > 0 ? trimmed : undefined
    });
  };

  const handleRetryClick = () => {
    const trimmed = customPrompt.trim();
    onRetry(trimmed.length > 0 ? { prompt: trimmed } : undefined);
  };

  return (
    <div className="step-detail p-4 bg-[--background-secondary] rounded-lg">
      <h3 className="fo-font-semibold fo-mb-3 fo-text-[--text-normal]">
        {icon} 步骤{stepNumber}: {stepName}
      </h3>

      <div className="fo-mb-3 fo-text-sm">
        <div className="fo-text-green-600">状态: ✅ AI 已提供第三级分类建议</div>
      </div>

      <div className="fo-mb-3 fo-space-y-2">
        <div className="fo-flex fo-items-center fo-gap-3">
          <span className="fo-text-[--text-muted]">最终目录:</span>
          <span className="fo-font-medium fo-text-[--interactive-accent]">
            {selectedFolder || data?.finalFolder || '暂未选择'}
          </span>
        </div>
      </div>

      <div className="fo-mb-3">
        <div className="fo-text-sm fo-text-[--text-muted] fo-mb-2">🗂️ 请选择目标目录:</div>
        {sortedSuggestions.length > 0 ? (
          <div className="fo-space-y-3 fo-max-h-96 fo-overflow-y-auto">
            {sortedSuggestions.map((suggestion: any, idx: number) => {
              const isSelected = selectedFolder === suggestion.folder;
              // scorePercent UI removed

              return (
                <div
                  key={`${suggestion.folder}-${idx}`}
                  onClick={() => setSelectedFolder(suggestion.folder)}
                  className={`fo-p-3 fo-border fo-rounded fo-cursor-pointer fo-transition-colors ${
                    isSelected
                      ? 'fo-border-[--interactive-accent] fo-bg-[--interactive-accent]/10'
                      : 'fo-border-[--background-modifier-border] hover:fo-border-[--interactive-accent]/50 hover:fo-bg-[--background-modifier-hover]'
                  }`}
                >
                  <div className="fo-flex fo-items-start fo-justify-between fo-gap-3">
                    <div className="fo-flex-1">
                      <div className="fo-flex fo-items-center fo-gap-3 fo-flex-wrap">
                        <input
                          type="radio"
                          checked={isSelected}
                          onChange={() => setSelectedFolder(suggestion.folder)}
                          className="fo-cursor-pointer"
                        />
                        <span className="fo-font-medium fo-text-[--text-normal]">
                          {suggestion.folder}
                        </span>
                        {idx === 0 && (
                          <span
                            className="fo-inline-flex fo-items-center fo-gap-1 fo-text-xs fo-font-semibold fo-rounded fo-px-2 fo-py-0.5"
                            style={{ fontSize: '0.68rem', color: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.12)', border: '1px solid rgba(37, 99, 235, 0.25)' }}
                          >
                            推荐
                          </span>
                        )}
                        {typeof suggestion.exists === 'boolean' && suggestion.exists && (
                          <span
                            className="fo-inline-flex fo-items-center fo-gap-1 fo-text-xs fo-font-medium fo-rounded fo-px-2 fo-py-0.5"
                            style={{
                              fontSize: '0.68rem',
                              color: '#16a34a',
                              backgroundColor: 'rgba(22, 163, 74, 0.12)',
                              border: '1px solid rgba(22, 163, 74, 0.25)',
                            }}
                          >
                            已存在
                          </span>
                        )}
                                              </div>
                      {suggestion.reason && (
                        <div
                          className="fo-mt-2 fo-ml-6 fo-leading-snug fo-text-[--text-muted] fo-opacity-80"
                          style={{ fontSize: '0.72rem' }}
                        >
                          理由: {suggestion.reason}
                        </div>
                      )}
                    </div>
                    {/* scorePercent display removed */}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="fo-text-sm fo-text-[--text-muted] fo-italic">
            暂无候选目录，请调整 Prompt 后重试。
          </div>
        )}
      </div>

      {Array.isArray(data?.level3Candidates) && data.level3Candidates.length > 0 && sortedSuggestions.length === 0 && (
        <details className="fo-mb-3">
          <summary className="fo-text-xs fo-text-[--text-muted] fo-cursor-pointer">
            查看候选目录 ({data.level3Candidates.length})
          </summary>
          <div className="fo-mt-2 fo-space-y-1 fo-pl-4 fo-max-h-32 fo-overflow-y-auto">
            {data.level3Candidates.map((folder: string, idx: number) => (
              <div key={idx} className="fo-text-sm fo-text-[--text-muted]">
                ▸ {folder}
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="fo-mb-3">
        <div className="fo-text-sm fo-text-[--text-muted] fo-mb-2">三级目录分类 Prompt（可选）</div>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="为三级目录分类提供提示词，影响AI分类建议..."
          className="fo-w-full fo-p-2 fo-text-sm fo-bg-[--background-primary] fo-border fo-border-[--background-modifier-border] fo-rounded fo-resize-y"
          rows={3}
          style={{ width: '100%', maxWidth: 'none', display: 'block', boxSizing: 'border-box', minWidth: 0 }}
        />
      </div>

      <div className="fo-flex fo-gap-2">
        <button
          onClick={handleApplyClick}
          disabled={!selectedFolder}
          className="fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium disabled:fo-opacity-50 disabled:fo-cursor-not-allowed"
        >
          ✓ 应用并继续
        </button>
        <button
          onClick={handleRetryClick}
          className="fo-px-4 fo-py-2 fo-bg-[--background-modifier-border] fo-text-[--text-normal] fo-rounded"
        >
          🔄 重新生成
        </button>
      </div>
    </div>
  );
};// 步骤5: 元数据生成详情
export const MetadataStepDetail: React.FC<StepDetailProps> = ({
  stepNumber,
  stepName,
  icon,
  result,
  onApply,
  onRetry
}) => {
  const data = result?.data;
  // YAML 预览功能已移除

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

      {/* YAML 预览功能已移除 */}

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
        <div className="fo-flex fo-items-center fo-gap-3">
          <span className="fo-text-[--text-muted]">Roadmap路径:</span>
          <span className="fo-font-medium fo-text-xs">{data?.roadmapPath}</span>
        </div>
        <div className="fo-flex fo-items-center fo-gap-3">
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
