import React, { useState, useEffect } from 'react';
import FileOrganizer from '../..';
import { TFile, Notice } from 'obsidian';
import { SectionHeader } from './section-header';

interface WikiManagerProps {
  plugin: FileOrganizer;
}

export const WikiManager: React.FC<WikiManagerProps> = ({ plugin }) => {
  const [activeFile, setActiveFile] = useState<TFile | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingLog, setProcessingLog] = useState<string[]>([]);

  useEffect(() => {
    // 监听活动文件变化
    const updateActiveFile = () => {
      const file = plugin.app.workspace.getActiveFile();
      setActiveFile(file);
      if (file) {
        plugin.app.vault.read(file).then(content => {
          setFileContent(content);
        });
      } else {
        setFileContent('');
      }
    };

    updateActiveFile();

    // 注册事件监听
    const fileOpenRef = plugin.app.workspace.on('file-open', updateActiveFile);
    const activeLeafRef = plugin.app.workspace.on('active-leaf-change', updateActiveFile);

    return () => {
      plugin.app.workspace.offref(fileOpenRef);
      plugin.app.workspace.offref(activeLeafRef);
    };
  }, [plugin]);

  const addLog = (message: string) => {
    setProcessingLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleProcessNote = async () => {
    if (!activeFile) {
      new Notice('请先打开一个笔记文件');
      return;
    }

    if (!plugin.settings.enableKnowledgeManagement) {
      new Notice('请先在设置中启用知识管理功能');
      return;
    }

    // 确认操作
    if (!confirm(`确认处理当前笔记？\n\n将按照知识管理流程进行拆分、分类等处理。\n原笔记将被删除，此操作不可撤销！`)) {
      return;
    }

    setIsProcessing(true);
    setProcessingLog([]);

    try {
      addLog('🚀 开始处理笔记...');
      addLog(`当前文件: ${activeFile.basename}`);
      addLog(`内容长度: ${fileContent.length} 字符`);

      // 检查是否需要拆分
      if (fileContent.length < plugin.settings.minNoteLength) {
        addLog(`⚠️ 内容太短（< ${plugin.settings.minNoteLength} 字符），不建议拆分`);
        new Notice('笔记内容太短，不建议拆分');
        return;
      }

      // 调用AI服务进行拆分
      if (!plugin.aiService) {
        addLog('❌ AI服务未初始化');
        new Notice('AI服务未初始化');
        return;
      }

      addLog('正在调用AI进行拆分分析...');

      const atomicNotes = await plugin.aiService.splitIntoAtomicNotes({
        content: fileContent,
        filename: activeFile.basename,
        customPrompt: plugin.settings.atomicSplitPrompt
      });

      addLog(`✅ 拆分分析完成，识别出 ${atomicNotes.length} 个知识点`);

      // 如果只有一个笔记且内容相同，说明无需拆分
      if (atomicNotes.length === 1 &&
          atomicNotes[0].content.trim() === fileContent.trim()) {
        addLog('ℹ️ 笔记已经是单一知识点，无需拆分');
        addLog('🔄 直接进行后续处理（分类、标签、重命名等）...');

        try {
          // 直接调用 Inbox 处理流程
          if (plugin.inbox && plugin.inbox.processInboxFile) {
            await plugin.inbox.processInboxFile(activeFile);
            addLog('✅ 处理完成');
            new Notice('笔记处理完成');
          } else {
            // 如果 Inbox 未初始化，移动到 Inbox 文件夹
            addLog('⚠️ Inbox 未初始化，移动到 Inbox 文件夹');
            const inboxPath = plugin.settings.pathToWatch;
            const newPath = `${inboxPath}/${activeFile.name}`;
            await plugin.app.fileManager.renameFile(activeFile, newPath);
            addLog('✅ 已移动到 Inbox，将自动处理');
            new Notice('已移动到 Inbox 进行处理');
          }
        } catch (error) {
          addLog(`❌ 处理失败: ${error.message}`);
          throw error;
        }
        return;
      }

      // 检查长度并可能进行二次拆分
      const finalNotes = [];
      for (const note of atomicNotes) {
        if (note.content.length > plugin.settings.maxNoteLength) {
          addLog(`⚠️ 笔记 "${note.filename}" 超长，进行长度拆分...`);

          const fragments = await plugin.aiService.splitByLength({
            content: note.content,
            maxLength: plugin.settings.maxNoteLength
          });

          fragments.forEach((fragment, index) => {
            finalNotes.push({
              filename: `${note.filename} ${index + 1}`,
              content: fragment,
              knowledgePoint: note.knowledgePoint,
              length: fragment.length
            });
          });
        } else {
          finalNotes.push({
            filename: note.filename,
            content: note.content,
            knowledgePoint: note.knowledgePoint,
            length: note.content.length
          });
        }
      }

      addLog(`✅ 最终将拆分为 ${finalNotes.length} 个笔记`);

      // 立即执行拆分
      addLog('📝 开始创建拆分笔记...');

      const targetFolder = activeFile.parent;
      const createdFiles: TFile[] = [];

      for (let i = 0; i < finalNotes.length; i++) {
        const note = finalNotes[i];
        addLog(`创建笔记 ${i + 1}/${finalNotes.length}: ${note.filename}`);

        try {
          const newFilePath = `${targetFolder.path}/${note.filename}.md`;
          const newFile = await plugin.app.vault.create(newFilePath, note.content);
          createdFiles.push(newFile);
          addLog(`✅ 已创建: ${newFile.basename}`);
        } catch (error) {
          addLog(`❌ 创建失败: ${note.filename} - ${error.message}`);
          throw error;
        }
      }

      // 删除原笔记
      addLog('🗑️ 删除原笔记...');
      await plugin.app.vault.delete(activeFile);
      addLog('✅ 原笔记已删除');

      // 直接处理每个拆分笔记，而不是移动到 Inbox
      addLog(`📋 开始处理 ${createdFiles.length} 个拆分笔记...`);

      for (let i = 0; i < createdFiles.length; i++) {
        const file = createdFiles[i];
        addLog(`\n--- 处理笔记 ${i + 1}/${createdFiles.length}: ${file.basename} ---`);

        try {
          // 调用 Inbox 的处理流程
          if (plugin.inbox && plugin.inbox.processInboxFile) {
            addLog(`  🔄 开始完整处理流程...`);
            await plugin.inbox.processInboxFile(file);
            addLog(`  ✅ 处理完成: ${file.basename}`);
          } else {
            addLog(`  ⚠️ Inbox 未初始化，移动到 Inbox 文件夹`);
            const inboxPath = plugin.settings.pathToWatch;
            const newPath = `${inboxPath}/${file.name}`;
            await plugin.app.fileManager.renameFile(file, newPath);
          }
        } catch (error) {
          addLog(`  ❌ 处理失败: ${file.basename} - ${error.message}`);
          console.error(`处理 ${file.basename} 失败:`, error);
        }
      }

      addLog('\n🎉 全部处理完成！');
      new Notice(`成功拆分并处理了 ${createdFiles.length} 个笔记`);

    } catch (error) {
      addLog(`❌ 处理失败: ${error.message}`);
      console.error('处理笔记失败:', error);
      new Notice('处理失败: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };


  const handleSendToInbox = async () => {
    if (!activeFile) {
      new Notice('请先打开一个笔记文件');
      return;
    }

    try {
      const inboxPath = plugin.settings.pathToWatch;
      const newPath = `${inboxPath}/${activeFile.name}`;

      addLog('移动到 Inbox...');
      await plugin.app.fileManager.renameFile(activeFile, newPath);

      addLog('✅ 已移动到 Inbox，将自动处理');
      new Notice('已移动到 Inbox，将自动处理');

    } catch (error) {
      addLog(`❌ 移动失败: ${error.message}`);
      new Notice('移动到 Inbox 失败: ' + error.message);
    }
  };

  const handleClearLog = () => {
    setProcessingLog([]);
  };

  return (
    <div className="flex flex-col h-full p-4 space-y-4 overflow-y-auto">
      <SectionHeader text="Wiki Manager" icon="📚 " />

      {/* 当前文件信息 */}
      <div className="p-4 bg-[--background-secondary] rounded-lg">
        <h3 className="fo-font-semibold fo-mb-2 fo-text-[--text-normal]">当前笔记</h3>
        {activeFile ? (
          <div className="fo-space-y-2 fo-text-sm">
            <div className="fo-flex fo-items-center fo-gap-2">
              <span className="fo-text-[--text-muted]">文件名:</span>
              <span className="fo-font-medium fo-text-[--text-normal]">{activeFile.basename}</span>
            </div>
            <div className="fo-flex fo-items-center fo-gap-2">
              <span className="fo-text-[--text-muted]">路径:</span>
              <span className="fo-text-[--text-muted] fo-text-xs">{activeFile.path}</span>
            </div>
            <div className="fo-flex fo-items-center fo-gap-2">
              <span className="fo-text-[--text-muted]">长度:</span>
              <span className="fo-text-[--text-normal]">{fileContent.length} 字符</span>
            </div>
            {/* 调试信息 */}
            <div className="fo-mt-2 fo-pt-2 fo-border-t fo-border-[--background-modifier-border] fo-text-xs">
              <div className="fo-text-[--text-muted]">
                调试信息: activeFile={activeFile ? '✓' : '✗'},
                isProcessing={isProcessing ? '✓' : '✗'},
                enableKM={plugin.settings.enableKnowledgeManagement ? '✓' : '✗'}
              </div>
            </div>
            {plugin.settings.enableKnowledgeManagement && (
              <div className="fo-mt-2 fo-pt-2 fo-border-t fo-border-[--background-modifier-border]">
                <div className="fo-flex fo-items-center fo-gap-2">
                  <span className={`fo-w-2 fo-h-2 fo-rounded-full ${
                    fileContent.length < plugin.settings.minNoteLength ? 'fo-bg-gray-400' :
                    fileContent.length > plugin.settings.maxNoteLength ? 'fo-bg-yellow-500' :
                    'fo-bg-green-500'
                  }`}></span>
                  <span className="fo-text-xs fo-text-[--text-muted]">
                    {fileContent.length < plugin.settings.minNoteLength ?
                      `太短，建议至少 ${plugin.settings.minNoteLength} 字符` :
                    fileContent.length > plugin.settings.maxNoteLength ?
                      `较长，建议拆分` :
                      '长度适中'}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="fo-text-sm fo-text-[--text-muted]">未打开任何笔记</p>
        )}
      </div>

      {/* 配置状态 */}
      {plugin.settings.enableKnowledgeManagement && (
        <div className="p-4 bg-[--background-secondary] rounded-lg">
          <h3 className="fo-font-semibold fo-mb-2 fo-text-[--text-normal]">知识管理配置</h3>
          <div className="fo-space-y-1 fo-text-sm">
            <div className="fo-flex fo-items-center fo-gap-2">
              <span className="fo-w-2 fo-h-2 fo-rounded-full fo-bg-green-500"></span>
              <span className="fo-text-[--text-muted]">知识管理: 已启用</span>
            </div>
            <div className="fo-flex fo-items-center fo-gap-2">
              <span className="fo-w-2 fo-h-2 fo-rounded-full fo-bg-green-500"></span>
              <span className="fo-text-[--text-muted]">原子化拆分: {plugin.settings.enableAtomicSplit ? '已启用' : '未启用'}</span>
            </div>
            <div className="fo-text-xs fo-text-[--text-muted] fo-mt-2">
              长度限制: {plugin.settings.minNoteLength} - {plugin.settings.maxNoteLength} 字符
            </div>
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="fo-space-y-2">
        <button
          onClick={handleProcessNote}
          disabled={!activeFile || isProcessing || !plugin.settings.enableKnowledgeManagement}
          className="fo-w-full fo-px-4 fo-py-2 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded fo-font-medium hover:fo-bg-[--interactive-accent-hover] disabled:fo-opacity-50 disabled:fo-cursor-not-allowed"
        >
          {isProcessing ? '处理中...' : '🚀 立即处理'}
        </button>

        <button
          onClick={handleSendToInbox}
          disabled={!activeFile || isProcessing}
          className="fo-w-full fo-px-4 fo-py-2 fo-bg-[--background-modifier-border] fo-text-[--text-normal] fo-rounded fo-font-medium hover:fo-bg-[--background-modifier-hover] disabled:fo-opacity-50"
        >
          📥 仅移动到 Inbox
        </button>
      </div>

      {/* 处理日志 */}
      {processingLog.length > 0 && (
        <div>
          <div className="fo-flex fo-justify-between fo-items-center fo-mb-2">
            <h3 className="fo-font-semibold fo-text-[--text-normal]">处理日志</h3>
            <button
              onClick={handleClearLog}
              className="fo-text-xs fo-text-[--text-muted] hover:fo-text-[--text-normal]"
            >
              清空
            </button>
          </div>
          <div className="fo-p-3 fo-bg-black fo-text-green-400 fo-rounded fo-font-mono fo-text-xs fo-h-64 fo-overflow-y-auto">
            {processingLog.map((log, index) => (
              <div key={index}>{log}</div>
            ))}
          </div>
        </div>
      )}

      {/* 使用说明 */}
      <div className="fo-p-4 fo-bg-blue-50 dark:fo-bg-blue-950 fo-rounded-lg fo-border fo-border-blue-200 dark:fo-border-blue-800">
        <h3 className="fo-font-semibold fo-mb-2 fo-text-blue-800 dark:fo-text-blue-200">📖 使用说明</h3>
        <ul className="fo-text-sm fo-text-blue-900 dark:fo-text-blue-300 fo-space-y-1 fo-list-disc fo-list-inside">
          <li><strong>立即处理</strong>: 自动分析并拆分当前笔记，所有拆分笔记将移动到 Inbox 进行完整处理流程（分类、标签、重命名等）</li>
          <li><strong>仅移动到 Inbox</strong>: 直接将当前笔记移动到 Inbox，不进行拆分</li>
          <li>处理前会自动检查内容长度和知识点数量</li>
          <li>原笔记将被删除，操作不可撤销</li>
          <li>所有笔记最终都会进入 Inbox 完成完整的知识管理流程</li>
        </ul>
      </div>
    </div>
  );
};
