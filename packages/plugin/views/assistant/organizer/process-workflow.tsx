import * as React from "react";
import { TFile, Notice } from "obsidian";
import FileOrganizer from "../../../index";
import { DEFAULT_ROADMAP_PROMPT, DEFAULT_ROADMAP_INSERT_PROMPT, DEFAULT_OPTIMIZE_PROMPT, DEFAULT_RENAME_INSTRUCTIONS } from "../../../prompts";
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

  // Keep latest steps in a ref to avoid stale closures across step confirmations
  const stepsRef = React.useRef<ProcessStep[]>(steps);
  React.useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);
  // Keep the last explicitly confirmed Level-2 folder for step 4
  const lastChosenLevel2Ref = React.useRef<string | null>(null);
  const lastChosenLevel3Ref = React.useRef<string | null>(null);

  // 日志工具
  const addLog = React.useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setProcessingLog(prev => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  // 更新步骤状态
  const updateStepStatus = React.useCallback((stepIndex: number, status: StepStatus) => {
      setSteps(prev => {
        const next = prev.map((step, idx) => (
          idx === stepIndex ? { ...step, status } : step
        ));
        stepsRef.current = next;
        return next;
      });
    }, []);

  // 更新步骤结果
  const updateStepResult = React.useCallback((stepIndex: number, result: any, error?: string) => {
      setSteps(prev => {
        const next = prev.map((step, idx) => (
          idx === stepIndex ? { ...step, result, error } : step
        ));
        stepsRef.current = next;
        return next;
      });
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
  const doRename = React.useCallback(async (file: TFile, promptOverride?: string): Promise<StepResult> => {
    try {
      const content = await plugin.app.vault.read(file);
      // allow override prompt for rename via promptOverride or customParams[0]?.prompt
      const renamePrompt = promptOverride ?? customParams[0]?.prompt ?? undefined;
  // (temporary debug logs removed)
      const suggestions = await plugin.recommendName(content, file.basename, renamePrompt);

      if (suggestions && suggestions.length > 0) {
        const newName = suggestions[0].title;
        // Defer renaming to user confirmation in handleApply (step 1)
        return {
          success: true,
          updatedFile: file,
          data: {
            oldName: file.basename,
            newName: newName,
            suggestions: suggestions
          }
        };
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
  }, [plugin, addLog, customParams]);

  // 步骤2: 内容格式优化
  const doFormatOptimize = React.useCallback(async (file: TFile, promptOverride?: string): Promise<StepResult> => {
    try {
      const content = await plugin.app.vault.read(file);
  const prompt = (promptOverride ?? customParams[1]?.prompt) ||
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
            // preview/fullContent removed (preview UI deprecated)
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
  const doLevel2Classification = React.useCallback(async (file: TFile, promptOverride?: string): Promise<StepResult> => {
    try {
      const content = await plugin.app.vault.read(file);
      // allow override prompt for level2 via promptOverride or customParams[2]?.prompt
      const level2Prompt = promptOverride ?? customParams[2]?.prompt ?? undefined;
      const suggestions = await plugin.recommendFolders(content, file.basename, level2Prompt);

      if (suggestions && suggestions.length > 0) {
        const normalizePath = (p: string) => (p.startsWith('/') ? p.substring(1) : p);
        const suggestionsNorm = suggestions.map((s: any) => ({ ...s, folder: normalizePath(s.folder) }));

        // 标记已存在的文件夹
        const exists = (p: string) => !!plugin.app.vault.getAbstractFileByPath(p);
        const withExistence = suggestionsNorm.map((s: any) => ({
          ...s,
          exists: exists(s.folder)
        }));

        // 默认选择评分最高的
        const sorted = [...withExistence].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        const defaultChoice = sorted[0];

        addLog(`  生成 ${suggestions.length} 个二级目录建议`);
        addLog(`  默认推荐: ${defaultChoice.folder}`);

        // 不在这里创建文件夹，等用户确认后再创建
        // 返回所有建议供用户选择
        return {
          success: true,
          updatedFile: file,
          data: {
            level2Folder: defaultChoice.folder,  // 默认选择
            suggestions: withExistence,  // 所有建议
            defaultChoice: defaultChoice.folder
          }
        };
      } else {
        addLog('  ℹ️ 无文件夹推荐');
        return { success: true, updatedFile: file, data: { noChange: true } };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, [plugin, addLog, customParams]);

  // 步骤4: 三级目录分类
  const doLevel3Classification = React.useCallback(async (file: TFile, promptOverride?: string): Promise<StepResult> => {
    try {
      const step2Result = stepsRef.current[2]?.result;
      const __chosenL2 = (lastChosenLevel2Ref.current || (step2Result && step2Result.data && step2Result.data.level2Folder)) as string | undefined;
      if (!step2Result || step2Result.noChange) {
        addLog('  ℹ️ 步骤3未选择二级目录，跳过三级分类');
        return { success: true, updatedFile: file, data: { noChange: true } };
      }

      const level2Folder = __chosenL2 || step2Result.data.level2Folder;
      const content = await plugin.app.vault.read(file);
      const kbRoot = plugin.settings.knowledgeBaseRoot || '1.Area';
      const isUnderKB = level2Folder.startsWith(`${kbRoot}/`);

      const roadmapName = plugin.settings.roadmapFolder || '01.Roadmap';
      const configured = (plugin.settings as any).level3Dirs && (plugin.settings as any).level3Dirs.length > 0
        ? (plugin.settings as any).level3Dirs.map((d: string) => d === '01.Roadmap' ? roadmapName : d)
        : [roadmapName, '02.What', '03.Why', '04.How', '05.Tool', '06.Resource'];
      const level3Dirs = Array.from(new Set(configured));

      const standardCandidates = level3Dirs.map(d => `${level2Folder}/${d}`);
      let level3Candidates = [...standardCandidates];

      if ((plugin.settings as any).includeExistingLevel3Dirs) {
        try {
          const l2FolderAbs = plugin.app.vault.getAbstractFileByPath(level2Folder) as any;
          const existing = (l2FolderAbs && l2FolderAbs.children)
            ? l2FolderAbs.children.filter((c: any) => c && c.children).map((f: any) => f.path)
            : [];
          level3Candidates = Array.from(new Set([...level3Candidates, ...existing]));
        } catch { }
      }

      const settingsPromptRaw = (plugin.settings as any).level3CustomInstructions;
      const settingsPrompt = typeof settingsPromptRaw === 'string' ? settingsPromptRaw : '';
      const storedPrompt = typeof customParams[3]?.prompt === 'string' ? customParams[3].prompt : '';
      const overridePromptValue = typeof promptOverride === 'string' ? promptOverride : '';
      const promptCandidate = [overridePromptValue, storedPrompt, settingsPrompt].find(
        (p) => typeof p === 'string' && p.trim().length > 0
      );
      const promptUsed = promptCandidate ? promptCandidate.trim() : '';

      const hints = (plugin.settings as any).level3DirHints || {};
      const hintLines = level3Dirs
        .map(d => hints[d] ? `${d}: ${hints[d]}` : null)
        .filter(Boolean) as string[];
      const hintBlock = hintLines.length > 0 ? `
提示：
- ${hintLines.join('\n- ')}` : '';
      const defaultInstruction = `仅从 folders 提供的路径中（均为 ${level2Folder} 的直接子目录）选择最合适的一个第三级目录，不要提出新的路径，也不要返回二级目录。确保只返回 1 个结果。${hintBlock}`;
      const instructionToUse = promptUsed.length > 0 ? promptUsed : defaultInstruction;

      if (!isUnderKB) {
        const newPath = `${level2Folder}/${file.name}`;
        await plugin.app.fileManager.renameFile(file, newPath);
        const movedFile = plugin.app.vault.getAbstractFileByPath(newPath) as TFile;
        addLog(`  ✅ 已移动到: ${level2Folder}`);
        lastChosenLevel3Ref.current = level2Folder;

        return {
          success: true,
          updatedFile: movedFile,
          data: {
            finalFolder: level2Folder,
            level3Candidates,
            suggestions: [],
            promptUsed: instructionToUse,
            systemDefaultPrompt: defaultInstruction,
            settingsPrompt
          }
        };
      }

      let finalFolder = level2Folder;
      let structuredSuggestions: any[] = [];

      if ((plugin.settings as any).eagerCreateLevel3Dirs) {
        for (const p of standardCandidates) {
          if (!plugin.app.vault.getAbstractFileByPath(p)) {
            await ensureNestedFolders(p);
            addLog(`  ✅ 创建三级目录: ${p}`);
          }
        }
      }

      try {
        const cutoff = plugin.settings.contentCutoffChars || 1000;
        const trimmed = content.slice(0, cutoff);
        const suggestionCount = Math.max(1, Math.min(6, level3Candidates.length || 1));
        const l3Suggestions = await plugin.aiService.generateFolder({
          content: trimmed,
          fileName: file.basename,
          folders: level3Candidates,
          customInstructions: instructionToUse,
          count: suggestionCount,
        });

        if (Array.isArray(l3Suggestions) && l3Suggestions.length > 0) {
          structuredSuggestions = [...l3Suggestions].sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0));
          const chosenL3 = structuredSuggestions[0];
          const candidateFolder = chosenL3?.folder;
          if (candidateFolder && level3Candidates.includes(candidateFolder)) {
            finalFolder = candidateFolder;
          }
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

      if (structuredSuggestions.length === 0) {
        const exists = (candidate: string) => !!plugin.app.vault.getAbstractFileByPath(candidate);
        structuredSuggestions = level3Candidates.map(folder => ({
          folder,
          score: finalFolder === folder ? 1 : 0,
          exists: exists(folder),
          reason: undefined,
          isNewFolder: false
        }));
      } else {
        structuredSuggestions = structuredSuggestions.map((item: any) => ({
          ...item,
          exists: !!plugin.app.vault.getAbstractFileByPath(item.folder)
        }));
      }

      if (!(plugin.settings as any).eagerCreateLevel3Dirs) {
        if (!plugin.app.vault.getAbstractFileByPath(finalFolder)) {
          await ensureNestedFolders(finalFolder);
          addLog(`  ✅ 创建最终三级目录: ${finalFolder}`);
        }
      }

      const newPath = `${finalFolder}/${file.name}`;
      await plugin.app.fileManager.renameFile(file, newPath);
      const movedFile = plugin.app.vault.getAbstractFileByPath(newPath) as TFile;
      addLog(`  ✅ 已移动到: ${finalFolder}`);
      lastChosenLevel3Ref.current = finalFolder;

      return {
        success: true,
        updatedFile: movedFile,
        data: {
          finalFolder,
          level3Candidates,
          suggestions: structuredSuggestions,
          promptUsed: instructionToUse,
          systemDefaultPrompt: defaultInstruction,
          settingsPrompt
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, [plugin, addLog, ensureNestedFolders, customParams]);

// 步骤5: 生成元数据
  const doGenerateMetadata = React.useCallback(async (file: TFile, promptOverride?: string): Promise<StepResult> => {
    try {
      const content = await plugin.app.vault.read(file);

      // 获取步骤4的最终路径
      const step3Result = stepsRef.current[3]?.result;
      const targetFolder = step3Result?.data?.finalFolder || file.parent?.path || '';

      let metadata: any = null;

      if (plugin.settings.enableEnhancedMetadata && plugin.aiService.generateEnhancedMetadata) {
        const metadataPrompt = promptOverride ?? customParams[4]?.prompt ?? plugin.settings.enhancedMetadataPrompt;
        metadata = await plugin.aiService.generateEnhancedMetadata({
          content,
          filename: file.basename,
          customPrompt: metadataPrompt
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
          // yamlPreview removed (preview UI deprecated)
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, [plugin, addLog, customParams]);

  // 步骤6: Roadmap关联
  const doRoadmapLink = React.useCallback(async (file: TFile, generatePrompt?: string, insertPrompt?: string): Promise<StepResult> => {
    try {
      if (!plugin.settings.enableRoadmapLinking) {
        addLog('  ℹ️ Roadmap关联功能未启用');
        return { success: true, updatedFile: file, data: { disabled: true } };
      }

      const content = await plugin.app.vault.read(file);

      // 获取步骤4的结果
      const step3Result = stepsRef.current[3]?.result;
      const step4Result = stepsRef.current[4]?.result;

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
          // 优先使用函数参数的generatePrompt，否则使用settings中的roadmapPrompt，最后使用默认值
          const basePrompt = generatePrompt && generatePrompt.trim().length > 0
            ? generatePrompt
            : (plugin.settings.roadmapPrompt && plugin.settings.roadmapPrompt.trim().length > 0
              ? plugin.settings.roadmapPrompt
              : DEFAULT_ROADMAP_PROMPT);

          let finalRoadmapPrompt: string;
          if (basePrompt.includes('${domain}')) {
            finalRoadmapPrompt = basePrompt.replace(/\$\{domain\}/g, domain);
          } else {
            finalRoadmapPrompt = `${basePrompt}

领域: ${domain}`;
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
            const header = `# ${domainCate} Roadmap

`;
            roadmapFile = await plugin.app.vault.create(roadmapPath, header);
            addLog(`  ✅ 已创建: ${roadmapPath}`);
          }
        } catch (err: any) {
          addLog(`  ⚠️ Roadmap 生成失败: ${err.message}`);
          const header = `# ${domainCate} Roadmap

`;
          roadmapFile = await plugin.app.vault.create(roadmapPath, header);
        }
      }

      // 添加链接到Roadmap
      try {
        const noteTitle = file.basename;
        const noteLink = `  [[${noteTitle}]]`;
        let roadmapText = await plugin.app.vault.read(roadmapFile);

        if (roadmapText.includes(`[[${noteTitle}]]`)) {
          addLog('  ℹ️ Roadmap 已存在该链接，跳过插入');
        } else if (plugin.aiService && (plugin.aiService as any).findRoadmapInsertPosition) {
          // 优先使用函数参数的insertPrompt，否则使用settings中的roadmapInsertPrompt，最后使用默认值
          const finalInsertPrompt = insertPrompt && insertPrompt.trim().length > 0
            ? insertPrompt
            : ((plugin.settings as any).roadmapInsertPrompt && (plugin.settings as any).roadmapInsertPrompt.trim().length > 0
              ? (plugin.settings as any).roadmapInsertPrompt
              : DEFAULT_ROADMAP_INSERT_PROMPT);

          const insert = await (plugin.aiService as any).findRoadmapInsertPosition({
            roadmapContent: roadmapText,
            noteContent: content,
            noteTitle,
            notePath: file.path,
            customPrompt: finalInsertPrompt,
          });

          // 显示错误和警告信息
          if (insert?.error) {
            addLog(`  ❌ AI选择错误: ${insert.error}`);
          }
          if (insert?.warning) {
            addLog(`  ⚠️ 警告: ${insert.warning}`);
          }

          // 添加调试日志：显示AI选择的位置和理由
          addLog(`  📍 AI选择位置: ${insert.section || '未知'}`);
          addLog(`  💭 选择理由: ${insert.reasoning || '无'}`);
          if (insert?.prependLines && insert.prependLines.length > 0) {
            addLog(`  ✨ 将创建新结构: ${insert.prependLines.join(' → ')}`);
          }
          addLog(`  📝 插入行号: ${insert?.lineNumber || '未知'}`);

          const lines = roadmapText.split('\n');
          let idx = Math.max(0, Math.min(lines.length, (insert?.lineNumber ?? (lines.length + 1)) - 1));

          if (insert?.prependLines && insert.prependLines.length > 0) {
            lines.splice(idx, 0, ...insert.prependLines);
            idx += insert.prependLines.length;
          }

          lines.splice(idx, 0, noteLink);
          roadmapText = lines.join('\n');
          await plugin.app.vault.modify(roadmapFile, roadmapText);
          addLog(`  ✅ 已在知识点下成功插入链接（行 ${idx + 1}）`);
        } else {
          // 改进的Fallback逻辑：使用结构化方式
          const fallbackHeader = '## 🗂 未归类/待整理';
          const moduleHeader = `#### 1.[${noteTitle}]`;
          const knowledgePoint = `- 知识点：${noteTitle}`;

          if (!roadmapText.includes(fallbackHeader)) {
            roadmapText = `${roadmapText.trim()}

${fallbackHeader}
`;
          }

          // 在未归类区域内创建结构化内容（模块 → 知识点 → 链接）
          roadmapText = `${roadmapText.trim()}
${moduleHeader}
${knowledgePoint}
${noteLink}
`;
          await plugin.app.vault.modify(roadmapFile, roadmapText);
          addLog('  ✅ 已插入到"未归类/待整理"模块（结构化）');
        }

        addLog(`  ✅ 已关联到Roadmap`);
      } catch (insertErr: any) {
        addLog(`  ⚠️ Roadmap 插入失败：${insertErr.message}`);
        await plugin.app.vault.append(roadmapFile, `
  [[${file.basename}]]`);
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
  }, [plugin, addLog, ensureNestedFolders]);

  // ============ 流程控制函数 ============

  // 执行单个步骤
  const executeStep = React.useCallback(async (stepIndex: number, overrides?: any) => {
    const stepName = INITIAL_STEPS[stepIndex].name;
    updateStepStatus(stepIndex, 'running');
    addLog(`📝 步骤${stepIndex + 1}: ${stepName}`);
  // (temporary debug logs removed)

    try {
      let result: StepResult;

      switch (stepIndex) {
        case 0:
          result = await doRename(currentFile, overrides?.prompt);
          // Augment rename result with prompt info for UI initialization (like step 1)
          try {
            const __raw0 = (customParams[0]?.prompt ?? (plugin.settings as any).renameInstructions ?? DEFAULT_RENAME_INSTRUCTIONS);
            const __used0 = (typeof __raw0 === 'string' ? __raw0.trim() : '') || DEFAULT_RENAME_INSTRUCTIONS;
            result = {
              ...result,
              data: {
                ...(result as any).data,
                promptUsed: __used0,
                systemDefaultPrompt: DEFAULT_RENAME_INSTRUCTIONS,
                settingsPrompt: (plugin.settings as any).renameInstructions || ''
              }
            } as StepResult;
          } catch (e) {
            // ignore augmentation errors, keep original result
          }
          break;
        case 1: {
          // Ensure there is always a non-empty default prompt for optimize step
          if (!((plugin.settings as any).optimizePrompt && (plugin.settings as any).optimizePrompt.trim())) {
            (plugin.settings as any).optimizePrompt = DEFAULT_OPTIMIZE_PROMPT;
          }
          result = await doFormatOptimize(currentFile, overrides?.prompt);
          // Augment result with prompt info for UI initialization
          const __raw = (overrides?.prompt ?? customParams[1]?.prompt ?? (plugin.settings as any).optimizePrompt ?? DEFAULT_OPTIMIZE_PROMPT);
          const __used = (typeof __raw === 'string' ? __raw.trim() : '') || DEFAULT_OPTIMIZE_PROMPT;
          result = {
            ...result,
            data: {
              ...(result as any).data,
              promptUsed: __used,
              systemDefaultPrompt: DEFAULT_OPTIMIZE_PROMPT,
              settingsPrompt: (plugin.settings as any).optimizePrompt || ''
            }
          } as StepResult;
          break;
        }
        case 2:
          result = await doLevel2Classification(currentFile, overrides?.prompt);
          // Augment result with prompt info for UI initialization
          try {
            const __raw2 = (overrides?.prompt ?? customParams[2]?.prompt ?? (plugin.settings as any).customFolderInstructions ?? '');
            const __used2 = (typeof __raw2 === 'string' ? __raw2.trim() : '') || '';
            result = {
              ...result,
              data: {
                ...(result as any).data,
                promptUsed: __used2,
                settingsPrompt: (plugin.settings as any).customFolderInstructions || ''
              }
            } as StepResult;
          } catch (e) {
            // ignore
          }
          break;
          break;
        case 3:
          result = await doLevel3Classification(currentFile, overrides?.prompt);
          try {
            const __raw3 = (overrides?.prompt ?? customParams[3]?.prompt ?? (plugin.settings as any).level3CustomInstructions ?? '');
            const __used3 = (typeof __raw3 === 'string' ? __raw3.trim() : '') || '';
            result = {
              ...result,
              data: {
                ...(result as any).data,
                promptUsed: (result as any).data?.promptUsed ?? __used3,
                settingsPrompt: (plugin.settings as any).level3CustomInstructions || ''
              }
            } as StepResult;
          } catch {
            // ignore prompt augmentation failure
          }
          break;
        case 4: {
          result = await doGenerateMetadata(currentFile, overrides?.prompt);
          // Augment result with prompt info for UI initialization
          const __raw4 = (overrides?.prompt ?? customParams[4]?.prompt ?? (plugin.settings as any).enhancedMetadataPrompt ?? '');
          const __used4 = (typeof __raw4 === 'string' ? __raw4.trim() : '') || '';
          result = {
            ...result,
            data: {
              ...(result as any).data,
              promptUsed: __used4,
              settingsPrompt: (plugin.settings as any).enhancedMetadataPrompt || ''
            }
          } as StepResult;
          break;
        }
        case 5: {
          const __rawGenerate = (overrides?.generatePrompt ?? customParams[5]?.generatePrompt ?? (plugin.settings as any).roadmapPrompt ?? '');
          const __usedGenerate = (typeof __rawGenerate === 'string' ? __rawGenerate.trim() : '') || '';

          const __rawInsert = (overrides?.insertPrompt ?? customParams[5]?.insertPrompt ?? (plugin.settings as any).roadmapInsertPrompt ?? DEFAULT_ROADMAP_INSERT_PROMPT);
          const __usedInsert = (typeof __rawInsert === 'string' ? __rawInsert.trim() : '') || DEFAULT_ROADMAP_INSERT_PROMPT;

          result = await doRoadmapLink(currentFile, __usedGenerate, __usedInsert);
          // Augment result with prompt info for UI initialization
          result = {
            ...result,
            data: {
              ...(result as any).data,
              generatePromptUsed: __usedGenerate,
              insertPromptUsed: __usedInsert,
              settingsPrompt: (plugin.settings as any).roadmapPrompt || '',
              settingsInsertPrompt: (plugin.settings as any).roadmapInsertPrompt || DEFAULT_ROADMAP_INSERT_PROMPT
            }
          } as StepResult;
          break;
        }
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
    // 确保以父组件当前激活的笔记为起点（避免使用挂载时的 stale state）
    setCurrentFile(initialFile);
    setCurrentContent(initialContent);

    setWorkflowStatus('running');
    setCurrentStepIndex(0);
    setSteps(INITIAL_STEPS);
    setProcessingLog([]);
    addLog('▶️ 开始处理流程');
    await executeStep(0);
  }, [addLog, executeStep, initialFile, initialContent]);

  // 在空闲状态下，跟随父组件传入的最新文件与内容，保持与激活 tab 同步
  React.useEffect(() => {
    if (workflowStatus === 'idle') {
      setCurrentFile(initialFile);
      setCurrentContent(initialContent);
    }
  }, [initialFile, initialContent, workflowStatus]);

  // 应用并继续
  const handleApply = React.useCallback(async (userChoice?: any) => {
    const stepIndex = currentStepIndex;

    // Step 1: Rename — apply selected name on confirm
    if (stepIndex === 0) {
      try {
        const data = steps[0]?.result?.data || {};
        const chosen = (userChoice?.selectedName ?? data?.newName ?? '').trim();
        const currentName = currentFile.basename;
        if (chosen && chosen !== currentName) {
          const parentPath = currentFile.parent?.path || '';
          const newPath = parentPath ? `${parentPath}/${chosen}.md` : `${chosen}.md`;
          await plugin.app.fileManager.renameFile(currentFile, newPath);
          const newFile = plugin.app.vault.getAbstractFileByPath(newPath) as TFile;
          if (newFile) {
            setCurrentFile(newFile);
            const newContent = await plugin.app.vault.read(newFile);
            setCurrentContent(newContent);
            addLog(`  ✅ 应用文件名: ${chosen}`);
            updateStepResult(0, {
              ...(steps[0].result || { success: true }),
              updatedFile: newFile,
              data: {
                ...(data || {}),
                newName: chosen,
                oldName: currentName,
                userSelected: !!userChoice?.selectedName && userChoice?.selectedName !== data?.newName
              }
            });
          }
        }
      } catch (e: any) {
        addLog(`  ❗重命名失败: ${e.message}`);
        new Notice(`重命名失败: ${e.message}`);
        return;
      }
    }

    // 如果是步骤3（二级目录分类）且用户做了选择，需要创建文件夹并更新结果
    if (stepIndex === 2 && userChoice?.selectedFolder) {
      const selectedFolder = userChoice.selectedFolder;
      addLog(`✅ 用户选择二级目录: ${selectedFolder}`);

      try {
        // 创建文件夹（如果不存在）
        if (!plugin.app.vault.getAbstractFileByPath(selectedFolder)) {
          await ensureNestedFolders(selectedFolder);
          addLog(`  ✅ 创建二级目录: ${selectedFolder}`);
        }

        // 更新步骤结果，保存用户选择
        lastChosenLevel2Ref.current = selectedFolder;
        updateStepResult(stepIndex, { ...steps[stepIndex].result, data: { ...steps[stepIndex].result?.data, level2Folder: selectedFolder, userSelected: true } });
        // 如果用户同时提供了 prompt，则持久化为默认二级目录提示
        if (userChoice?.prompt && typeof userChoice.prompt === 'string') {
          const p = (userChoice.prompt as string).trim();
          if (p.length > 0) {
            try {
              (plugin.settings as any).customFolderInstructions = p;
              await (plugin as any).saveSettings?.();
              addLog('  Level2 prompt saved as global default (applied)');
              new Notice('Level2 prompt saved as default');
            } catch (e: any) {
              addLog(`  Failed to save level2 prompt: ${e?.message || e}`);
            }
          }
        }
      } catch (error: any) {
        addLog(`  ❌ 创建目录失败: ${error.message}`);
        new Notice(`创建目录失败: ${error.message}`);
        return;
      }
    }

    if (stepIndex === 3 && userChoice?.selectedFolder) {
      const selectedFolder = (userChoice.selectedFolder as string).trim();
      const trimmedPrompt = typeof userChoice?.prompt === 'string' ? (userChoice.prompt as string).trim() : '';
      if (!selectedFolder) {
        new Notice('⚠️ 请选择有效的三级目录路径');
        return;
      }
      addLog(`✅ 用户选择三级目录: ${selectedFolder}`);

      try {
        if (!plugin.app.vault.getAbstractFileByPath(selectedFolder)) {
          await ensureNestedFolders(selectedFolder);
          addLog(`  ✅ 创建三级目录: ${selectedFolder}`);
        }

        const targetPath = `${selectedFolder}/${currentFile.name}`;
        if (currentFile.path !== targetPath) {
          await plugin.app.fileManager.renameFile(currentFile, targetPath);
          const movedFile = plugin.app.vault.getAbstractFileByPath(targetPath) as TFile;
          if (movedFile) {
            setCurrentFile(movedFile);
            const newContent = await plugin.app.vault.read(movedFile);
            setCurrentContent(newContent);
          }
          addLog(`  ✅ 文件移动至: ${selectedFolder}`);
        }

        lastChosenLevel3Ref.current = selectedFolder;

        const prevResult = steps[stepIndex].result || { success: true };
        updateStepResult(stepIndex, {
          ...prevResult,
          updatedFile: plugin.app.vault.getAbstractFileByPath(targetPath) as TFile,
          data: {
            ...(prevResult.data || {}),
            finalFolder: selectedFolder,
            userSelected: true,
            ...(trimmedPrompt ? { promptUsed: trimmedPrompt } : {})
          }
        });

        if (trimmedPrompt.length > 0) {
          try {
            (plugin.settings as any).level3CustomInstructions = trimmedPrompt;
            await (plugin as any).saveSettings?.();
            addLog('  Level3 prompt saved as global default (applied)');
          } catch (e: any) {
            addLog(`  Failed to save level3 prompt: ${e?.message || e}`);
          }
        }
      } catch (error: any) {
        addLog(`  ❌ 处理三级目录失败: ${error.message}`);
        new Notice(`处理三级目录失败: ${error.message}`);
        return;
      }
    }

    updateStepStatus(stepIndex, 'completed');
    addLog(`✅ 已应用步骤${stepIndex + 1}`);
    const __nameForLog = stepIndex === 0
      ? ((userChoice?.selectedName ?? steps[0]?.result?.data?.newName) || currentFile.basename)
      : currentFile.basename;
    addLog(`  当前文件: ${__nameForLog}`);

    if (stepIndex < 5) {
      setCurrentStepIndex(stepIndex + 1);
      setWorkflowStatus('running');
      await executeStep(stepIndex + 1);
    } else {
      setWorkflowStatus('completed');
      addLog('🎉 全部流程完成！');
      new Notice('处理完成！');
    }
  }, [currentStepIndex, currentFile, updateStepStatus, addLog, executeStep, steps, plugin, ensureNestedFolders, updateStepResult]);

  // 重试当前步骤
  const handleRetry = React.useCallback(async (params?: any) => {
    if (params) {
  // (temporary debug logs removed)
      let normalized = params;
      if (currentStepIndex === 1 && typeof (params as any).prompt === 'string') {
        const trimmed = ((params as any).prompt as string).trim();
        normalized = trimmed.length > 0 ? { prompt: trimmed } : {};
        // Persist optimize prompt as global default when retrying step 2
        if (trimmed.length > 0) {
          try {
            (plugin.settings as any).optimizePrompt = trimmed;
            await (plugin as any).saveSettings?.();
            addLog('  Optimize prompt saved as global default.');
            new Notice('Optimize prompt saved as default');
          } catch (e: any) {
            addLog(`  Failed to save optimize prompt: ${e?.message || e}`);
            new Notice(`Failed to save default prompt: ${e?.message || e}`);
          }
        }
      }
  // Support custom prompt for rename (step 0)
  if (currentStepIndex === 0 && typeof (params as any).prompt === 'string') {
        const trimmed0 = ((params as any).prompt as string).trim();
  // (temporary debug logs removed)
        if (trimmed0.length === 0) {
          new Notice('Prompt cannot be empty');
          return;
        }
        normalized = { prompt: trimmed0 };
        // Persist rename prompt as global default (renameInstructions)
        try {
          (plugin.settings as any).renameInstructions = trimmed0;
          await (plugin as any).saveSettings?.();
          addLog('  Rename prompt saved as global default.');
          new Notice('Rename prompt saved as default');
        } catch (e: any) {
          addLog(`  Failed to save rename prompt: ${e?.message || e}`);
          new Notice(`Failed to save rename default prompt: ${e?.message || e}`);
        }
        addLog('  用户为重命名步骤提供了自定义 prompt');
      }
      // Support custom prompt for level2 classification (step 2)
      if (currentStepIndex === 2 && typeof (params as any).prompt === 'string') {
        const trimmed2 = ((params as any).prompt as string).trim();
        if (trimmed2.length === 0) {
          new Notice('Prompt cannot be empty');
          return;
        }
        // Persist as customFolderInstructions in settings
        try {
          (plugin.settings as any).customFolderInstructions = trimmed2;
          await (plugin as any).saveSettings?.();
          addLog('  Level2 prompt saved as global default.');
          new Notice('Level2 prompt saved as default');
        } catch (e: any) {
          addLog(`  Failed to save level2 prompt: ${e?.message || e}`);
          new Notice(`Failed to save default prompt: ${e?.message || e}`);
        }
        addLog('  用户为二级目录分类步骤提供了自定义 prompt');
      }
      if (currentStepIndex === 3 && typeof (params as any).prompt === 'string') {
        const trimmed3 = ((params as any).prompt as string).trim();
        normalized = trimmed3.length > 0 ? { prompt: trimmed3 } : {};
        if (trimmed3.length > 0) {
          try {
            (plugin.settings as any).level3CustomInstructions = trimmed3;
            await (plugin as any).saveSettings?.();
            addLog('  Level3 prompt saved as global default.');
            new Notice('Level3 prompt saved as default');
          } catch (e: any) {
            addLog(`  Failed to save level3 prompt: ${e?.message || e}`);
            new Notice(`Failed to save default prompt: ${e?.message || e}`);
          }
        }
      }
      // Support custom prompt for metadata generation (step 4)
      if (currentStepIndex === 4 && typeof (params as any).prompt === 'string') {
        const trimmed4 = ((params as any).prompt as string).trim();
        normalized = trimmed4.length > 0 ? { prompt: trimmed4 } : {};
        if (trimmed4.length > 0) {
          try {
            (plugin.settings as any).enhancedMetadataPrompt = trimmed4;
            await (plugin as any).saveSettings?.();
            addLog('  Metadata prompt saved as global default.');
            new Notice('Metadata prompt saved as default');
          } catch (e: any) {
            addLog(`  Failed to save metadata prompt: ${e?.message || e}`);
            new Notice(`Failed to save default prompt: ${e?.message || e}`);
          }
        }
      }
      // Support custom prompts for roadmap linking (step 5)
      if (currentStepIndex === 5) {
        const generatePromptVal = typeof (params as any).generatePrompt === 'string' ? ((params as any).generatePrompt as string).trim() : '';
        const insertPromptVal = typeof (params as any).insertPrompt === 'string' ? ((params as any).insertPrompt as string).trim() : '';

        normalized = {};
        if (generatePromptVal.length > 0) {
          normalized.generatePrompt = generatePromptVal;
        }
        if (insertPromptVal.length > 0) {
          normalized.insertPrompt = insertPromptVal;
        }

        // Save to settings
        if (generatePromptVal.length > 0) {
          try {
            (plugin.settings as any).roadmapPrompt = generatePromptVal;
            await (plugin as any).saveSettings?.();
            addLog('  Roadmap generate prompt saved as global default.');
            new Notice('Roadmap generate prompt saved as default');
          } catch (e: any) {
            addLog(`  Failed to save roadmap generate prompt: ${e?.message || e}`);
            new Notice(`Failed to save generate prompt: ${e?.message || e}`);
          }
        }

        if (insertPromptVal.length > 0) {
          try {
            (plugin.settings as any).roadmapInsertPrompt = insertPromptVal;
            await (plugin as any).saveSettings?.();
            addLog('  Roadmap insert prompt saved as global default.');
            new Notice('Roadmap insert prompt saved as default');
          } catch (e: any) {
            addLog(`  Failed to save roadmap insert prompt: ${e?.message || e}`);
            new Notice(`Failed to save insert prompt: ${e?.message || e}`);
          }
        }
      }
      setCustomParams(prev => ({ ...prev, [currentStepIndex]: normalized }));
      // Guard: prevent retry when step 2 prompt is empty after trimming
      if (currentStepIndex === 1 && typeof (params as any).prompt === 'string') {
        const __trim = ((params as any).prompt as string).trim();
        if (__trim.length === 0) {
          new Notice('Prompt cannot be empty');
          return;
        }
      }
    }
    addLog(`🔄 重试步骤${currentStepIndex + 1}`);
    setWorkflowStatus('running');
    // Pass prompt override directly so the immediate retry uses the latest prompt
    const overrides = (params && (params as any).prompt) ? { prompt: ((params as any).prompt as string).trim() } : undefined;
    await executeStep(currentStepIndex, overrides);
  }, [currentStepIndex, addLog, executeStep, plugin]);

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
              plugin={plugin}
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
              plugin={plugin}
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
              plugin={plugin}
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
              plugin={plugin}
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
              plugin={plugin}
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
              plugin={plugin}
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












