// @ts-nocheck
import React, { useState, useEffect } from 'react';
import FileOrganizer from '../..';
import { TFile, Notice, TFolder } from 'obsidian';
import { SectionHeader } from './section-header';
import { DEFAULT_ROADMAP_PROMPT, DEFAULT_OPTIMIZE_PROMPT } from '../../prompts';

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

    setIsProcessing(true);
    setProcessingLog([]);

    try {
      addLog('🚀 开始完整处理流程...');
      const splitCreatedPaths = new Set<string>();
      let processingContent = fileContent;
      addLog(`📋 当前文件: ${activeFile.basename}`);
      addLog(`📏 内容长度: ${processingContent.length} 字符`);
      addLog('');

      // 检查AI服务
      if (!plugin.aiService) {
        addLog('❌ AI服务未初始化');
        new Notice('AI服务未初始化');
        return;
      }
      // 预处理：文件重命名（在拆分之前执行）
      let sourceFile: TFile = activeFile;
      addLog('📝 预处理: 文件重命名');
      try {
        const titleSuggestions = await plugin.recommendName(fileContent, sourceFile.basename);
        if (titleSuggestions && titleSuggestions.length > 0) {
          const newName = titleSuggestions[0].title;
          if (newName && newName !== sourceFile.basename && sourceFile.parent) {
            addLog(`  建议名称: ${newName}`);
            const newPath = `${sourceFile.parent.path}/${newName}.md`;
            await plugin.app.fileManager.renameFile(sourceFile, newPath);
            const updated = plugin.app.vault.getAbstractFileByPath(newPath) as TFile;
            if (updated) {
              sourceFile = updated;
              addLog(`  ✅ 已重命名为: ${newName}`);
            }
          } else {
            addLog('  ℹ️ 文件名已合适，无需重命名');
          }
        }
      } catch (e: any) {
        addLog(`  ⚠️ 预处理重命名失败: ${e.message}`);
      }

      // 预处理：内容格式优化（在拆分之前执行）
      addLog('📝 预处理: 内容格式优化');
      if (plugin.settings.enableDocumentClassification) {
        try {
          // Prompt selection order: caller/settings/DEFAULT
          const fallbackInstructions = plugin.settings.optimizePrompt && plugin.settings.optimizePrompt.trim()
            ? plugin.settings.optimizePrompt
            : DEFAULT_OPTIMIZE_PROMPT;
          if (fallbackInstructions && fallbackInstructions.trim()) {
            try {
              const formattedContent = await plugin.formatContentV2(
                processingContent,
                fallbackInstructions
              );

              if (formattedContent && formattedContent !== processingContent) {
                await plugin.app.vault.modify(sourceFile, formattedContent);
                processingContent = formattedContent;
                try { setFileContent(formattedContent); } catch {}
                addLog(`  ✅ 内容格式化完成（预处理）`);
              } else {
                addLog('  ℹ️ 预处理提示词未做出修改，跳过格式化');
              }
            } catch (err: any) {
              addLog(`  ⚠️ 预处理格式化失败: ${err.message}`);
            }
          } else {
            addLog('  ℹ️ 未配置回退格式化提示词（optimizePrompt），跳过预处理格式化');
          }
        } catch (error: any) {
          addLog(`  ⚠️ 预处理格式化失败: ${error.message}`);
        }
      } else {
        addLog('  ℹ️ 格式化功能未启用');
      }

      // ===== 步骤1: 判断是否需要拆分 =====
      addLog('📝 步骤1: 检查是否需要拆分');
      let needsSplit = false;
      let atomicNotes: any[] = [];

      if (processingContent.length >= plugin.settings.minNoteLength && plugin.settings.enableAtomicSplit) {
        addLog('  正在分析知识点...');
        
        try {
          atomicNotes = await plugin.aiService.splitIntoAtomicNotes({
            content: processingContent,
            filename: sourceFile.basename,
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
        addLog(`  ℹ️ 内容长度 ${processingContent.length} < ${plugin.settings.minNoteLength}，跳过拆分`);
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
                maxLength: plugin.settings.maxNoteLength,
                customPrompt: plugin.settings.lengthSplitPrompt
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
        const targetFolder = sourceFile.parent; // may be null
        const targetFolderPath = targetFolder ? targetFolder.path : (plugin.settings.knowledgeBaseRoot || sourceFile.parent?.path || '');
        for (let i = 0; i < finalNotes.length; i++) {
          const note = finalNotes[i];
          addLog(`  创建笔记 ${i + 1}/${finalNotes.length}: ${note.filename}`);

          try {
            const newFilePath = `${targetFolderPath}/${note.filename}.md`;
            const newFile = await plugin.app.vault.create(newFilePath, note.content);
            filesToProcess.push(newFile);
            splitCreatedPaths.add(newFile.path);
            addLog(`    ✅ 已创建: ${newFile.basename}`);
          } catch (error: any) {
            addLog(`    ❌ 创建失败: ${note.filename} - ${error.message}`);
          }
        }

        // 删除原笔记
        addLog('  🗑️ 删除原笔记...');
        await plugin.app.vault.delete(sourceFile);
        addLog('  ✅ 原笔记已删除');
      } else {
        addLog('📝 步骤2: 跳过拆分，直接处理当前笔记');
        filesToProcess = [sourceFile];
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

          // 步骤3: 内容格式优化（已前置，跳过）
          addLog('📝 步骤3: 内容格式优化（已前置，跳过）');

          addLog("📝 步骤4: 文件重命名（已前置，跳过）");
          addLog('📝 步骤5: 智能文件夹分类（二阶段）');
          let targetFolder = currentFile.parent?.path || '';
          let domainRootFolder: string | null = null; // 二级目录，如 1.Area/SEO
          try {
            // 第1阶段：仅选择二级目录（recommendFolders 内部已将候选折叠为前两级）
            const folderSuggestions = await plugin.recommendFolders(content, currentFile.basename);
            if (folderSuggestions && folderSuggestions.length > 0) {
              const normalizePath = (p: string) => (p.startsWith('/') ? p.substring(1) : p);
              const suggestionsNorm = folderSuggestions.map((s: any) => ({ ...s, folder: normalizePath(s.folder) }));
              const exists = (p: string) => !!plugin.app.vault.getAbstractFileByPath(p);
              const existing = suggestionsNorm.filter((s: any) => exists(s.folder));
              const pick = (arr: any[]) => arr.sort((a,b) => (b.score ?? 0) - (a.score ?? 0))[0];
              const chosenL2 = (existing.length > 0) ? pick(existing) : pick(suggestionsNorm);
              domainRootFolder = chosenL2.folder; // 形如 1.Area/SEO
              addLog(`  选择二级目录: ${domainRootFolder}${existing.length>0 ? '（已存在）' : '（新建）'}`);

              // 确保二级目录存在
              const l2FolderPath = domainRootFolder.startsWith('/') ? domainRootFolder.substring(1) : domainRootFolder;
              if (!plugin.app.vault.getAbstractFileByPath(l2FolderPath)) {
                await ensureNestedFolders(l2FolderPath);
                addLog(`  ✅ 创建二级目录: ${l2FolderPath}`);
              }

              // 第2阶段：在二级目录下准备标准三级目录并二次AI选择
              const kbRoot = plugin.settings.knowledgeBaseRoot || '1.Area';
              const isUnderKB = l2FolderPath.startsWith(`${kbRoot}/`);
              const roadmapName = plugin.settings.roadmapFolder || '01.Roadmap';
              const configured = (plugin.settings as any).level3Dirs && (plugin.settings as any).level3Dirs.length > 0
                ? (plugin.settings as any).level3Dirs.map((d: string) => d === '01.Roadmap' ? roadmapName : d)
                : [roadmapName, '02.What','03.Why','04.How','05.Tool','06.Resource'];
              const level3Dirs = Array.from(new Set(configured));

              // 计算三级候选路径：标准集 + （可选）已有自定义三级目录
              const standardCandidates = level3Dirs.map(d => `${l2FolderPath}/${d}`);
              let level3Candidates = [...standardCandidates];
              if ((plugin.settings as any).includeExistingLevel3Dirs) {
                try {
                  const l2FolderAbs = plugin.app.vault.getAbstractFileByPath(l2FolderPath) as any;
                  const existing = (l2FolderAbs && l2FolderAbs.children)
                    ? l2FolderAbs.children.filter((c: any) => c && c.children).map((f: any) => f.path)
                    : [];
                  level3Candidates = Array.from(new Set([...level3Candidates, ...existing]));
                } catch {}
              }

              let finalFolder = l2FolderPath; // 默认若后续失败则落入二级目录

              if (isUnderKB) {
                // 是否急切创建：全部标准三级目录 vs 懒创建最终目录
                if ((plugin.settings as any).eagerCreateLevel3Dirs) {
                  for (const p of standardCandidates) {
                    if (!plugin.app.vault.getAbstractFileByPath(p)) {
                      await ensureNestedFolders(p);
                      addLog(`  ✅ 创建三级目录: ${p}`);
                    }
                  }
                }

                // 组装三级候选并调用AI进行精细归类（仅从提供列表中选择一个）
                try {
                  const thirdLevelCandidates = level3Candidates;
                  const cutoff = plugin.settings.contentCutoffChars;
                  const trimmed = content.slice(0, cutoff);
                  const hints = (plugin.settings as any).level3DirHints || {};
                  const hintLines = level3Dirs
                    .map(d => hints[d] ? `${d}: ${hints[d]}` : null)
                    .filter(Boolean) as string[];
                  const hintBlock = hintLines.length > 0 ? `\n目录含义：\n- ${hintLines.join('\n- ')}` : '';
                  const customSubfolderInstruction = `仅从提供的 folders 列表中选择最合适的一个三级目录（候选均为 ${l2FolderPath} 的直接子目录）。不要建议新路径，也不要返回二级目录。确保仅返回 1 个结果。${hintBlock}`;
                  const l3Suggestions = await plugin.aiService.generateFolder({
                    content: trimmed,
                    fileName: currentFile.basename,
                    folders: thirdLevelCandidates,
                    customInstructions: customSubfolderInstruction,
                    count: 1,
                  });
                  if (l3Suggestions && l3Suggestions.length > 0) {
                    const chosenL3 = l3Suggestions.sort((a:any,b:any)=> (b.score??0)-(a.score??0))[0];
                    // 强制限定到候选集合内
                    finalFolder = level3Candidates.includes(chosenL3.folder) ? chosenL3.folder : finalFolder;
                    addLog(`  选择三级目录: ${finalFolder}`);
                  } else {
                    // 回退：尝试使用配置的默认三级目录
                    const fallbackName = (plugin.settings as any).fallbackLevel3Dir || '02.What';
                    const fallbackPath = level3Candidates.find(p => p.endsWith(`/${fallbackName}`));
                    if (fallbackPath) {
                      finalFolder = fallbackPath;
                      addLog(`  ℹ️ 三级目录推荐为空，回退到: ${finalFolder}`);
                    } else {
                      addLog('  ℹ️ 三级目录推荐为空，将落入二级目录');
                    }
                  }
                } catch (e:any) {
                  addLog(`  ⚠️ 三级目录选择失败：${e.message}，将落入二级目录`);
                }

                // 懒创建：仅在最终落位目录不存在时创建
                if (!(plugin.settings as any).eagerCreateLevel3Dirs) {
                  if (!plugin.app.vault.getAbstractFileByPath(finalFolder)) {
                    await ensureNestedFolders(finalFolder);
                    addLog(`  ✅ 创建最终三级目录: ${finalFolder}`);
                  }
                }

                // 移动到最终三级目录（或二级目录回退）
                const newPath = `${finalFolder}/${currentFile.name}`;
                await plugin.app.fileManager.renameFile(currentFile, newPath);
                currentFile = plugin.app.vault.getAbstractFileByPath(newPath) as TFile;
                targetFolder = finalFolder;
                addLog(`  ✅ 已移动到: ${finalFolder}`);
              } else {
                // 若不在知识库根下，直接移动到选定的二级目录
                const newPath = `${l2FolderPath}/${currentFile.name}`;
                await plugin.app.fileManager.renameFile(currentFile, newPath);
                currentFile = plugin.app.vault.getAbstractFileByPath(newPath) as TFile;
                targetFolder = l2FolderPath;
                addLog(`  ✅ 已移动到: ${l2FolderPath}`);
              }
            } else {
              addLog('  ℹ️ 无文件夹推荐');
            }
          } catch (error: any) {
            addLog(`  ⚠️ 文件夹分类失败: ${error.message}`);
          }

          // 步骤6: 元数据扩展与写入（移动完成后执行）
          addLog('📝 步骤6: 元数据扩展与写入');
          let metadata: any = null;
          try {
            if (plugin.settings.enableEnhancedMetadata && plugin.aiService.generateEnhancedMetadata) {
              metadata = await plugin.aiService.generateEnhancedMetadata({
                content,
                filename: currentFile.basename,
                customPrompt: plugin.settings.enhancedMetadataPrompt
              });
              addLog(`  ✅ 元数据生成成功`);
            } else {
              addLog('  ℹ️ 元数据扩展功能未启用，使用基础字段');
              metadata = {};
            }

            // 从最终路径推导 cate/subcate
            const pathParts = targetFolder.split('/').filter(Boolean);
            const kbRoot = plugin.settings.knowledgeBaseRoot || '1.Area';
            const rootIdx = pathParts.indexOf(kbRoot);
            const cate = rootIdx >= 0 && pathParts.length > rootIdx + 1 ? pathParts[rootIdx + 1] : (pathParts[1] || '');
            const subcate = rootIdx >= 0 && pathParts.length > rootIdx + 2 ? pathParts[rootIdx + 2] : (pathParts[2] || '');
            metadata = { ...(metadata || {}), category: cate, subcategory: subcate };

            // 解析已有 frontmatter（若有），沿用 create 并做 version+0.1
            let existingCreate = '';
            let nextVersion = '1.0';
            if (content.startsWith('---')) {
              const endIndex = content.indexOf('---', 3);
              if (endIndex !== -1) {
                const yaml = content.substring(3, endIndex);
                const mCreate = yaml.match(/^[ \t]*create:\s*(.*)$/m);
                const mVersion = yaml.match(/^[ \t]*version:\s*"?(\d+(?:\.\d+)?)"?/m);
                if (mCreate && mCreate[1]) existingCreate = mCreate[1].trim();
                if (mVersion && mVersion[1]) {
                  const v = parseFloat(mVersion[1]);
                  if (!Number.isNaN(v)) nextVersion = (Math.round((v + 0.1) * 10) / 10).toFixed(1);
                }
              }
            }

            const now = new Date();
            const pad = (n: number) => n.toString().padStart(2, '0');
            const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
            const id = `${ts}-${(metadata?.title || currentFile.basename)}`;
            const createDate = existingCreate || now.toISOString().split('T')[0];
            const updateDate = now.toISOString().split('T')[0];

            const yamlFrontmatter = `---
id: "${id}"
title: "${metadata?.title || currentFile.basename}"
version: "${nextVersion}"
create: ${createDate}
update: ${updateDate}
source: "${metadata?.source || '个人笔记'}"
credibility: ${metadata?.credibility || 5}
cate: "${cate}"
subcate: "${subcate}"
tags: [${(metadata?.tags || []).map((t: string) => `"${t}"`).join(', ')}]
summary: "${metadata?.summary || ''}"
---

`;

            // 覆盖/添加 frontmatter（不再二次读取文件，直接使用内存中的 content）
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
            addLog(`  ⚠️ 元数据处理失败: ${error.message}`);
          }

          // 步骤7: Roadmap 关联
          addLog('📝 步骤7: Roadmap 关联');

          // 更明确的判断和回退策略：
          // 1) 如果设置关闭 => 明确提示
          // 2) 如果 metadata.category 缺失 => 尝试从文件 YAML 前言回退读取 category
          if (!plugin.settings.enableRoadmapLinking) {
            addLog('  ℹ️ Roadmap关联功能未启用（设置关闭）');
          } else {
            // 先从路径推导 cate 获取领域（优先使用二级目录作为锚点）
            let domainCate = (() => {
              const baseForDomain = (typeof domainRootFolder === 'string' && domainRootFolder.length > 0)
                ? domainRootFolder
                : targetFolder;
              const parts = baseForDomain.split('/').filter(Boolean);
              const kbRoot = plugin.settings.knowledgeBaseRoot || '1.Area';
              const idx = parts.indexOf(kbRoot);
              return idx >= 0 && parts.length > idx + 1 ? parts[idx + 1] : (parts[1] || '');
            })();

            // 若仍无，则尝试从文件 YAML 前言读取
            if (!domainCate) {
              try {
                const fileText = await plugin.app.vault.read(currentFile);
                if (fileText.startsWith('---')) {
                  const endIndex = fileText.indexOf('---', 3);
                  if (endIndex !== -1) {
                    const yaml = fileText.substring(3, endIndex);
                    const m = yaml.match(/^[ \t]*cate:\s*["']?(.*?)["']?\s*$/m);
                    if (m && m[1]) domainCate = (m[1] || '').trim();
                  }
                }
              } catch (err: any) {
                addLog(`  ⚠️ 回退读取文件前言失败: ${err.message}`);
              }
            }

            if (domainCate) {
              try {
                // 查找或创建Roadmap（始终锚定在二级目录）
                const roadmapBase = (typeof domainRootFolder === 'string' && domainRootFolder.length > 0)
                  ? domainRootFolder
                  : targetFolder;
                const roadmapPath = `${roadmapBase}/01.Roadmap/Roadmap.md`;
                let roadmapFile = plugin.app.vault.getAbstractFileByPath(roadmapPath) as TFile;

                if (!roadmapFile) {
                  addLog('  创建Roadmap文件...');
                  await ensureNestedFolders(`${roadmapBase}/${plugin.settings.roadmapFolder}`);
                  // 尝试用 AI 生成完整 Roadmap 内容（使用 settings 中的提示词）
                  try {
                    const domain = domainCate || metadata?.title || '通用领域';
                    const roadmapPrompt = plugin.settings.roadmapPrompt && plugin.settings.roadmapPrompt.trim().length > 0
                      ? plugin.settings.roadmapPrompt
                      : DEFAULT_ROADMAP_PROMPT;

                    // Prepare final prompt: if it contains ${domain} replace it, otherwise append domain context
                    let finalRoadmapPrompt: string;
                    if (roadmapPrompt.includes('${domain}')) {
                      finalRoadmapPrompt = roadmapPrompt.replace(/\$\{domain\}/g, domain);
                      addLog('  ℹ️ roadmapPrompt 中的占位符 ${domain} 已替换');
                    } else {
                      finalRoadmapPrompt = `${roadmapPrompt}\n\n领域: ${domain}`;
                      addLog('  ℹ️ roadmapPrompt 未包含占位符，已附加领域上下文或使用默认模板');
                    }

                    let roadmapContent: string | null = null;
                    if (plugin.aiService && plugin.aiService.generateRoadmap) {
                      addLog('  ℹ️ 使用 AI 生成 Roadmap 内容...');
                      roadmapContent = await plugin.aiService.generateRoadmap({ domain, customPrompt: finalRoadmapPrompt });
                      if (roadmapContent && typeof roadmapContent === 'string' && roadmapContent.trim().length > 0) {
                        roadmapFile = await plugin.app.vault.create(roadmapPath, roadmapContent);
                        addLog(`  ✅ 已使用 AI 生成并创建: ${roadmapPath}`);
                      }
                    }

                    // 回退：如果 AI 未生成内容或出错，创建基础标题文件
                    if (!roadmapFile) {
                      addLog('  ⚠️ AI 未返回有效 Roadmap，创建基础 Roadmap 文件作为回退');
                      const header = `# ${domainCate} Roadmap\n\n`;
                      roadmapFile = await plugin.app.vault.create(roadmapPath, header);
                      addLog(`  ✅ 已创建: ${roadmapPath}`);
                    }
                  } catch (err: any) {
                    addLog(`  ⚠️ Roadmap 生成失败，使用基础模板: ${err.message}`);
                    const header = `# ${domainCate} Roadmap\n\n`;
                    try {
                      roadmapFile = await plugin.app.vault.create(roadmapPath, header);
                      addLog(`  ✅ 已创建: ${roadmapPath}`);
                    } catch (e: any) {
                      addLog(`  ❌ 无法创建 Roadmap 文件: ${e.message}`);
                    }
                  }
                }

                // 添加链接到Roadmap（按参考流程插入到对应模块）
                try {
                  const noteTitle = currentFile.basename;
                  const noteLink = `- [[${noteTitle}]]`;
                  let roadmapText = await plugin.app.vault.read(roadmapFile);

                  // 如果已存在相同双链则跳过
                  if (roadmapText.includes(`[[${noteTitle}]]`)) {
                    addLog('  ℹ️ Roadmap 已存在该链接，跳过插入');
                  } else if (plugin.aiService && (plugin.aiService as any).findRoadmapInsertPosition) {
                    // 使用 AI 计算插入位置
                    const insert = await (plugin.aiService as any).findRoadmapInsertPosition({
                      roadmapContent: roadmapText,
                      noteContent: content,
                      noteTitle,
                      notePath: currentFile.path,
                    });

                    const lines = roadmapText.split('\n');
                    // 1-based → 0-based，防越界
                    let idx = Math.max(0, Math.min(lines.length, (insert?.lineNumber ?? (lines.length + 1)) - 1));

                    // 若需要预创建模块/知识点，则先插入这些行
                    if (insert?.prependLines && insert.prependLines.length > 0) {
                      lines.splice(idx, 0, ...insert.prependLines);
                      idx += insert.prependLines.length;
                    }

                    // 插入双链
                    lines.splice(idx, 0, noteLink);
                    roadmapText = lines.join('\n');
                    await plugin.app.vault.modify(roadmapFile, roadmapText);
                    addLog(`  ✅ 已在模块内插入 Roadmap 链接（行 ${idx + 1}）`);
                  } else {
                    // 回退：插入到“未归类/待整理”节，若不存在则创建
                    const fallbackHeader = '## 🗂 未归类/待整理';
                    if (!roadmapText.includes(fallbackHeader)) {
                      roadmapText = `${roadmapText.trim()}\n\n${fallbackHeader}\n`;
                    }
                    roadmapText = `${roadmapText}\n${noteLink}`;
                    await plugin.app.vault.modify(roadmapFile, roadmapText);
                    addLog('  ✅ 已插入到“未归类/待整理”模块');
                  }
                } catch (insertErr: any) {
                  addLog(`  ⚠️ Roadmap 插入位置计算失败，采用追加：${insertErr.message}`);
                  await plugin.app.vault.append(roadmapFile, `\n- [[${currentFile.basename}]]`);
                }
                addLog(`  ✅ 已关联到Roadmap`);
              } catch (error: any) {
                addLog(`  ⚠️ Roadmap关联失败: ${error.message}`);
              }
            } else {
              addLog('  ℹ️ Roadmap未关联：无法确定 cate（领域分类）。');
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






