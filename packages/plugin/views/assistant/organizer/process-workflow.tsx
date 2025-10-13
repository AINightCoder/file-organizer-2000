import * as React from "react";
import { TFile, Notice } from "obsidian";
import FileOrganizer from "../../../index";
import { DEFAULT_ROADMAP_PROMPT, DEFAULT_OPTIMIZE_PROMPT } from "../../../prompts";
import { logger } from "../../../services/logger";
import {
  RenameStepDetail,
  FormatStepDetail,
  Level2FolderStepDetail,
  Level3FolderStepDetail,
  MetadataStepDetail,
  RoadmapStepDetail
} from "./step-details";

// ============ 类型定义 ============
type WorkflowStatus = 'idle' | 'running' | 'paused' | 'completed' | 'cancelled';
type StepStatus = 'pending' | 'running' | 'waiting_confirm' | 'completed' | 'failed';

interface ProcessStep {
  id: number;
  name: string;
  icon: string;
  status: StepStatus;
  result?: any;
  error?: string;
}

interface StepResult {
  success: boolean;
  data?: any;
  error?: string;
  updatedFile?: TFile;
}

interface ProcessWorkflowProps {
  plugin: FileOrganizer;
  file: TFile;
  content: string;
}

// ============ 步骤定义 ============
const INITIAL_STEPS: ProcessStep[] = [
  { id: 0, name: '文件重命名', icon: '📝', status: 'pending' },
  { id: 1, name: '内容格式优化', icon: '✨', status: 'pending' },
  { id: 2, name: '二级目录分类', icon: '📁', status: 'pending' },
  { id: 3, name: '三级目录分类', icon: '📂', status: 'pending' },
  { id: 4, name: '生成元数据', icon: '🏷️', status: 'pending' },
  { id: 5, name: 'Roadmap关联', icon: '🗺️', status: 'pending' },
];

// ============ 主组件 ============
export const ProcessWorkflow: React.FC<ProcessWorkflowProps> = ({
  plugin,
  file: initialFile,
  content: initialContent,
}) => {
  // 状态管理
  const [workflowStatus, setWorkflowStatus] = React.useState<WorkflowStatus>('idle');
  const [currentStepIndex, setCurrentStepIndex] = React.useState<number>(0);
  const [steps, setSteps] = React.useState<ProcessStep[]>(INITIAL_STEPS);
  const [processingLog, setProcessingLog] = React.useState<string[]>([]);
  const [currentFile, setCurrentFile] = React.useState<TFile>(initialFile);
  const [currentContent, setCurrentContent] = React.useState<string>(initialContent);
  const [customParams, setCustomParams] = React.useState<Record<number, any>>({});

  // 日志工具
  const addLog = React.useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setProcessingLog(prev => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  // 更新步骤状态
  const updateStepStatus = React.useCallback((stepIndex: number, status: StepStatus) => {
    setSteps(prev => prev.map((step, idx) =>
      idx === stepIndex ? { ...step, status } : step
    ));
  }, []);

  // 更新步骤结果
  const updateStepResult = React.useCallback((stepIndex: number, result: any, error?: string) => {
    setSteps(prev => prev.map((step, idx) =>
      idx === stepIndex ? { ...step, result, error } : step
    ));
  }, []);

  // 确保嵌套文件夹存在
  const ensureNestedFolders = React.useCallback(async (folderPath: string) => {
    if (!folderPath) return;
    const parts = folderPath.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      await plugin.ensureFolderExists(current);
    }
  }, [plugin]);

  // ============ 各步骤实现函数 ============

  // 步骤1: 文件重命名
  const doRename = React.useCallback(async (file: TFile): Promise<StepResult> => {
    try {
      const content = await plugin.app.vault.read(file);
      const suggestions = await plugin.recommendName(content, file.basename);

      if (suggestions && suggestions.length > 0) {
        const newName = suggestions[0].title;
        if (newName && newName !== file.basename && file.parent) {
          addLog(`  建议名称: ${newName}`);
          const newPath = `${file.parent.path}/${newName}.md`;
          await plugin.app.fileManager.renameFile(file, newPath);
          const newFile = plugin.app.vault.getAbstractFileByPath(newPath) as TFile;

          if (newFile) {
            addLog(`  ✅ 已重命名为: ${newName}`);
            return {
              success: true,
              updatedFile: newFile,
              data: {
                oldName: file.basename,
                newName: newName,
                suggestions: suggestions
              }
            };
          }
        } else {
          addLog('  ℹ️ 文件名已合适，无需重命名');
          return { success: true, updatedFile: file, data: { noChange: true } };
        }
      }

      return { success: true, updatedFile: file, data: { noChange: true } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, [plugin, addLog]);

  // 步骤2: 内容格式优化
  const doFormatOptimize = React.useCallback(async (file: TFile): Promise<StepResult> => {
    try {
      const content = await plugin.app.vault.read(file);
      const prompt = customParams[1]?.prompt ||
                     plugin.settings.optimizePrompt ||
                     DEFAULT_OPTIMIZE_PROMPT;

      if (!prompt || !prompt.trim()) {
        addLog('  ℹ️ 未配置格式化提示词，跳过');
        return { success: true, updatedFile: file, data: { noChange: true } };
      }

      addLog('  正在优化格式...');
      const formatted = await plugin.formatContentV2(content, prompt);

      if (formatted && formatted !== content) {
        await plugin.app.vault.modify(file, formatted);
        addLog(`  ✅ 格式优化完成`);

        return {
          success: true,
          updatedFile: file,
          data: {
            oldLength: content.length,
            newLength: formatted.length,
            diff: formatted.length - content.length,
            preview: formatted.substring(0, 500),
            fullContent: formatted
          }
        };
      } else {
        addLog('  ℹ️ 内容无需优化');
        return { success: true, updatedFile: file, data: { noChange: true } };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, [plugin, addLog, customParams]);

  // 步骤3: 二级目录分类
  const doLevel2Classification = React.useCallback(async (file: TFile): Promise<StepResult> => {
    try {
      const content = await plugin.app.vault.read(file);
      const suggestions = await plugin.recommendFolders(content, file.basename);

      if (suggestions && suggestions.length > 0) {
        const normalizePath = (p: string) => (p.startsWith('/') ? p.substring(1) : p);
        const suggestionsNorm = suggestions.map((s: any) => ({ ...s, folder: normalizePath(s.folder) }));
        const exists = (p: string) => !!plugin.app.vault.getAbstractFileByPath(p);
        const existing = suggestionsNorm.filter((s: any) => exists(s.folder));
        const pick = (arr: any[]) => arr.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
        const chosenL2 = (existing.length > 0) ? pick(existing) : pick(suggestionsNorm);
        const level2Folder = chosenL2.folder;

        addLog(`  选择二级目录: ${level2Folder}${existing.length > 0 ? '（已存在）' : '（新建）'}`);

        const l2FolderPath = level2Folder.startsWith('/') ? level2Folder.substring(1) : level2Folder;
        if (!plugin.app.vault.getAbstractFileByPath(l2FolderPath)) {
          await ensureNestedFolders(l2FolderPath);
          addLog(`  ✅ 创建二级目录: ${l2FolderPath}`);
        }

        // 暂时不移动文件，留到步骤4完成后统一移动
        return {
          success: true,
          updatedFile: file,
          data: {
            level2Folder: l2FolderPath,
            suggestions: suggestions
          }
        };
      } else {
        addLog('  ℹ️ 无文件夹推荐');
        return { success: true, updatedFile: file, data: { noChange: true } };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, [plugin, addLog, ensureNestedFolders]);

  // 步骤4: 三级目录分类
  const doLevel3Classification = React.useCallback(async (file: TFile): Promise<StepResult> => {
    try {
      // 获取步骤3的结果
      const step2Result = steps[2]?.result;
      if (!step2Result || step2Result.noChange) {
        addLog('  ℹ️ 步骤3未选择二级目录，跳过三级分类');
        return { success: true, updatedFile: file, data: { noChange: true } };
      }

      const level2Folder = step2Result.data.level2Folder;
      const content = await plugin.app.vault.read(file);
      const kbRoot = plugin.settings.knowledgeBaseRoot || '1.Area';
      const isUnderKB = level2Folder.startsWith(`${kbRoot}/`);

      if (!isUnderKB) {
        // 不在知识库根目录下，直接移动到二级目录
        const newPath = `${level2Folder}/${file.name}`;
        await plugin.app.fileManager.renameFile(file, newPath);
        const movedFile = plugin.app.vault.getAbstractFileByPath(newPath) as TFile;
        addLog(`  ✅ 已移动到: ${level2Folder}`);

        return {
          success: true,
          updatedFile: movedFile,
          data: { finalFolder: level2Folder }
        };
      }

      // 在知识库下，进行三级目录选择
      const roadmapName = plugin.settings.roadmapFolder || '01.Roadmap';
      const configured = (plugin.settings as any).level3Dirs && (plugin.settings as any).level3Dirs.length > 0
        ? (plugin.settings as any).level3Dirs.map((d: string) => d === '01.Roadmap' ? roadmapName : d)
        : [roadmapName, '02.What', '03.Why', '04.How', '05.Tool', '06.Resource'];
      const level3Dirs = Array.from(new Set(configured));

      const standardCandidates = level3Dirs.map(d => `${level2Folder}/${d}`);
      let level3Candidates = [...standardCandidates];

      // 是否包含已有的三级目录
      if ((plugin.settings as any).includeExistingLevel3Dirs) {
        try {
          const l2FolderAbs = plugin.app.vault.getAbstractFileByPath(level2Folder) as any;
          const existing = (l2FolderAbs && l2FolderAbs.children)
            ? l2FolderAbs.children.filter((c: any) => c && c.children).map((f: any) => f.path)
            : [];
          level3Candidates = Array.from(new Set([...level3Candidates, ...existing]));
        } catch { }
      }

      let finalFolder = level2Folder;

      // 急切创建标准三级目录
      if ((plugin.settings as any).eagerCreateLevel3Dirs) {
        for (const p of standardCandidates) {
          if (!plugin.app.vault.getAbstractFileByPath(p)) {
            await ensureNestedFolders(p);
            addLog(`  ✅ 创建三级目录: ${p}`);
          }
        }
      }

      // AI选择三级目录
      try {
        const cutoff = plugin.settings.contentCutoffChars || 1000;
        const trimmed = content.slice(0, cutoff);
        const hints = (plugin.settings as any).level3DirHints || {};
        const hintLines = level3Dirs
          .map(d => hints[d] ? `${d}: ${hints[d]}` : null)
          .filter(Boolean) as string[];
        const hintBlock = hintLines.length > 0 ? `\n目录含义：\n- ${hintLines.join('\n- ')}` : '';
        const customInstruction = `仅从提供的 folders 列表中选择最合适的一个三级目录（候选均为 ${level2Folder} 的直接子目录）。不要建议新路径，也不要返回二级目录。确保仅返回 1 个结果。${hintBlock}`;

        const l3Suggestions = await plugin.aiService.generateFolder({
          content: trimmed,
          fileName: file.basename,
          folders: level3Candidates,
          customInstructions: customInstruction,
          count: 1,
        });

        if (l3Suggestions && l3Suggestions.length > 0) {
          const chosenL3 = l3Suggestions.sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))[0];
          finalFolder = level3Candidates.includes(chosenL3.folder) ? chosenL3.folder : finalFolder;
          addLog(`  选择三级目录: ${finalFolder}`);
        } else {
          const fallbackName = (plugin.settings as any).fallbackLevel3Dir || '02.What';
          const fallbackPath = level3Candidates.find(p => p.endsWith(`/${fallbackName}`));
          if (fallbackPath) {
            finalFolder = fallbackPath;
            addLog(`  ℹ️ 三级目录推荐为空，回退到: ${finalFolder}`);
          } else {
            addLog('  ℹ️ 三级目录推荐为空，将落入二级目录');
          }
        }
      } catch (e: any) {
        addLog(`  ⚠️ 三级目录选择失败：${e.message}，将落入二级目录`);
      }

      // 懒创建最终目录
      if (!(plugin.settings as any).eagerCreateLevel3Dirs) {
        if (!plugin.app.vault.getAbstractFileByPath(finalFolder)) {
          await ensureNestedFolders(finalFolder);
          addLog(`  ✅ 创建最终三级目录: ${finalFolder}`);
        }
      }

      // 移动文件到最终目录
      const newPath = `${finalFolder}/${file.name}`;
      await plugin.app.fileManager.renameFile(file, newPath);
      const movedFile = plugin.app.vault.getAbstractFileByPath(newPath) as TFile;
      addLog(`  ✅ 已移动到: ${finalFolder}`);

      return {
        success: true,
        updatedFile: movedFile,
        data: {
          finalFolder,
          level3Candidates,
          suggestions: []
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, [plugin, addLog, steps, ensureNestedFolders]);

  // 步骤5: 生成元数据
  const doGenerateMetadata = React.useCallback(async (file: TFile): Promise<StepResult> => {
    try {
      const content = await plugin.app.vault.read(file);

      // 获取步骤4的最终路径
      const step3Result = steps[3]?.result;
      const targetFolder = step3Result?.data?.finalFolder || file.parent?.path || '';

      let metadata: any = null;

      if (plugin.settings.enableEnhancedMetadata && plugin.aiService.generateEnhancedMetadata) {
        metadata = await plugin.aiService.generateEnhancedMetadata({
          content,
          filename: file.basename,
          customPrompt: plugin.settings.enhancedMetadataPrompt
        });
        addLog(`  ✅ 元数据生成成功`);
      } else {
        addLog('  ℹ️ 元数据扩展功能未启用，使用基础字段');
        metadata = {};
      }

      // 从路径推导 cate/subcate
      const pathParts = targetFolder.split('/').filter(Boolean);
      const kbRoot = plugin.settings.knowledgeBaseRoot || '1.Area';
      const rootIdx = pathParts.indexOf(kbRoot);
      const cate = rootIdx >= 0 && pathParts.length > rootIdx + 1 ? pathParts[rootIdx + 1] : (pathParts[1] || '');
      const subcate = rootIdx >= 0 && pathParts.length > rootIdx + 2 ? pathParts[rootIdx + 2] : (pathParts[2] || '');
      metadata = { ...(metadata || {}), category: cate, subcategory: subcate };

      // 解析已有 frontmatter
      let existingCreate = '';
      let nextVersion = '1.0';
      if (content.startsWith('---')) {
        const endIndex = content.indexOf('---', 3);
        if (endIndex !== -1) {
          const yaml = content.substring(3, endIndex);
          const mCreate = yaml.match(/^[ \t]*create:\s*(.*)$/m);
          const mVersion = yaml.match(/^[ \t]*version:\s*"?(\d+(?:\.\d+)?)?"?/m);
          if (mCreate && mCreate[1]) existingCreate = mCreate[1].trim();
          if (mVersion && mVersion[1]) {
            const v = parseFloat(mVersion[1]);
            if (!Number.isNaN(v)) nextVersion = (Math.round((v + 0.1) * 10) / 10).toFixed(1);
          }
        }
      }

      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
      const id = `${ts}-${(metadata?.title || file.basename)}`;
      const createDate = existingCreate || now.toISOString().split('T')[0];
      const updateDate = now.toISOString().split('T')[0];

      const yamlFrontmatter = `---
id: "${id}"
title: "${metadata?.title || file.basename}"
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

      // 覆盖/添加 frontmatter
      let newContent = content;
      if (content.startsWith('---')) {
        const endIndex = content.indexOf('---', 3);
        if (endIndex !== -1) {
          newContent = yamlFrontmatter + content.substring(endIndex + 4);
        } else {
          newContent = yamlFrontmatter + content;
        }
      } else {
        newContent = yamlFrontmatter + content;
      }

      await plugin.app.vault.modify(file, newContent);
      addLog('  ✅ 元数据已应用');

      return {
        success: true,
        updatedFile: file,
        data: {
          metadata,
          cate,
          subcate,
          yamlPreview: yamlFrontmatter
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, [plugin, addLog, steps]);

  // 步骤6: Roadmap关联
  const doRoadmapLink = React.useCallback(async (file: TFile): Promise<StepResult> => {
    try {
      if (!plugin.settings.enableRoadmapLinking) {
        addLog('  ℹ️ Roadmap关联功能未启用');
        return { success: true, updatedFile: file, data: { disabled: true } };
      }

      const content = await plugin.app.vault.read(file);

      // 获取步骤4的结果
      const step3Result = steps[3]?.result;
      const step4Result = steps[4]?.result;

      let domainCate = '';

      // 优先从步骤4的metadata获取
      if (step4Result?.data?.cate) {
        domainCate = step4Result.data.cate;
      } else if (step3Result?.data?.finalFolder) {
        // 从路径推导
        const targetFolder = step3Result.data.finalFolder;
        const parts = targetFolder.split('/').filter(Boolean);
        const kbRoot = plugin.settings.knowledgeBaseRoot || '1.Area';
        const idx = parts.indexOf(kbRoot);
        domainCate = idx >= 0 && parts.length > idx + 1 ? parts[idx + 1] : (parts[1] || '');
      }

      // 回退：从文件YAML前言读取
      if (!domainCate) {
        if (content.startsWith('---')) {
          const endIndex = content.indexOf('---', 3);
          if (endIndex !== -1) {
            const yaml = content.substring(3, endIndex);
            const m = yaml.match(/^[ \t]*cate:\s*["']?(.*?)["']?\s*$/m);
            if (m && m[1]) domainCate = (m[1] || '').trim();
          }
        }
      }

      if (!domainCate) {
        addLog('  ℹ️ Roadmap未关联：无法确定 cate（领域分类）');
        return { success: true, updatedFile: file, data: { noCategory: true } };
      }

      // 获取二级目录作为 Roadmap 锚点
      const domainRootFolder = step3Result?.data?.finalFolder?.split('/').slice(0, 2).join('/') || file.parent?.path || '';
      const roadmapPath = `${domainRootFolder}/${plugin.settings.roadmapFolder || '01.Roadmap'}/Roadmap.md`;
      let roadmapFile = plugin.app.vault.getAbstractFileByPath(roadmapPath) as TFile;

      if (!roadmapFile) {
        addLog('  创建Roadmap文件...');
        await ensureNestedFolders(`${domainRootFolder}/${plugin.settings.roadmapFolder || '01.Roadmap'}`);

        try {
          const domain = domainCate || file.basename;
          const roadmapPrompt = plugin.settings.roadmapPrompt && plugin.settings.roadmapPrompt.trim().length > 0
            ? plugin.settings.roadmapPrompt
            : DEFAULT_ROADMAP_PROMPT;

          let finalRoadmapPrompt: string;
          if (roadmapPrompt.includes('${domain}')) {
            finalRoadmapPrompt = roadmapPrompt.replace(/\$\{domain\}/g, domain);
          } else {
            finalRoadmapPrompt = `${roadmapPrompt}\n\n领域: ${domain}`;
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

          if (!roadmapFile) {
            const header = `# ${domainCate} Roadmap\n\n`;
            roadmapFile = await plugin.app.vault.create(roadmapPath, header);
            addLog(`  ✅ 已创建: ${roadmapPath}`);
          }
        } catch (err: any) {
          addLog(`  ⚠️ Roadmap 生成失败: ${err.message}`);
          const header = `# ${domainCate} Roadmap\n\n`;
          roadmapFile = await plugin.app.vault.create(roadmapPath, header);
        }
      }

      // 添加链接到Roadmap
      try {
        const noteTitle = file.basename;
        const noteLink = `- [[${noteTitle}]]`;
        let roadmapText = await plugin.app.vault.read(roadmapFile);

        if (roadmapText.includes(`[[${noteTitle}]]`)) {
          addLog('  ℹ️ Roadmap 已存在该链接，跳过插入');
        } else if (plugin.aiService && (plugin.aiService as any).findRoadmapInsertPosition) {
          const insert = await (plugin.aiService as any).findRoadmapInsertPosition({
            roadmapContent: roadmapText,
            noteContent: content,
            noteTitle,
            notePath: file.path,
          });

          const lines = roadmapText.split('\n');
          let idx = Math.max(0, Math.min(lines.length, (insert?.lineNumber ?? (lines.length + 1)) - 1));

          if (insert?.prependLines && insert.prependLines.length > 0) {
            lines.splice(idx, 0, ...insert.prependLines);
            idx += insert.prependLines.length;
          }

          lines.splice(idx, 0, noteLink);
          roadmapText = lines.join('\n');
          await plugin.app.vault.modify(roadmapFile, roadmapText);
          addLog(`  ✅ 已在模块内插入 Roadmap 链接（行 ${idx + 1}）`);
        } else {
          const fallbackHeader = '## 🗂 未归类/待整理';
          if (!roadmapText.includes(fallbackHeader)) {
            roadmapText = `${roadmapText.trim()}\n\n${fallbackHeader}\n`;
          }
          roadmapText = `${roadmapText}\n${noteLink}`;
          await plugin.app.vault.modify(roadmapFile, roadmapText);
          addLog('  ✅ 已插入到"未归类/待整理"模块');
        }

        addLog(`  ✅ 已关联到Roadmap`);
      } catch (insertErr: any) {
        addLog(`  ⚠️ Roadmap 插入失败：${insertErr.message}`);
        await plugin.app.vault.append(roadmapFile, `\n- [[${file.basename}]]`);
      }

      return {
        success: true,
        updatedFile: file,
        data: {
          roadmapPath,
          linkedNote: file.basename
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, [plugin, addLog, steps, ensureNestedFolders]);

  // ============ 流程控制函数 ============

  // 执行单个步骤
  const executeStep = React.useCallback(async (stepIndex: number) => {
    const stepName = INITIAL_STEPS[stepIndex].name;
    updateStepStatus(stepIndex, 'running');
    addLog(`📝 步骤${stepIndex + 1}: ${stepName}`);

    try {
      let result: StepResult;

      switch (stepIndex) {
        case 0:
          result = await doRename(currentFile);
          break;
        case 1:
          result = await doFormatOptimize(currentFile);
          break;
        case 2:
          result = await doLevel2Classification(currentFile);
          break;
        case 3:
          result = await doLevel3Classification(currentFile);
          break;
        case 4:
          result = await doGenerateMetadata(currentFile);
          break;
        case 5:
          result = await doRoadmapLink(currentFile);
          break;
        default:
          throw new Error('未知步骤');
      }

      if (result.success) {
        // 更新文件引用
        if (result.updatedFile) {
          setCurrentFile(result.updatedFile);
          const newContent = await plugin.app.vault.read(result.updatedFile);
          setCurrentContent(newContent);
        }

        updateStepStatus(stepIndex, 'waiting_confirm');
        updateStepResult(stepIndex, result);
        setWorkflowStatus('paused');
        addLog(`✅ 步骤${stepIndex + 1}完成，等待确认`);
      } else {
        throw new Error(result.error || '未知错误');
      }
    } catch (error: any) {
      logger.error(`步骤${stepIndex + 1}失败:`, error);
      updateStepStatus(stepIndex, 'failed');
      updateStepResult(stepIndex, null, error.message);
      setWorkflowStatus('paused');
      addLog(`❌ 步骤${stepIndex + 1}失败: ${error.message}`);
    }
  }, [
    currentFile,
    doRename,
    doFormatOptimize,
    doLevel2Classification,
    doLevel3Classification,
    doGenerateMetadata,
    doRoadmapLink,
    updateStepStatus,
    updateStepResult,
    addLog,
    plugin
  ]);

  // 开始处理
  const handleStartProcess = React.useCallback(async () => {
    setWorkflowStatus('running');
    setCurrentStepIndex(0);
    setSteps(INITIAL_STEPS);
    setProcessingLog([]);
    addLog('▶️ 开始处理流程');
    await executeStep(0);
  }, [addLog, executeStep]);

  // 应用并继续
  const handleApply = React.useCallback(async () => {
    const stepIndex = currentStepIndex;
    updateStepStatus(stepIndex, 'completed');
    addLog(`✅ 已应用步骤${stepIndex + 1}`);
    addLog(`  当前文件: ${currentFile.basename}`);

    if (stepIndex < 5) {
      setCurrentStepIndex(stepIndex + 1);
      setWorkflowStatus('running');
      await executeStep(stepIndex + 1);
    } else {
      setWorkflowStatus('completed');
      addLog('🎉 全部流程完成！');
      new Notice('处理完成！');
    }
  }, [currentStepIndex, currentFile, updateStepStatus, addLog, executeStep]);

  // 重试当前步骤
  const handleRetry = React.useCallback(async (params?: any) => {
    if (params) {
      setCustomParams(prev => ({ ...prev, [currentStepIndex]: params }));
    }
    addLog(`🔄 重试步骤${currentStepIndex + 1}`);
    setWorkflowStatus('running');
    await executeStep(currentStepIndex);
  }, [currentStepIndex, addLog, executeStep]);

  // 重置流程
  const handleReset = React.useCallback(() => {
    setWorkflowStatus('idle');
    setCurrentStepIndex(0);
    setSteps(INITIAL_STEPS);
    setProcessingLog([]);
    setCurrentFile(initialFile);
    setCurrentContent(initialContent);
    setCustomParams({});
    addLog('🔄 流程已重置');
  }, [initialFile, initialContent, addLog]);

  // 取消流程
  const handleCancel = React.useCallback(() => {
    setWorkflowStatus('cancelled');
    addLog('❌ 流程已取消');
    new Notice('处理已取消');
  }, [addLog]);

  // 清空日志
  const handleClearLog = React.useCallback(() => {
    setProcessingLog([]);
  }, []);

  // ============ 渲染 ============

  return (
    <div className="process-workflow flex flex-col gap-4">
      {/* 头部控制区 */}
      <div className="workflow-header flex gap-3 items-center">
        <button
          onClick={handleStartProcess}
          disabled={workflowStatus === 'running'}
          className="fo-px-3 fo-py-1 fo-bg-[--interactive-accent] fo-text-[--text-on-accent] fo-rounded disabled:fo-opacity-50"
        >
          ▶️ 开始处理
        </button>
        <button
          onClick={handleReset}
          disabled={workflowStatus === 'running'}
          className="fo-px-3 fo-py-1 fo-bg-[--background-modifier-border] fo-text-[--text-normal] fo-rounded disabled:fo-opacity-50"
        >
          🔄 重置
        </button>
        {workflowStatus === 'running' && (
          <button
            onClick={handleCancel}
            className="fo-px-3 fo-py-1 fo-bg-red-500 fo-text-white fo-rounded"
          >
            × 取消
          </button>
        )}
      </div>

      {/* 进度区域 */}
      {workflowStatus !== 'idle' && (
        <div className="workflow-progress p-4 bg-[--background-secondary] rounded-lg">
          <div className="fo-mb-2 fo-text-sm fo-text-[--text-muted]">
            处理进度 ({steps.filter(s => s.status === 'completed').length}/6)
          </div>
          <div className="fo-space-y-1">
            {steps.map((step, idx) => (
              <div
                key={step.id}
                className={`fo-flex fo-items-center fo-gap-2 fo-text-sm ${
                  idx === currentStepIndex ? 'fo-font-bold' : ''
                }`}
              >
                <span>{step.icon}</span>
                <span>
                  {step.status === 'completed' && '✅'}
                  {step.status === 'running' && '⏳'}
                  {step.status === 'waiting_confirm' && '⏸️'}
                  {step.status === 'failed' && '❌'}
                  {step.status === 'pending' && '⏺️'}
                </span>
                <span>{step.name}</span>
                {idx === currentStepIndex && <span className="fo-text-[--text-accent]">← 当前步骤</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 当前步骤详情 */}
      {workflowStatus === 'paused' && steps[currentStepIndex]?.status === 'waiting_confirm' && (
        <>
          {currentStepIndex === 0 && (
            <RenameStepDetail
              stepNumber={1}
              stepName={steps[0].name}
              icon={steps[0].icon}
              result={steps[0].result}
              onApply={handleApply}
              onRetry={handleRetry}
            />
          )}
          {currentStepIndex === 1 && (
            <FormatStepDetail
              stepNumber={2}
              stepName={steps[1].name}
              icon={steps[1].icon}
              result={steps[1].result}
              onApply={handleApply}
              onRetry={handleRetry}
            />
          )}
          {currentStepIndex === 2 && (
            <Level2FolderStepDetail
              stepNumber={3}
              stepName={steps[2].name}
              icon={steps[2].icon}
              result={steps[2].result}
              onApply={handleApply}
              onRetry={handleRetry}
            />
          )}
          {currentStepIndex === 3 && (
            <Level3FolderStepDetail
              stepNumber={4}
              stepName={steps[3].name}
              icon={steps[3].icon}
              result={steps[3].result}
              onApply={handleApply}
              onRetry={handleRetry}
            />
          )}
          {currentStepIndex === 4 && (
            <MetadataStepDetail
              stepNumber={5}
              stepName={steps[4].name}
              icon={steps[4].icon}
              result={steps[4].result}
              onApply={handleApply}
              onRetry={handleRetry}
            />
          )}
          {currentStepIndex === 5 && (
            <RoadmapStepDetail
              stepNumber={6}
              stepName={steps[5].name}
              icon={steps[5].icon}
              result={steps[5].result}
              onApply={handleApply}
              onRetry={handleRetry}
            />
          )}
        </>
      )}

      {/* 处理日志 */}
      {processingLog.length > 0 && (
        <div className="processing-log">
          <div className="fo-flex fo-justify-between fo-items-center fo-mb-2">
            <h3 className="fo-font-semibold fo-text-[--text-normal]">📋 执行日志</h3>
            <button
              onClick={handleClearLog}
              className="fo-text-xs fo-text-[--text-muted] hover:fo-text-[--text-normal]"
            >
              清空
            </button>
          </div>
          <div className="fo-p-3 fo-bg-black fo-text-green-400 fo-rounded fo-font-mono fo-text-xs fo-h-48 fo-overflow-y-auto">
            {processingLog.map((log, index) => (
              <div key={index}>{log}</div>
            ))}
          </div>
        </div>
      )}

      {/* 完成状态 */}
      {workflowStatus === 'completed' && (
        <div className="fo-p-4 fo-bg-green-50 dark:fo-bg-green-950 fo-rounded-lg fo-border fo-border-green-200 dark:fo-border-green-800">
          <div className="fo-text-green-800 dark:fo-text-green-200 fo-font-semibold">
            🎉 处理完成！
          </div>
          <div className="fo-text-sm fo-text-green-700 dark:fo-text-green-300 fo-mt-1">
            文件已成功处理：{currentFile.basename}
          </div>
        </div>
      )}
    </div>
  );
};
