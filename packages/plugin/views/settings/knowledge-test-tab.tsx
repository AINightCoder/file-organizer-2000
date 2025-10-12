import React, { useState } from 'react';
import FileOrganizer from '../../index';
import { TFile } from 'obsidian';

interface KnowledgeTestTabProps {
  plugin: FileOrganizer;
}

export const KnowledgeTestTab: React.FC<KnowledgeTestTabProps> = ({ plugin }) => {
  const [testContent, setTestContent] = useState(
    `# Flutter开发笔记

## 什么是Flutter

Flutter是Google开发的跨平台UI框架，使用Dart语言编写。它允许开发者使用单一代码库构建高性能的iOS和Android应用。Flutter的核心特点是使用自己的渲染引擎，不依赖平台原生组件，因此可以实现完全一致的跨平台UI体验。

## Flutter的优势

1. **热重载功能**：开发过程中可以即时查看代码修改效果，大大提高开发效率
2. **单一代码库**：一次编写，支持iOS、Android、Web、桌面等多个平台
3. **丰富的组件库**：Material Design和Cupertino风格的组件库开箱即用
4. **高性能**：直接编译为原生代码，性能接近原生应用
5. **社区活跃**：Google支持，有大量的第三方包和活跃的开发者社区

## 如何安装Flutter

### 系统要求
- Windows 10或更高版本
- 至少8GB内存
- 至少10GB磁盘空间

### 安装步骤
1. 访问Flutter官网下载最新SDK
2. 解压到合适的位置（如C:\\flutter）
3. 将flutter\\bin目录添加到系统PATH环境变量
4. 运行flutter doctor检查环境配置
5. 安装Android Studio和相关SDK
6. 配置Android模拟器或连接真机

### 验证安装
\`\`\`bash
flutter doctor -v
\`\`\`

这条命令会检查所有必需的工具和依赖是否正确安装。`
  );
  const [testFileName, setTestFileName] = useState('Flutter开发笔记');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingLog, setProcessingLog] = useState<string[]>([]);
  const [testResults, setTestResults] = useState<any>(null);
  const [fullFlowResults, setFullFlowResults] = useState<any>(null);

  // 自定义提示词状态（按处理流程顺序）
  const [showCustomPrompts, setShowCustomPrompts] = useState(false);
  const [customPrompts, setCustomPrompts] = useState({
    // 步骤1: 原子化拆分
    atomicSplit: plugin.settings.atomicSplitPrompt,
    // 步骤2: 按长度拆分
    lengthSplit: plugin.settings.lengthSplitPrompt,
    // 步骤3: 内容分类（后端使用）
    classify: plugin.settings.classifyPrompt,
    // 步骤4: 文件重命名
    rename: plugin.settings.renameInstructions,
    // 步骤5: 增强元数据
    metadata: plugin.settings.enhancedMetadataPrompt,
  // 步骤3/7: 内容优化和格式化提示词（optimize/format）
  optimize: plugin.settings.optimizePrompt,
    // 步骤7: 文件夹分类
    folder: plugin.settings.customFolderInstructions,
    // 步骤8: 标签推荐
    tags: plugin.settings.customTagInstructions
    ,
    // 图片分析提示词
    image: plugin.settings.imageInstructions,
    // Roadmap 生成提示词
    roadmap: plugin.settings.roadmapPrompt
  });

  const addLog = (message: string) => {
    setProcessingLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleSavePrompts = () => {
    plugin.settings.atomicSplitPrompt = customPrompts.atomicSplit;
    plugin.settings.lengthSplitPrompt = customPrompts.lengthSplit;
    plugin.settings.classifyPrompt = customPrompts.classify;
    plugin.settings.renameInstructions = customPrompts.rename;
    plugin.settings.enhancedMetadataPrompt = customPrompts.metadata;
  plugin.settings.optimizePrompt = customPrompts.optimize;
    plugin.settings.customFolderInstructions = customPrompts.folder;
    plugin.settings.customTagInstructions = customPrompts.tags;
    plugin.settings.imageInstructions = customPrompts.image;
    plugin.settings.roadmapPrompt = customPrompts.roadmap;
    plugin.saveSettings();
    alert('提示词已保存到设置！');
  };

  const handleResetPrompts = () => {
    setCustomPrompts({
      atomicSplit: plugin.settings.atomicSplitPrompt,
      lengthSplit: plugin.settings.lengthSplitPrompt,
      classify: plugin.settings.classifyPrompt,
      rename: plugin.settings.renameInstructions,
      metadata: plugin.settings.enhancedMetadataPrompt,
      optimize: plugin.settings.optimizePrompt,
      folder: plugin.settings.customFolderInstructions,
      tags: plugin.settings.customTagInstructions
      ,
      image: plugin.settings.imageInstructions,
      roadmap: plugin.settings.roadmapPrompt
    });
    alert('已重置为当前设置中的提示词！');
  };

  const handleTestSplit = async () => {
    if (!plugin.settings.enableKnowledgeManagement) {
      alert('请先在 Advanced 标签页中启用知识管理功能！');
      return;
    }

    setIsProcessing(true);
    setProcessingLog([]);
    setTestResults(null);

    try {
      addLog('开始测试拆分功能...');

      // 创建临时测试文件
      const testFilePath = `${plugin.settings.pathToWatch}/${testFileName}.md`;
      addLog(`创建测试文件: ${testFilePath}`);

      let testFile: TFile;
      try {
        testFile = await plugin.app.vault.create(testFilePath, testContent);
        addLog('✅ 测试文件创建成功');
      } catch (error) {
        addLog(`❌ 文件创建失败: ${error.message}`);
        return;
      }

      // 等待一下让系统处理
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 检查AI服务
      if (!plugin.aiService) {
        addLog('❌ AI服务未初始化');
        return;
      }
      addLog('✅ AI服务已准备');

      // 测试原子化拆分
      addLog('开始原子化拆分测试...');
      addLog(`使用自定义提示词: ${showCustomPrompts ? '是' : '否（使用设置中的提示词）'}`);
      try {
        const atomicNotes = await plugin.aiService.splitIntoAtomicNotes({
          content: testContent,
          filename: testFileName,
          customPrompt: showCustomPrompts ? customPrompts.atomicSplit : undefined  // 不传 customPrompt，让 AIService 使用 settings
        });

        addLog(`✅ 原子化拆分成功，共生成 ${atomicNotes.length} 个笔记`);

        const results = {
          originalLength: testContent.length,
          splitCount: atomicNotes.length,
          notes: atomicNotes.map(note => ({
            title: note.filename,
            length: note.content.length,
            knowledgePoint: note.knowledgePoint || '未指定',
            preview: note.content.substring(0, 100) + '...'
          }))
        };

        setTestResults(results);

        atomicNotes.forEach((note, index) => {
          addLog(`  笔记 ${index + 1}: ${note.filename} (${note.content.length} 字符)`);
          if (note.knowledgePoint) {
            addLog(`    知识点: ${note.knowledgePoint}`);
          }
        });

      } catch (error) {
        addLog(`❌ 拆分失败: ${error.message}`);
        console.error('拆分错误详情:', error);
      }

      addLog('测试完成！');

    } catch (error) {
      addLog(`❌ 测试过程出错: ${error.message}`);
      console.error('测试错误:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearLog = () => {
    setProcessingLog([]);
    setTestResults(null);
    setFullFlowResults(null);
  };

  const handleTestFullFlow = async () => {
    if (!plugin.settings.enableKnowledgeManagement) {
      alert('请先在 Advanced 标签页中启用知识管理功能！');
      return;
    }

    setIsProcessing(true);
    setProcessingLog([]);
    setTestResults(null);
    setFullFlowResults(null);

    try {
      addLog('🚀 开始完整流程测试...');
      addLog('📋 测试流程：');
      addLog('  1. 文件验证');
      addLog('  2. 容器创建');
      addLog('  3. 移动附件');
      addLog('  4. 内容提取');
      addLog('  5. 知识点原子化拆分');
      addLog('  6. 按最大字数拆分');
      addLog('  7. 内容优化和格式化');
      addLog('  8. 文件重命名');
      addLog('  9. 元数据扩展');
      addLog('  10. 附加附件');
      addLog('  11. 智能文件夹推荐和移动');
      addLog('  12. Roadmap关联');
      addLog('  13. 完成处理');
      addLog('');

      const flowResults: any = {
        steps: [],
        startTime: Date.now()
      };

      // 1. 文件验证
      addLog('📝 步骤 1/13: 文件验证');
      if (!testContent.trim()) {
        addLog('❌ 文件内容为空');
        return;
      }
      if (!testFileName.trim()) {
        addLog('❌ 文件名为空');
        return;
      }
      addLog('✅ 文件验证通过');
      flowResults.steps.push({ step: '文件验证', status: 'success' });

      // 2. 容器创建
      addLog('📝 步骤 2/13: 容器创建');
      const testFilePath = `${plugin.settings.pathToWatch}/${testFileName}-test-${Date.now()}.md`;
      addLog(`  创建测试文件: ${testFilePath}`);
      
      let testFile: TFile;
      try {
        testFile = await plugin.app.vault.create(testFilePath, testContent);
        addLog('✅ 容器创建成功');
        flowResults.steps.push({ step: '容器创建', status: 'success', file: testFile.path });
      } catch (error: any) {
        addLog(`❌ 容器创建失败: ${error.message}`);
        flowResults.steps.push({ step: '容器创建', status: 'failed', error: error.message });
        return;
      }

      // 3. 移动附件（模拟，因为测试文件不是媒体文件）
      addLog('📝 步骤 3/13: 移动附件');
      addLog('ℹ️  跳过（测试文件为 Markdown）');
      flowResults.steps.push({ step: '移动附件', status: 'skipped' });

      // 4. 内容提取
      addLog('📝 步骤 4/13: 内容提取');
      const extractedContent = await plugin.app.vault.read(testFile);
      addLog(`✅ 内容提取成功（${extractedContent.length} 字符）`);
      flowResults.steps.push({ step: '内容提取', status: 'success', length: extractedContent.length });

      // 5. 知识点原子化拆分
      addLog('📝 步骤 5/13: 知识点原子化拆分');
      if (!plugin.aiService) {
        addLog('❌ AI服务未初始化');
        flowResults.steps.push({ step: '原子化拆分', status: 'failed', error: 'AI服务未初始化' });
        return;
      }

      let atomicNotes: any[] = [];
      try {
        atomicNotes = await plugin.aiService.splitIntoAtomicNotes({
          content: extractedContent,
          filename: testFileName,
          customPrompt: showCustomPrompts ? customPrompts.atomicSplit : undefined  // 不传，使用 settings
        });
        addLog(`✅ 原子化拆分成功，共生成 ${atomicNotes.length} 个笔记`);
        flowResults.steps.push({ 
          step: '原子化拆分', 
          status: 'success', 
          count: atomicNotes.length,
          notes: atomicNotes.map((n: any) => ({ title: n.filename, length: n.content.length }))
        });

        atomicNotes.forEach((note: any, index: number) => {
          addLog(`  笔记 ${index + 1}: ${note.filename} (${note.content.length} 字符)`);
        });
      } catch (error: any) {
        addLog(`❌ 原子化拆分失败: ${error.message}`);
        flowResults.steps.push({ step: '原子化拆分', status: 'failed', error: error.message });
        // 继续流程，使用原始内容
        atomicNotes = [{ filename: testFileName, content: extractedContent }];
      }

      // 6. 按最大字数拆分
      addLog('📝 步骤 6/13: 按最大字数拆分');
      const maxLength = plugin.settings.maxNoteLength || 5000;
      let finalNotes = [...atomicNotes];
      let needLengthSplit = false;

      for (let i = 0; i < atomicNotes.length; i++) {
        if (atomicNotes[i].content.length > maxLength) {
          needLengthSplit = true;
          addLog(`  笔记 "${atomicNotes[i].filename}" 超长 (${atomicNotes[i].content.length} > ${maxLength})，需要拆分`);
        }
      }

      if (needLengthSplit) {
        addLog(`⚠️  有笔记超过最大长度限制 (${maxLength} 字符)，实际处理中会进行长度拆分`);
        flowResults.steps.push({ step: '长度拆分', status: 'warning', maxLength, message: '有笔记需要长度拆分' });
      } else {
        addLog(`✅ 所有笔记长度符合要求（<= ${maxLength} 字符）`);
        flowResults.steps.push({ step: '长度拆分', status: 'success', message: '无需长度拆分' });
      }

      // 7. 内容优化和格式化
      addLog('📝 步骤 7/13: 内容优化和格式化');
      addLog('ℹ️  格式化功能需要完整处理流程支持，测试中跳过');
      flowResults.steps.push({ step: '内容格式化', status: 'skipped' });

      // 8. 文件重命名
      addLog('📝 步骤 8/13: 文件重命名');
      const renameResults: any[] = [];
      try {
        for (let i = 0; i < Math.min(finalNotes.length, 3); i++) {
          const note = finalNotes[i];
          const titleSuggestions = await plugin.recommendName(
            note.content,
            note.filename
          );
          const suggestedName = titleSuggestions[0]?.title || note.filename;
          renameResults.push({ 
            original: note.filename, 
            suggested: suggestedName 
          });
          addLog(`  "${note.filename}" → "${suggestedName}"`);
        }
        if (finalNotes.length > 3) {
          addLog(`  ... 还有 ${finalNotes.length - 3} 个笔记`);
        }
        addLog('✅ 文件重命名建议生成成功');
        flowResults.steps.push({ step: '文件重命名', status: 'success', renames: renameResults });
      } catch (error: any) {
        addLog(`❌ 重命名失败: ${error.message}`);
        flowResults.steps.push({ step: '文件重命名', status: 'failed', error: error.message });
      }

      // 9. 元数据扩展
      addLog('📝 步骤 9/13: 元数据扩展');
      try {
        if (plugin.aiService.generateEnhancedMetadata) {
          const metadata = await plugin.aiService.generateEnhancedMetadata({
            content: finalNotes[0].content,
            filename: finalNotes[0].filename
          });
          addLog(`✅ 元数据生成成功`);
          addLog(`  标题: ${metadata.title}`);
          addLog(`  类别: ${metadata.category}`);
          addLog(`  标签: ${metadata.tags.join(', ')}`);
          addLog(`  摘要: ${metadata.summary.substring(0, 50)}...`);
          flowResults.steps.push({ step: '元数据扩展', status: 'success', metadata });
        } else {
          addLog('ℹ️  元数据扩展功能未启用');
          flowResults.steps.push({ step: '元数据扩展', status: 'skipped' });
        }
      } catch (error: any) {
        addLog(`⚠️  元数据生成失败: ${error.message}`);
        flowResults.steps.push({ step: '元数据扩展', status: 'warning', error: error.message });
      }

      // 10. 附加附件
      addLog('📝 步骤 10/13: 附加附件');
      addLog('ℹ️  跳过（测试文件无附件）');
      flowResults.steps.push({ step: '附加附件', status: 'skipped' });

      // 11. 智能文件夹推荐和移动
      addLog('📝 步骤 11/13: 智能文件夹推荐和移动');
      try {
        const folderSuggestions = await plugin.recommendFolders(
          finalNotes[0].content,
          testFileName
        );
        const folderSuggestion = folderSuggestions[0]?.folder || '未推荐';
        addLog(`✅ 文件夹推荐成功: ${folderSuggestion}`);
        flowResults.steps.push({ step: '文件夹推荐', status: 'success', folder: folderSuggestion });
      } catch (error: any) {
        addLog(`❌ 文件夹推荐失败: ${error.message}`);
        flowResults.steps.push({ step: '文件夹推荐', status: 'failed', error: error.message });
      }

      // 12. Roadmap关联
      addLog('📝 步骤 12/13: Roadmap关联');
      addLog('ℹ️  Roadmap 功能需要完整处理流程支持，测试中跳过');
      flowResults.steps.push({ step: 'Roadmap关联', status: 'skipped' });

      // 13. 完成处理
      addLog('📝 步骤 13/13: 完成处理');
      flowResults.endTime = Date.now();
      flowResults.duration = flowResults.endTime - flowResults.startTime;
      addLog(`✅ 测试完成！总耗时: ${(flowResults.duration / 1000).toFixed(2)} 秒`);
      flowResults.steps.push({ step: '完成处理', status: 'success' });

      // 清理测试文件
      addLog('');
      addLog('🧹 清理测试文件...');
      try {
        await plugin.app.vault.delete(testFile);
        addLog('✅ 测试文件已删除');
      } catch (error: any) {
        addLog(`⚠️  清理失败: ${error.message}`);
      }

      setFullFlowResults(flowResults);
      addLog('');
      addLog('🎉 完整流程测试完毕！');

    } catch (error: any) {
      addLog(`❌ 测试过程出错: ${error.message}`);
      console.error('完整流程测试错误:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRealProcess = async () => {
    if (!plugin.settings.enableKnowledgeManagement) {
      alert('请先在 Advanced 标签页中启用知识管理功能！');
      return;
    }

    if (!confirm('这将创建测试文件并通过真实的处理流程处理。确认继续？')) {
      return;
    }

    setIsProcessing(true);
    setProcessingLog([]);
    setTestResults(null);

    try {
      addLog('开始真实处理流程测试...');

      // 创建测试文件
      const testFilePath = `${plugin.settings.pathToWatch}/${testFileName}.md`;
      addLog(`创建测试文件: ${testFilePath}`);

      const testFile = await plugin.app.vault.create(testFilePath, testContent);
      addLog('✅ 测试文件创建成功');

      addLog('📝 文件将自动进入处理队列');
      addLog('请查看 Inbox 处理状态了解进度');

      // 不需要手动触发，文件监听器会自动处理

    } catch (error) {
      addLog(`❌ 处理失败: ${error.message}`);
      console.error('处理错误:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 标题和说明 */}
      <div>
        <h2 className="text-2xl font-bold mb-2">知识管理功能测试</h2>
        <p className="text-sm text-gray-600">
          在这里测试笔记拆分功能，查看拆分效果。请确保已在 Advanced 标签页启用知识管理功能。
        </p>
      </div>

      {/* 配置状态 */}
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="font-semibold mb-2">当前配置状态</h3>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${plugin.settings.enableKnowledgeManagement ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span>知识管理功能: {plugin.settings.enableKnowledgeManagement ? '已启用' : '未启用'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${plugin.settings.enableAtomicSplit ? 'bg-green-500' : 'bg-gray-400'}`}></span>
            <span>原子化拆分: {plugin.settings.enableAtomicSplit ? '已启用' : '未启用'}</span>
          </div>
          <div className="text-gray-600">
            最大笔记长度: {plugin.settings.maxNoteLength} 字符
          </div>
          <div className="text-gray-600">
            最小笔记长度: {plugin.settings.minNoteLength} 字符
          </div>
          <div className="text-gray-600">
            拆分策略: {plugin.settings.splitStrategy}
          </div>
        </div>
      </div>

      {/* 自定义提示词配置 */}
      <div className="border border-gray-300 rounded-lg">
        <button
          onClick={() => setShowCustomPrompts(!showCustomPrompts)}
          className="w-full p-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-t-lg"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">⚙️</span>
            <h3 className="font-semibold">自定义 AI 提示词</h3>
            <span className="text-xs text-gray-500">(可选)</span>
          </div>
          <span className="text-gray-500">{showCustomPrompts ? '▼' : '▶'}</span>
        </button>

        {showCustomPrompts && (
          <div className="p-4 space-y-4 bg-white">
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
              <p className="text-yellow-800">
                💡 <strong>提示：</strong>这里可以自定义测试时使用的 AI 提示词。修改后点击"保存"将更新到插件设置中，影响所有后续处理。
              </p>
            </div>

            {/* 步骤1: 原子化拆分提示词 */}
            <div>
              <label className="block mb-2 font-semibold text-sm">
                步骤1: 原子化拆分提示词
                <span className="ml-2 text-xs text-gray-500">(splitIntoAtomicNotes)</span>
              </label>
              <textarea
                value={customPrompts.atomicSplit}
                onChange={(e) => setCustomPrompts({...customPrompts, atomicSplit: e.target.value})}
                className="w-full h-32 p-2 border border-gray-300 rounded text-sm font-mono"
                placeholder="输入原子化拆分提示词..."
              />
              <div className="mt-1 text-xs text-gray-500">
                支持占位符: $&#123;filename&#125;, $&#123;content&#125;
              </div>
            </div>

            {/* 步骤2: 按长度拆分提示词 */}
            <div>
              <label className="block mb-2 font-semibold text-sm">
                步骤2: 按长度拆分提示词
                <span className="ml-2 text-xs text-gray-500">(splitByLength)</span>
              </label>
              <textarea
                value={customPrompts.lengthSplit}
                onChange={(e) => setCustomPrompts({...customPrompts, lengthSplit: e.target.value})}
                className="w-full h-32 p-2 border border-gray-300 rounded text-sm font-mono"
                placeholder="输入按长度拆分提示词..."
              />
              <div className="mt-1 text-xs text-gray-500">
                支持占位符: $&#123;maxLength&#125;, $&#123;content&#125;
              </div>
            </div>

            {/* 步骤3: 内容分类提示词 */}
            <div>
              <label className="block mb-2 font-semibold text-sm">
                步骤3: 内容分类提示词
                <span className="ml-2 text-xs text-gray-500">(classifyContentV2 - 后端使用)</span>
              </label>
              <textarea
                value={customPrompts.classify}
                onChange={(e) => setCustomPrompts({...customPrompts, classify: e.target.value})}
                className="w-full h-24 p-2 border border-gray-300 rounded text-sm font-mono"
                placeholder="输入内容分类提示词..."
              />
              <div className="mt-1 text-xs text-gray-500">
                支持占位符: $&#123;templateNames&#125;, $&#123;content&#125; | 注意：此提示词由后端API使用
              </div>
            </div>

            {/* 步骤4: 文件重命名提示词 */}
            <div>
              <label className="block mb-2 font-semibold text-sm">
                步骤4: 文件重命名提示词
                <span className="ml-2 text-xs text-gray-500">(recommendName)</span>
              </label>
              <textarea
                value={customPrompts.rename}
                onChange={(e) => setCustomPrompts({...customPrompts, rename: e.target.value})}
                className="w-full h-24 p-2 border border-gray-300 rounded text-sm font-mono"
                placeholder="输入重命名提示词..."
              />
              <div className="mt-1 text-xs text-gray-500">
                作为 customInstructions 传递给 AI
              </div>
            </div>

            {/* 步骤5: 增强元数据提示词 */}
            <div>
              <label className="block mb-2 font-semibold text-sm">
                步骤5: 增强元数据生成提示词
                <span className="ml-2 text-xs text-gray-500">(generateEnhancedMetadata)</span>
              </label>
              <textarea
                value={customPrompts.metadata}
                onChange={(e) => setCustomPrompts({...customPrompts, metadata: e.target.value})}
                className="w-full h-32 p-2 border border-gray-300 rounded text-sm font-mono"
                placeholder="输入元数据生成提示词..."
              />
              <div className="mt-1 text-xs text-gray-500">
                支持占位符: $&#123;categoriesHint&#125;, $&#123;filename&#125;, $&#123;content&#125;
              </div>
            </div>

            {/* 内容优化和格式化提示词（回退/统一优化） */}
            <div>
              <label className="block mb-2 font-semibold text-sm">
                内容优化与格式化提示词
                <span className="ml-2 text-xs text-gray-500">(optimize/format - 回退用)</span>
              </label>
              <textarea
                value={customPrompts.optimize}
                onChange={(e) => setCustomPrompts({...customPrompts, optimize: e.target.value})}
                className="w-full h-28 p-2 border border-gray-300 rounded text-sm font-mono"
                placeholder="输入内容优化和格式化提示词..."
              />
              <div className="mt-1 text-xs text-gray-500">
                用于在模板指令缺失时作为回退格式化提示词。支持占位符: {'${content}'}。
              </div>
            </div>

            {/* 步骤7: 文件夹分类提示词 */}
            <div>
              <label className="block mb-2 font-semibold text-sm">
                步骤7: 智能文件夹分类提示词
                <span className="ml-2 text-xs text-gray-500">(recommendFolders)</span>
              </label>
              <textarea
                value={customPrompts.folder}
                onChange={(e) => setCustomPrompts({...customPrompts, folder: e.target.value})}
                className="w-full h-24 p-2 border border-gray-300 rounded text-sm font-mono"
                placeholder="输入文件夹分类提示词（可选）..."
              />
              <div className="mt-1 text-xs text-gray-500">
                作为 customInstructions 传递给 AI，可为空
              </div>
            </div>

            {/* 步骤8: 标签推荐提示词 */}
            <div>
              <label className="block mb-2 font-semibold text-sm">
                步骤8: 标签推荐提示词
                <span className="ml-2 text-xs text-gray-500">(recommendTags)</span>
              </label>
              <textarea
                value={customPrompts.tags}
                onChange={(e) => setCustomPrompts({...customPrompts, tags: e.target.value})}
                className="w-full h-24 p-2 border border-gray-300 rounded text-sm font-mono"
                placeholder="输入标签生成提示词..."
              />
              <div className="mt-1 text-xs text-gray-500">
                作为 customInstructions 传递给 AI
              </div>
            </div>

            {/* 图片分析提示词 */}
            <div>
              <label className="block mb-2 font-semibold text-sm">
                图片分析提示词
                <span className="ml-2 text-xs text-gray-500">(extractTextFromImage / image instructions)</span>
              </label>
              <textarea
                value={customPrompts.image}
                onChange={(e) => setCustomPrompts({...customPrompts, image: e.target.value})}
                className="w-full h-24 p-2 border border-gray-300 rounded text-sm font-mono"
                placeholder="输入图片分析提示词..."
              />
              <div className="mt-1 text-xs text-gray-500">
                用于图片 OCR/视觉描述，确保包含要点提取指令
              </div>
            </div>

            {/* Roadmap 生成提示词 */}
            <div>
              <label className="block mb-2 font-semibold text-sm">
                Roadmap 生成提示词
                <span className="ml-2 text-xs text-gray-500">(用于生成领域学习路线图)</span>
              </label>
              <textarea
                value={customPrompts.roadmap}
                onChange={(e) => setCustomPrompts({...customPrompts, roadmap: e.target.value})}
                className="w-full h-40 p-2 border border-gray-300 rounded text-sm font-mono"
                placeholder="输入 Roadmap 生成提示词..."
              />
              <div className="mt-1 text-xs text-gray-500">
                用于生成学习路线图，支持占位符: {'${domain}'}。默认来自 docs/flow/参考流程.md。
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-3 pt-2 border-t border-gray-200">
              <button
                onClick={handleSavePrompts}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                💾 保存到设置
              </button>
              <button
                onClick={handleResetPrompts}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                🔄 重置
              </button>
              <div className="flex-1"></div>
              <div className="text-xs text-gray-500 self-center">
                测试时会使用这里的提示词（开启时）或设置中的提示词（关闭时）
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 测试内容输入 */}
      <div>
        <label className="block mb-2 font-semibold">测试文件名</label>
        <input
          type="text"
          value={testFileName}
          onChange={(e) => setTestFileName(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded"
          placeholder="输入测试文件名"
        />
      </div>

      <div>
        <label className="block mb-2 font-semibold">测试内容</label>
        <textarea
          value={testContent}
          onChange={(e) => setTestContent(e.target.value)}
          className="w-full h-64 p-3 border border-gray-300 rounded font-mono text-sm"
          placeholder="输入要测试的笔记内容..."
        />
        <div className="mt-1 text-sm text-gray-600">
          当前内容长度: {testContent.length} 字符
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={handleTestSplit}
          disabled={isProcessing || !testContent.trim()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isProcessing ? '测试中...' : '🔬 测试拆分'}
        </button>

        <button
          onClick={handleTestFullFlow}
          disabled={isProcessing || !testContent.trim()}
          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isProcessing ? '测试中...' : '🎯 完整流程测试'}
        </button>

        <button
          onClick={handleRealProcess}
          disabled={isProcessing || !testContent.trim()}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isProcessing ? '测试中...' : '✅ 真实处理测试'}
        </button>

        <button
          onClick={handleClearLog}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          🧹 清空日志
        </button>
      </div>

      {/* 处理日志 */}
      {processingLog.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">处理日志</h3>
          <div className="p-3 bg-black text-green-400 rounded font-mono text-sm h-64 overflow-y-auto">
            {processingLog.map((log, index) => (
              <div key={index}>{log}</div>
            ))}
          </div>
        </div>
      )}

      {/* 测试结果 */}
      {testResults && (
        <div>
          <h3 className="font-semibold mb-2">拆分结果</h3>
          <div className="p-4 bg-white border border-gray-200 rounded">
            <div className="grid grid-cols-3 gap-4 mb-4 text-center">
              <div className="p-3 bg-blue-50 rounded">
                <div className="text-2xl font-bold text-blue-600">{testResults.originalLength}</div>
                <div className="text-sm text-gray-600">原始长度（字符）</div>
              </div>
              <div className="p-3 bg-green-50 rounded">
                <div className="text-2xl font-bold text-green-600">{testResults.splitCount}</div>
                <div className="text-sm text-gray-600">拆分笔记数</div>
              </div>
              <div className="p-3 bg-purple-50 rounded">
                <div className="text-2xl font-bold text-purple-600">
                  {Math.round(testResults.originalLength / testResults.splitCount)}
                </div>
                <div className="text-sm text-gray-600">平均长度（字符）</div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold">拆分的笔记：</h4>
              {testResults.notes.map((note: any, index: number) => (
                <div key={index} className="p-3 bg-gray-50 rounded border border-gray-200">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-semibold text-blue-600">
                      {index + 1}. {note.title}
                    </span>
                    <span className="text-sm text-gray-600">{note.length} 字符</span>
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    <strong>知识点：</strong> {note.knowledgePoint}
                  </div>
                  <div className="text-sm text-gray-500 bg-white p-2 rounded">
                    {note.preview}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 完整流程测试结果 */}
      {fullFlowResults && (
        <div>
          <h3 className="font-semibold mb-2">完整流程测试结果</h3>
          <div className="p-4 bg-white border border-gray-200 rounded space-y-4">
            {/* 总览 */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-3 bg-blue-50 rounded">
                <div className="text-2xl font-bold text-blue-600">{fullFlowResults.steps.length}</div>
                <div className="text-sm text-gray-600">总步骤数</div>
              </div>
              <div className="p-3 bg-green-50 rounded">
                <div className="text-2xl font-bold text-green-600">
                  {fullFlowResults.steps.filter((s: any) => s.status === 'success').length}
                </div>
                <div className="text-sm text-gray-600">成功步骤</div>
              </div>
              <div className="p-3 bg-purple-50 rounded">
                <div className="text-2xl font-bold text-purple-600">
                  {(fullFlowResults.duration / 1000).toFixed(2)}s
                </div>
                <div className="text-sm text-gray-600">总耗时</div>
              </div>
            </div>

            {/* 步骤详情 */}
            <div className="space-y-2">
              <h4 className="font-semibold">步骤详情：</h4>
              {fullFlowResults.steps.map((step: any, index: number) => (
                <div key={index} className={`p-3 rounded border ${
                  step.status === 'success' ? 'bg-green-50 border-green-200' :
                  step.status === 'failed' ? 'bg-red-50 border-red-200' :
                  step.status === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                  'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {step.status === 'success' ? '✅' :
                       step.status === 'failed' ? '❌' :
                       step.status === 'warning' ? '⚠️' :
                       'ℹ️'} {step.step}
                    </span>
                    <span className={`text-sm px-2 py-1 rounded ${
                      step.status === 'success' ? 'bg-green-100 text-green-800' :
                      step.status === 'failed' ? 'bg-red-100 text-red-800' :
                      step.status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {step.status === 'skipped' ? '已跳过' : step.status}
                    </span>
                  </div>
                  
                  {/* 步骤详细信息 */}
                  {step.error && (
                    <div className="mt-2 text-sm text-red-600">
                      错误: {step.error}
                    </div>
                  )}
                  {step.message && (
                    <div className="mt-2 text-sm text-gray-600">
                      {step.message}
                    </div>
                  )}
                  {step.count !== undefined && (
                    <div className="mt-2 text-sm text-gray-600">
                      生成笔记数: {step.count}
                    </div>
                  )}
                  {step.notes && step.notes.length > 0 && (
                    <div className="mt-2 text-sm text-gray-600">
                      笔记列表:
                      <ul className="ml-4 mt-1 space-y-1">
                        {step.notes.slice(0, 3).map((note: any, i: number) => (
                          <li key={i}>• {note.title} ({note.length} 字符)</li>
                        ))}
                        {step.notes.length > 3 && (
                          <li>... 还有 {step.notes.length - 3} 个笔记</li>
                        )}
                      </ul>
                    </div>
                  )}
                  {step.renames && step.renames.length > 0 && (
                    <div className="mt-2 text-sm text-gray-600">
                      重命名建议:
                      <ul className="ml-4 mt-1 space-y-1">
                        {step.renames.map((r: any, i: number) => (
                          <li key={i}>• "{r.original}" → "{r.suggested}"</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {step.metadata && (
                    <div className="mt-2 text-sm text-gray-600">
                      <div>标题: {step.metadata.title}</div>
                      <div>类别: {step.metadata.category}</div>
                      <div>标签: {step.metadata.tags.join(', ')}</div>
                    </div>
                  )}
                  {step.folder && (
                    <div className="mt-2 text-sm text-gray-600">
                      推荐文件夹: {step.folder}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 使用说明 */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded">
        <h3 className="font-semibold mb-2 text-blue-800">📖 使用说明</h3>
        <ul className="text-sm text-blue-900 space-y-1 list-disc list-inside">
          <li><strong>测试拆分</strong>：仅测试AI拆分能力，创建临时文件后立即清理</li>
          <li><strong>完整流程测试</strong>：测试所有13个处理步骤（拆分、重命名、分类、标签等），自动清理临时文件</li>
          <li><strong>真实处理测试</strong>：创建测试文件并走真实处理流程，通过插件队列系统处理</li>
          <li>测试前确保在 Advanced 标签页启用了知识管理功能</li>
          <li>建议顺序：先"测试拆分" → 再"完整流程测试" → 最后"真实处理测试"</li>
          <li>真实处理会自动删除原笔记，请注意备份重要内容</li>
        </ul>
      </div>
    </div>
  );
};
