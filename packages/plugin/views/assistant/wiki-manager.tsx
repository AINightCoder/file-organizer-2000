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

  // 确保按层级创建多级文件夹（替代过时的 plugin.createFolders）
  const ensureNestedFolders = async (folderPath: string) => {
    if (!folderPath) return;
    const parts = folderPath.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      await plugin.ensureFolderExists(current);
    }
  };

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
    if (!confirm(`确认处理当前笔记？\n\n将按照知识管理流程进行完整处理：\n1. 内容拆分（如需要）\n2. 内容优化和格式化\n3. 文件重命名\n4. 元数据扩展\n5. 智能文件夹分类\n6. 标签推荐\n7. Roadmap关联\n\n原笔记可能被删除（如果需要拆分），此操作不可撤销！`)) {
      return;
    }

    setIsProcessing(true);
    setProcessingLog([]);

    try {
      addLog('🚀 开始完整处理流程...');
      addLog(`📋 当前文件: ${activeFile.basename}`);
      addLog(`📏 内容长度: ${fileContent.length} 字符`);
      addLog('');

      // 检查AI服务
      if (!plugin.aiService) {
        addLog('❌ AI服务未初始化');
        new Notice('AI服务未初始化');
        return;
      }

      // ===== 步骤1: 判断是否需要拆分 =====
      addLog('📝 步骤1: 检查是否需要拆分');
      let needsSplit = false;
      let atomicNotes: any[] = [];

      if (fileContent.length >= plugin.settings.minNoteLength && plugin.settings.enableAtomicSplit) {
        addLog('  正在分析知识点...');
        
        try {
          atomicNotes = await plugin.aiService.splitIntoAtomicNotes({
            content: fileContent,
            filename: activeFile.basename,
            customPrompt: plugin.settings.atomicSplitPrompt
          });

          // 判断是否真的需要拆分
          if (atomicNotes.length > 1) {
            needsSplit = true;
            addLog(`  ✅ 识别出 ${atomicNotes.length} 个知识点，需要拆分`);
          } else if (atomicNotes.length === 1 && atomicNotes[0].content.trim() === fileContent.trim()) {
            addLog('  ℹ️ 已经是单一知识点，无需拆分');
          } else {
            addLog('  ℹ️ 无需拆分');
          }
        } catch (error: any) {
          addLog(`  ⚠️ 拆分分析失败: ${error.message}`);
          addLog('  ℹ️ 将作为单一笔记处理');
        }
      } else {
        addLog(`  ℹ️ 内容长度 ${fileContent.length} < ${plugin.settings.minNoteLength}，跳过拆分`);
      }
      addLog('');

      // ===== 步骤2: 执行拆分（如需要）=====
      let filesToProcess: TFile[] = [];
      
      if (needsSplit && atomicNotes.length > 1) {
        addLog('📝 步骤2: 执行拆分');
        
        // 检查长度并进行二次拆分
        const finalNotes = [];
        for (const note of atomicNotes) {
          if (note.content.length > plugin.settings.maxNoteLength) {
            addLog(`  ⚠️ 笔记 "${note.filename}" 超长 (${note.content.length} > ${plugin.settings.maxNoteLength})，进行长度拆分...`);
            
            try {
              const fragments = await plugin.aiService.splitByLength({
                content: note.content,
                maxLength: plugin.settings.maxNoteLength
              });

              fragments.forEach((fragment: string, index: number) => {
                finalNotes.push({
                  filename: `${note.filename} ${index + 1}`,
                  content: fragment,
                  knowledgePoint: note.knowledgePoint,
                  length: fragment.length
                });
              });
              addLog(`    拆分为 ${fragments.length} 个片段`);
            } catch (error: any) {
              addLog(`    ❌ 长度拆分失败: ${error.message}`);
              // 保留原笔记
              finalNotes.push(note);
            }
          } else {
            finalNotes.push({
              filename: note.filename,
              content: note.content,
              knowledgePoint: note.knowledgePoint,
              length: note.content.length
            });
          }
        }

        addLog(`  最终拆分为 ${finalNotes.length} 个笔记`);
        
        // 创建拆分笔记
        const targetFolder = activeFile.parent;
        for (let i = 0; i < finalNotes.length; i++) {
          const note = finalNotes[i];
          addLog(`  创建笔记 ${i + 1}/${finalNotes.length}: ${note.filename}`);

          try {
            const newFilePath = `${targetFolder.path}/${note.filename}.md`;
            const newFile = await plugin.app.vault.create(newFilePath, note.content);
            filesToProcess.push(newFile);
            addLog(`    ✅ 已创建: ${newFile.basename}`);
          } catch (error: any) {
            addLog(`    ❌ 创建失败: ${note.filename} - ${error.message}`);
          }
        }

        // 删除原笔记
        addLog('  🗑️ 删除原笔记...');
        await plugin.app.vault.delete(activeFile);
        addLog('  ✅ 原笔记已删除');
      } else {
        addLog('📝 步骤2: 跳过拆分，直接处理当前笔记');
        filesToProcess = [activeFile];
      }
      addLog('');

      // ===== 步骤3-13: 处理每个笔记 =====
      addLog(`📋 开始处理 ${filesToProcess.length} 个笔记...`);
      addLog('');

      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        addLog(`${'='.repeat(50)}`);
        addLog(`📄 处理笔记 ${i + 1}/${filesToProcess.length}: ${file.basename}`);
        addLog(`${'='.repeat(50)}`);

        try {
          let currentFile = file;
          let content = await plugin.app.vault.read(currentFile);

          // 步骤3: 内容优化和格式化
          addLog('📝 步骤3: 内容优化和格式化');
          if (plugin.settings.enableDocumentClassification) {
            try {
              // 1) 获取可用模板并进行分类
              const templateNames = await plugin.getTemplateNames();
              if (!templateNames || templateNames.length === 0) {
                addLog('  ℹ️ 未找到可用模板，跳过格式化');
              } else {
                const documentType = await plugin.classifyContentV2(
                  content,
                  templateNames
                );

                if (!documentType) {
                  addLog('  ℹ️ 无法确定文档类型，跳过格式化');
                } else {
                  // 2) 根据分类获取格式化指令
                  const instructions = await plugin.getTemplateInstructions(documentType);
                  if (!instructions || !instructions.trim()) {
                    addLog('  ℹ️ 未获取到格式化指令，尝试使用 settings.optimizePrompt 作为回退');
                    // 如果没有模板指令，使用 settings 中的 optimizePrompt 作为回退进行格式化
                    const fallbackInstructions = plugin.settings.optimizePrompt;
                    if (fallbackInstructions && fallbackInstructions.trim()) {
                      try {
                        const formattedContent = await plugin.formatContentV2(
                          content,
                          fallbackInstructions
                        );

                        if (formattedContent && formattedContent !== content) {
                          await plugin.app.vault.modify(currentFile, formattedContent);
                          content = formattedContent;
                          addLog(`  ✅ 内容格式化完成（使用回退提示词）`);
                        } else {
                          addLog('  ℹ️ 回退提示词未做出修改，跳过格式化');
                        }
                      } catch (err: any) {
                        addLog(`  ⚠️ 使用回退提示词格式化失败: ${err.message}`);
                      }
                    } else {
                      addLog('  ℹ️ 未配置回退格式化提示词（optimizePrompt），跳过格式化');
                    }
                  } else {
                    // 3) 执行格式化
                    const formattedContent = await plugin.formatContentV2(
                      content,
                      instructions
                    );

                    if (formattedContent && formattedContent !== content) {
                      await plugin.app.vault.modify(currentFile, formattedContent);
                      content = formattedContent;
                      addLog(`  ✅ 内容格式化完成（模板: ${documentType}）`);
                    } else {
                      addLog('  ℹ️ 内容无需格式化');
                    }
                  }
                }
              }
            } catch (error: any) {
              addLog(`  ⚠️ 格式化失败: ${error.message}`);
            }
          } else {
            addLog('  ℹ️ 格式化功能未启用');
          }

          // 步骤4: 文件重命名
          addLog('📝 步骤4: 文件重命名');
          try {
            const titleSuggestions = await plugin.recommendName(content, currentFile.basename);
            if (titleSuggestions && titleSuggestions.length > 0) {
              const newName = titleSuggestions[0].title;
              if (newName && newName !== currentFile.basename && currentFile.parent) {
                addLog(`  建议名称: ${newName}`);
                const newPath = `${currentFile.parent.path}/${newName}.md`;
                await plugin.app.fileManager.renameFile(currentFile, newPath);
                currentFile = plugin.app.vault.getAbstractFileByPath(newPath) as TFile;
                addLog(`  ✅ 重命名为: ${newName}`);
              } else {
                addLog('  ℹ️ 文件名已合适，无需重命名');
              }
            }
          } catch (error: any) {
            addLog(`  ⚠️ 重命名失败: ${error.message}`);
          }

          // 步骤5: 元数据扩展
          addLog('📝 步骤5: 元数据扩展');
          let metadata: any = null;
          if (plugin.settings.enableEnhancedMetadata && plugin.aiService.generateEnhancedMetadata) {
            try {
              metadata = await plugin.aiService.generateEnhancedMetadata({
                content,
                filename: currentFile.basename
              });
              addLog(`  ✅ 元数据生成成功`);
              addLog(`    标题: ${metadata.title}`);
              addLog(`    类别: ${metadata.category}`);
              addLog(`    标签: ${metadata.tags?.join(', ') || '无'}`);
            } catch (error: any) {
              addLog(`  ⚠️ 元数据生成失败: ${error.message}`);
            }
          } else {
            addLog('  ℹ️ 元数据扩展功能未启用');
          }

          // 步骤6: 应用元数据
          if (metadata) {
            addLog('📝 步骤6: 应用元数据');
            try {
              // 读取当前内容并更新
              content = await plugin.app.vault.read(currentFile);
              
              // 构建YAML前言
              const yamlFrontmatter = `---
id: "${metadata.id || `${Date.now()}-${currentFile.basename}`}"
title: "${metadata.title || currentFile.basename}"
version: "${metadata.version || '1.0'}"
create: ${metadata.create || new Date().toISOString().split('T')[0]}
update: ${metadata.update || new Date().toISOString().split('T')[0]}
source: "${metadata.source || '个人笔记'}"
credibility: ${metadata.credibility || 5}
cate: "${metadata.category || ''}"
subcate: "${metadata.subcategory || ''}"
tags: [${metadata.tags?.map((t: string) => `"${t}"`).join(', ') || ''}]
summary: "${metadata.summary || ''}"
---

`;
              
              // 如果已有YAML前言，替换；否则添加
              if (content.startsWith('---')) {
                const endIndex = content.indexOf('---', 3);
                if (endIndex !== -1) {
                  content = yamlFrontmatter + content.substring(endIndex + 4);
                } else {
                  content = yamlFrontmatter + content;
                }
              } else {
                content = yamlFrontmatter + content;
              }
              
              await plugin.app.vault.modify(currentFile, content);
              addLog('  ✅ 元数据已应用');
            } catch (error: any) {
              addLog(`  ⚠️ 应用元数据失败: ${error.message}`);
            }
          }

          // 步骤7: 智能文件夹分类
          addLog('📝 步骤7: 智能文件夹分类');
          let targetFolder = currentFile.parent?.path || '';
          try {
            const folderSuggestions = await plugin.recommendFolders(content, currentFile.basename);
            if (folderSuggestions && folderSuggestions.length > 0) {
              const suggestedFolder = folderSuggestions[0].folder;
              addLog(`  推荐文件夹: ${suggestedFolder}`);
              
              // 确保文件夹存在
              const folderPath = suggestedFolder.startsWith('/') ? suggestedFolder.substring(1) : suggestedFolder;
              if (!plugin.app.vault.getAbstractFileByPath(folderPath)) {
                await ensureNestedFolders(folderPath);
                addLog(`  ✅ 创建文件夹: ${folderPath}`);
              }
              
              // 移动文件
              const newPath = `${folderPath}/${currentFile.name}`;
              await plugin.app.fileManager.renameFile(currentFile, newPath);
              currentFile = plugin.app.vault.getAbstractFileByPath(newPath) as TFile;
              targetFolder = folderPath;
              addLog(`  ✅ 已移动到: ${folderPath}`);
            } else {
              addLog('  ℹ️ 无文件夹推荐');
            }
          } catch (error: any) {
            addLog(`  ⚠️ 文件夹分类失败: ${error.message}`);
          }

          // 步骤8: 标签推荐
          addLog('📝 步骤8: 标签推荐');
          if (plugin.settings.useSimilarTags) {
            try {
              const existingTags = await plugin.getAllVaultTags();
              const suggestions = await plugin.recommendTags(
                content,
                currentFile.path,
                existingTags
              );

              if (suggestions && suggestions.length > 0) {
                const tagsToAdd = suggestions.map(s => s.tag);
                addLog(`  推荐标签: ${tagsToAdd.join(', ')}`);

                // 使用插件提供的方法按设置安全添加标签
                for (const s of suggestions) {
                  await plugin.appendTag(currentFile, s.tag);
                }
                addLog('  ✅ 标签已添加');
              } else {
                addLog('  ℹ️ 无标签推荐');
              }
            } catch (error: any) {
              addLog(`  ⚠️ 标签推荐失败: ${error.message}`);
            }
          } else {
            addLog('  ℹ️ 标签推荐功能未启用');
          }

          // 步骤9: Roadmap关联
          addLog('📝 步骤9: Roadmap关联');

          // Debug: 明确记录当前设置和 metadata 状态，便于排查为什么未触发关联
          addLog(`  debug: enableRoadmapLinking=${!!plugin.settings.enableRoadmapLinking}, metadataExists=${!!metadata}, metadata.category=${metadata?.category ?? '<none>'}`);

          // 更明确的判断和回退策略：
          // 1) 如果设置关闭 => 明确提示
          // 2) 如果 metadata.category 缺失 => 尝试从文件 YAML 前言回退读取 category
          if (!plugin.settings.enableRoadmapLinking) {
            addLog('  ℹ️ Roadmap关联功能未启用（设置关闭）');
          } else {
            // 确保有 category（优先使用 metadata），若无则尝试从已写入的文件前言读取
            if (!metadata?.category) {
              try {
                const fileText = await plugin.app.vault.read(currentFile);
                if (fileText.startsWith('---')) {
                  const endIndex = fileText.indexOf('---', 3);
                  if (endIndex !== -1) {
                    const yaml = fileText.substring(3, endIndex);
                    // 尝试用正则提取 cate 字段（与写入时使用的字段名一致）
                    const m = yaml.match(/^[ \t]*cate:\s*["']?(.*?)["']?\s*$/m);
                    if (m && m[1]) {
                      const fallbackCate = m[1].trim();
                      if (fallbackCate) {
                        addLog(`  ℹ️ 从文件前言回退获取到分类: ${fallbackCate}`);
                        metadata = { ...(metadata || {}), category: fallbackCate };
                      }
                    }
                  }
                }
              } catch (err: any) {
                addLog(`  ⚠️ 回退读取文件前言失败: ${err.message}`);
              }
            }

            if (metadata?.category) {
              try {
                // 查找或创建Roadmap
                const roadmapPath = `${targetFolder}/01.Roadmap/Roadmap.md`;
                let roadmapFile = plugin.app.vault.getAbstractFileByPath(roadmapPath) as TFile;

                if (!roadmapFile) {
                  addLog('  创建Roadmap文件...');
                  await ensureNestedFolders(`${targetFolder}/${plugin.settings.roadmapFolder}`);
                  // 尝试用 AI 生成完整 Roadmap 内容（使用 settings 中的提示词）
                  try {
                    const domain = metadata.category || metadata.title || '通用领域';
                    const roadmapPrompt = plugin.settings.roadmapPrompt;
                    let roadmapContent: string | null = null;

                    if (plugin.aiService && plugin.aiService.generateRoadmap) {
                      addLog('  ℹ️ 使用 AI 生成 Roadmap 内容...');
                      roadmapContent = await plugin.aiService.generateRoadmap({ domain, customPrompt: roadmapPrompt });
                      if (roadmapContent && typeof roadmapContent === 'string' && roadmapContent.trim().length > 0) {
                        roadmapFile = await plugin.app.vault.create(roadmapPath, roadmapContent);
                        addLog(`  ✅ 已使用 AI 生成并创建: ${roadmapPath}`);
                      }
                    }

                    // 回退：如果 AI 未生成内容或出错，创建基础标题文件
                    if (!roadmapFile) {
                      addLog('  ⚠️ AI 未返回有效 Roadmap，创建基础 Roadmap 文件作为回退');
                      const header = `# ${metadata.category} Roadmap\n\n`;
                      roadmapFile = await plugin.app.vault.create(roadmapPath, header);
                      addLog(`  ✅ 已创建: ${roadmapPath}`);
                    }
                  } catch (err: any) {
                    addLog(`  ⚠️ Roadmap 生成失败，使用基础模板: ${err.message}`);
                    const header = `# ${metadata.category} Roadmap\n\n`;
                    try {
                      roadmapFile = await plugin.app.vault.create(roadmapPath, header);
                      addLog(`  ✅ 已创建: ${roadmapPath}`);
                    } catch (e: any) {
                      addLog(`  ❌ 无法创建 Roadmap 文件: ${e.message}`);
                    }
                  }
                }

                // 添加链接到Roadmap
                const linkText = `\n- [[${currentFile.basename}]]`;
                await plugin.app.vault.append(roadmapFile, linkText);
                addLog(`  ✅ 已关联到Roadmap`);
              } catch (error: any) {
                addLog(`  ⚠️ Roadmap关联失败: ${error.message}`);
              }
            } else {
              addLog('  ℹ️ Roadmap未关联：未生成类别信息（metadata.category 为空）。请启用增强元数据，或检查 AI 服务返回值。');
            }
          }

          addLog(`✅ 笔记处理完成: ${currentFile.basename}`);
          addLog('');

        } catch (error: any) {
          addLog(`❌ 处理笔记失败: ${file.basename}`);
          addLog(`   错误: ${error.message}`);
          console.error(`处理 ${file.basename} 失败:`, error);
        }
      }

      addLog('');
      addLog('🎉 全部处理完成！');
      new Notice(`成功处理了 ${filesToProcess.length} 个笔记`);

    } catch (error: any) {
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

    } catch (error: any) {
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
