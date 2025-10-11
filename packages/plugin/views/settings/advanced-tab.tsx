import React, { useState } from "react";
import FileOrganizer from "../../index";
import { logger } from "../../services/logger";

interface AdvancedTabProps {
  plugin: FileOrganizer;
}

export const AdvancedTab: React.FC<AdvancedTabProps> = ({ plugin }) => {
  const [enableSelfHosting, setEnableSelfHosting] = useState(
    plugin.settings.enableSelfHosting
  );
  const [selfHostingURL, setSelfHostingURL] = useState(
    plugin.settings.selfHostingURL
  );
  const [useLogs, setUseLogs] = useState(plugin.settings.useLogs);
  const [debugMode, setDebugMode] = useState(plugin.settings.debugMode);
  const [showLogs, setShowLogs] = useState(false);
  const [contentCutoffChars, setContentCutoffChars] = useState(
    plugin.settings.contentCutoffChars
  );
  const [maxFormattingTokens, setMaxFormattingTokens] = useState(
    plugin.settings.maxFormattingTokens
  );
  const [isManualRefresh, setIsManualRefresh] = useState(
    plugin.settings.isManualRefresh
  );

  // 知识管理相关状态
  const [enableKnowledgeManagement, setEnableKnowledgeManagement] = useState(
    plugin.settings.enableKnowledgeManagement
  );
  const [enableAtomicSplit, setEnableAtomicSplit] = useState(
    plugin.settings.enableAtomicSplit
  );
  const [maxNoteLength, setMaxNoteLength] = useState(
    plugin.settings.maxNoteLength
  );
  const [minNoteLength, setMinNoteLength] = useState(
    plugin.settings.minNoteLength
  );
  const [splitStrategy, setSplitStrategy] = useState(
    plugin.settings.splitStrategy
  );
  const [atomicSplitPrompt, setAtomicSplitPrompt] = useState(
    plugin.settings.atomicSplitPrompt
  );

  const handleToggleChange = async (value: boolean) => {
    setEnableSelfHosting(value);
    plugin.settings.enableSelfHosting = value;
    await plugin.saveSettings();
  };

  const handleURLChange = async (value: string) => {
    setSelfHostingURL(value);
    plugin.settings.selfHostingURL = value;
    await plugin.saveSettings();
  };

  return (
    <div className="p-4 space-y-4">
      <ToggleSetting
        name="Manual Refresh Mode"
        description="Only regenerate suggestions (tags, folders, titles) when manually refreshed. This can help reduce API calls and provide a more controlled experience."
        value={isManualRefresh}
        onChange={value => {
          setIsManualRefresh(value);
          plugin.settings.isManualRefresh = value;
          plugin.saveSettings();
        }}
      />

      <ToggleSetting
        name="Fo2k File Logs"
        description="Allows you to keep track of the changes made by file Organizer."
        value={useLogs}
        onChange={value => {
          setUseLogs(value);
          plugin.settings.useLogs = value;
          plugin.saveSettings();
        }}
      />

      <ToggleSetting
        name="Debug Mode"
        description="Enable detailed logging for troubleshooting. This may impact performance."
        value={debugMode}
        onChange={value => {
          setDebugMode(value);
          logger.configure(value);
          plugin.settings.debugMode = value;
          plugin.saveSettings();
        }}
      />

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Enable Self-Hosting</div>
          <div className="setting-item-description">
            Enable Self-Hosting to host the server on your own machine. Requires
            technical skills and an external OpenAI API Key + credits. Keep
            disabled for default version of the plugin.
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="checkbox"
            checked={enableSelfHosting}
            onChange={e => handleToggleChange(e.target.checked)}
          />
        </div>
      </div>

      {enableSelfHosting && (
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">Server URL</div>
          </div>
          <div className="setting-item-control">
            <input
              type="text"
              placeholder="Enter your Server URL"
              value={selfHostingURL}
              onChange={e => handleURLChange(e.target.value)}
            />
          </div>
        </div>
      )}

      {useLogs && (
        <div className="space-y-2">

          {showLogs && (
            <div className="max-h-96 overflow-y-auto border border-[--background-modifier-border] rounded p-2">
              {logger.getLogs().map((log, index) => (
                <div
                  key={index}
                  className={`py-1 ${
                    log.level === "error"
                      ? "text-[--text-error]"
                      : log.level === "warn"
                      ? "text-[--text-warning]"
                      : "text-[--text-normal]"
                  }`}
                >
                  <span className="text-[--text-muted] text-xs">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>{" "}
                  <span className="font-medium">
                    [{log.level.toUpperCase()}]
                  </span>{" "}
                  {log.message}
                  {log.details && (
                    <pre className="text-xs mt-1 text-[--text-muted]">
                      {log.details}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Content Analysis Cutoff</div>
          <div className="setting-item-description">
            Maximum number of characters to analyze for folder suggestions,
            tagging, and titles. Lower values improve performance and reduce API
            costs. Default: 1000
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="number"
            min="100"
            max="10000"
            value={contentCutoffChars}
            onChange={e => {
              const value = parseInt(e.target.value);
              setContentCutoffChars(value);
              plugin.settings.contentCutoffChars = value;
              plugin.saveSettings();
            }}
            className="w-24"
          />
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Max Formatting Tokens</div>
          <div className="setting-item-description">
            Maximum number of tokens allowed for document formatting in the
            inbox. Documents exceeding this limit will be skipped. Default:
            100,000
          </div>
        </div>
        <div className="setting-item-control">
          <input
            type="number"
            min="1000"
            max="500000"
            step="1000"
            value={maxFormattingTokens}
            onChange={e => {
              const value = parseInt(e.target.value);
              setMaxFormattingTokens(value);
              plugin.settings.maxFormattingTokens = value;
              plugin.saveSettings();
            }}
            className="w-24"
          />
        </div>
      </div>

      {/* 知识管理功能设置 */}
      <div className="mt-8 pt-6 border-t border-[--background-modifier-border]">
        <h3 className="text-lg font-semibold mb-4 text-[--text-normal]">📚 知识管理功能</h3>

        <ToggleSetting
          name="启用知识管理功能"
          description="启用后，处理流程将包含原子化拆分、智能分类等知识管理增强功能。这是使用 Wiki Tab 和相关功能的前提。"
          value={enableKnowledgeManagement}
          onChange={value => {
            setEnableKnowledgeManagement(value);
            plugin.settings.enableKnowledgeManagement = value;
            plugin.saveSettings();
          }}
        />

        {enableKnowledgeManagement && (
          <div className="ml-4 mt-4 space-y-4 p-4 bg-[--background-secondary] rounded-lg">
            <ToggleSetting
              name="启用原子化拆分"
              description="自动将包含多个知识点的笔记拆分为独立的原子化笔记。"
              value={enableAtomicSplit}
              onChange={value => {
                setEnableAtomicSplit(value);
                plugin.settings.enableAtomicSplit = value;
                plugin.saveSettings();
              }}
            />

            <div className="setting-item">
              <div className="setting-item-info">
                <div className="setting-item-name">最小笔记长度</div>
                <div className="setting-item-description">
                  低于此长度的笔记不会被拆分（字符数）。默认: 100
                </div>
              </div>
              <div className="setting-item-control">
                <input
                  type="number"
                  min="50"
                  max="1000"
                  value={minNoteLength}
                  onChange={e => {
                    const value = parseInt(e.target.value);
                    setMinNoteLength(value);
                    plugin.settings.minNoteLength = value;
                    plugin.saveSettings();
                  }}
                  className="w-24"
                />
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-item-info">
                <div className="setting-item-name">最大笔记长度</div>
                <div className="setting-item-description">
                  超过此长度的笔记建议拆分（字符数）。默认: 3000
                </div>
              </div>
              <div className="setting-item-control">
                <input
                  type="number"
                  min="1000"
                  max="10000"
                  step="100"
                  value={maxNoteLength}
                  onChange={e => {
                    const value = parseInt(e.target.value);
                    setMaxNoteLength(value);
                    plugin.settings.maxNoteLength = value;
                    plugin.saveSettings();
                  }}
                  className="w-24"
                />
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-item-info">
                <div className="setting-item-name">拆分策略</div>
                <div className="setting-item-description">
                  选择笔记拆分的策略：按知识点、按长度或两者结合
                </div>
              </div>
              <div className="setting-item-control">
                <select
                  value={splitStrategy}
                  onChange={e => {
                    const value = e.target.value as "atomic" | "length" | "both";
                    setSplitStrategy(value);
                    plugin.settings.splitStrategy = value;
                    plugin.saveSettings();
                  }}
                  className="dropdown"
                >
                  <option value="atomic">按知识点拆分</option>
                  <option value="length">按长度拆分</option>
                  <option value="both">组合拆分（推荐）</option>
                </select>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-item-info">
                <div className="setting-item-name">原子化拆分提示词</div>
                <div className="setting-item-description">
                  自定义 AI 拆分笔记时使用的提示词。可在 Knowledge Test Tab 中测试效果。
                </div>
              </div>
            </div>
            <div className="mt-2">
              <textarea
                value={atomicSplitPrompt}
                onChange={e => {
                  setAtomicSplitPrompt(e.target.value);
                  plugin.settings.atomicSplitPrompt = e.target.value;
                  plugin.saveSettings();
                }}
                className="w-full h-32 p-2 border border-[--background-modifier-border] rounded text-sm font-mono"
                placeholder="输入拆分提示词..."
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface ToggleSettingProps {
  name: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

const ToggleSetting: React.FC<ToggleSettingProps> = ({
  name,
  description,
  value,
  onChange,
}) => (
  <div className="flex items-center justify-between py-2">
    <div>
      <div className="font-medium text-[--text-normal]">{name}</div>
      <div className="text-sm text-[--text-muted]">{description}</div>
    </div>
    <div>
      <input
        type="checkbox"
        checked={value}
        onChange={e => onChange(e.target.checked)}
        className="form-checkbox text-[--interactive-accent]"
      />
    </div>
  </div>
);
