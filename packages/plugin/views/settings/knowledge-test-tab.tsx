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

  // 自定义提示词状态
  const [showCustomPrompts, setShowCustomPrompts] = useState(false);
  const [customPrompts, setCustomPrompts] = useState({
    atomicSplit: plugin.settings.atomicSplitPrompt,
    rename: plugin.settings.renameInstructions,
    folder: plugin.settings.customFolderInstructions,
    tags: plugin.settings.customTagInstructions
  });

  const addLog = (message: string) => {
    setProcessingLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleSavePrompts = () => {
    plugin.settings.atomicSplitPrompt = customPrompts.atomicSplit;
    plugin.settings.renameInstructions = customPrompts.rename;
    plugin.settings.customFolderInstructions = customPrompts.folder;
    plugin.settings.customTagInstructions = customPrompts.tags;
    plugin.saveSettings();
    alert('提示词已保存到设置！');
  };

  const handleResetPrompts = () => {
    setCustomPrompts({
      atomicSplit: plugin.settings.atomicSplitPrompt,
      rename: plugin.settings.renameInstructions,
      folder: plugin.settings.customFolderInstructions,
      tags: plugin.settings.customTagInstructions
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
          customPrompt: showCustomPrompts ? customPrompts.atomicSplit : plugin.settings.atomicSplitPrompt
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

            {/* 原子化拆分提示词 */}
            <div>
              <label className="block mb-2 font-semibold text-sm">
                1. 原子化拆分提示词
                <span className="ml-2 text-xs text-gray-500">(用于笔记拆分)</span>
              </label>
              <textarea
                value={customPrompts.atomicSplit}
                onChange={(e) => setCustomPrompts({...customPrompts, atomicSplit: e.target.value})}
                className="w-full h-32 p-2 border border-gray-300 rounded text-sm font-mono"
                placeholder="输入原子化拆分提示词..."
              />
            </div>

            {/* 重命名提示词 */}
            <div>
              <label className="block mb-2 font-semibold text-sm">
                2. 重命名提示词
                <span className="ml-2 text-xs text-gray-500">(用于笔记重命名)</span>
              </label>
              <textarea
                value={customPrompts.rename}
                onChange={(e) => setCustomPrompts({...customPrompts, rename: e.target.value})}
                className="w-full h-24 p-2 border border-gray-300 rounded text-sm font-mono"
                placeholder="输入重命名提示词..."
              />
            </div>

            {/* 文件夹分类提示词 */}
            <div>
              <label className="block mb-2 font-semibold text-sm">
                3. 文件夹分类提示词
                <span className="ml-2 text-xs text-gray-500">(用于笔记分类)</span>
              </label>
              <textarea
                value={customPrompts.folder}
                onChange={(e) => setCustomPrompts({...customPrompts, folder: e.target.value})}
                className="w-full h-24 p-2 border border-gray-300 rounded text-sm font-mono"
                placeholder="输入文件夹分类提示词（可选）..."
              />
            </div>

            {/* 标签生成提示词 */}
            <div>
              <label className="block mb-2 font-semibold text-sm">
                4. 标签生成提示词
                <span className="ml-2 text-xs text-gray-500">(用于标签推荐)</span>
              </label>
              <textarea
                value={customPrompts.tags}
                onChange={(e) => setCustomPrompts({...customPrompts, tags: e.target.value})}
                className="w-full h-24 p-2 border border-gray-300 rounded text-sm font-mono"
                placeholder="输入标签生成提示词..."
              />
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
      <div className="flex gap-3">
        <button
          onClick={handleTestSplit}
          disabled={isProcessing || !testContent.trim()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isProcessing ? '测试中...' : '测试拆分'}
        </button>

        <button
          onClick={handleRealProcess}
          disabled={isProcessing || !testContent.trim()}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          真实处理测试
        </button>

        <button
          onClick={handleClearLog}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          清空日志
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

      {/* 使用说明 */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded">
        <h3 className="font-semibold mb-2 text-blue-800">📖 使用说明</h3>
        <ul className="text-sm text-blue-900 space-y-1 list-disc list-inside">
          <li><strong>测试拆分</strong>：仅测试AI拆分能力，不会创建实际文件</li>
          <li><strong>真实处理测试</strong>：创建测试文件并走完整处理流程（包括拆分、分类、重命名等）</li>
          <li>测试前确保在 Advanced 标签页启用了知识管理功能</li>
          <li>建议先用"测试拆分"验证效果，满意后再用"真实处理测试"</li>
          <li>真实处理会自动删除原笔记，请注意备份重要内容</li>
        </ul>
      </div>
    </div>
  );
};
