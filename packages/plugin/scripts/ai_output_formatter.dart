// Copyright (c) 2024 VocalMind AI

import 'dart:convert';

/// AI输出格式化工具类（完全业务无关）
///
/// 负责清理和提取AI生成内容中的格式噪音，包括：
/// - 移除markdown代码块包装
/// - 提取JSON/Mermaid内容
/// - 清理引号、前缀等格式问题
///
/// 此工具类不包含任何业务逻辑，仅做纯粹的文本格式处理。
///
/// 使用示例：
/// ```dart
/// // 提取JSON
/// final json = AIOutputFormatter.extractJson(aiOutput);
/// if (json != null) {
///   final data = jsonDecode(json);
///   // 业务处理...
/// }
///
/// // 清理文本
/// final cleaned = AIOutputFormatter.cleanText(
///   aiOutput,
///   options: CleanOptions(prefixes: ['标题：']),
/// );
/// ```
class AIOutputFormatter {
  // ========== 正则表达式缓存 ==========

  /// Think标签正则（<think>...</think>）
  static final _thinkTagRegex = RegExp(
    r'<think>[\s\S]*?</think>',
    multiLine: true,
  );

  /// Markdown代码块正则（```json 或 ```mermaid 或 ```）
  static final _markdownCodeBlockRegex = RegExp(
    r'```(?:json|mermaid)?\s*\n?(.*?)\n?```',
    dotAll: true,
  );

  /// JSON数组正则
  static final _jsonArrayRegex = RegExp(r'\[[\s\S]*?\]');

  /// JSON对象正则
  static final _jsonObjectRegex = RegExp(r'\{[\s\S]*?\}');

  // ========== 公共API：JSON处理 ==========

  /// 从AI输出中提取JSON
  ///
  /// 处理流程：
  /// 1. 移除think标签
  /// 2. 移除markdown代码块包装
  /// 3. 查找JSON数组或对象
  /// 4. 验证JSON语法正确性
  /// 5. 返回第一个有效的JSON
  ///
  /// [rawText] AI原始输出
  ///
  /// 返回：干净的JSON字符串，失败返回null
  static String? extractJson(String rawText) {
    try {
      if (rawText.isEmpty) return null;

      // 1. 移除think标签
      var cleaned = _removeThinkTag(rawText);

      // 2. 基础清理
      cleaned = _removeMarkdownCodeBlock(cleaned);

      // 3. 早期返回：检查是否包含JSON特征
      if (!cleaned.contains('[') && !cleaned.contains('{')) {
        return null;
      }

      // 4. 尝试直接解析（最常见情况）
      cleaned = cleaned.trim();
      if (_isValidJson(cleaned)) {
        return cleaned;
      }

      // 5. 从文本中查找JSON
      final jsonStr = _findJsonInText(cleaned);
      if (jsonStr != null && _isValidJson(jsonStr)) {
        return jsonStr;
      }

      return null;
    } catch (_) {
      // 静默失败
      return null;
    }
  }

  /// 验证是否为有效JSON
  ///
  /// [text] 待验证文本
  ///
  /// 返回：true表示是有效JSON
  static bool isValidJson(String text) {
    return _isValidJson(text);
  }

  // ========== 公共API：Mermaid处理 ==========

  /// 从AI输出中提取Mermaid代码
  ///
  /// 处理流程：
  /// 1. 移除think标签
  /// 2. 移除markdown代码块包装
  /// 3. 提取代码直到遇到说明文字
  /// 4. 为中括号内容添加引号
  /// 5. 统一格式（换行符等）
  ///
  /// [rawText] AI原始输出
  ///
  /// 返回：干净的Mermaid代码，失败返回null
  static String? extractMermaid(String rawText) {
    try {
      if (rawText.isEmpty) return null;

      // 1. 移除think标签
      var cleaned = _removeThinkTag(rawText);

      // 2. 移除markdown包装
      cleaned = _removeMarkdownCodeBlock(cleaned);

      // 3. 移除代码后的说明文字（遇到连续两个换行符停止）
      final doubleNewlineIndex = cleaned.indexOf('\n\n');
      if (doubleNewlineIndex != -1) {
        cleaned = cleaned.substring(0, doubleNewlineIndex);
      }

      // 4. 为特殊符号内容添加引号
      cleaned = _quoteMermaidBrackets(cleaned);
      cleaned = _quoteMermaidBraces(cleaned);
      cleaned = _quoteMermaidPipes(cleaned);

      // 5. 格式修正
      cleaned = _fixMermaidFormat(cleaned);

      return cleaned.isEmpty ? null : cleaned;
    } catch (_) {
      return null;
    }
  }

  // ========== 公共API：文本清理 ==========

  /// 清理文本（移除markdown、引号等格式噪音）
  ///
  /// 默认清理：
  /// - 移除markdown代码块
  /// - 移除引号（中英文）
  /// - Trim首尾空白
  ///
  /// 可选清理（通过options）：
  /// - 移除特定前缀
  /// - 限制文本长度
  ///
  /// [rawText] 原始文本
  /// [options] 清理选项
  ///
  /// 返回：清理后的文本
  static String cleanText(String rawText, {CleanOptions? options}) {
    if (rawText.isEmpty) return '';

    var cleaned = rawText;

    // 1. 基础清理
    cleaned = _removeMarkdownCodeBlock(cleaned);
    cleaned = _removeQuotes(cleaned);
    cleaned = cleaned.trim();

    // 2. 自定义清理
    if (options != null) {
      // 移除前缀
      if (options.prefixes.isNotEmpty) {
        cleaned = _removePrefixes(cleaned, options.prefixes);
      }

      // 限制长度
      if (options.maxLength != null && cleaned.length > options.maxLength!) {
        cleaned = cleaned.substring(0, options.maxLength!);
      }
    }

    return cleaned;
  }

  static String removeThinkTag(String text) {
    return _removeThinkTag(text);
  }

  // ========== 私有辅助方法：文本清理 ==========

  /// 移除think标签
  static String _removeThinkTag(String text) {
    return text.replaceAll(_thinkTagRegex, '').trim();
  }

  /// 移除markdown代码块包装
  static String _removeMarkdownCodeBlock(String text) {
    // 尝试正则匹配
    final match = _markdownCodeBlockRegex.firstMatch(text);
    if (match != null && match.groupCount >= 1) {
      final content = match.group(1);
      if (content != null) return content.trim();
    }

    // 手动处理
    var cleaned = text;

    // 移除开头的markdown标记
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```mermaid')) {
      cleaned = cleaned.substring(10);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }

    // 移除结尾的markdown标记
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }

    return cleaned.trim();
  }

  /// 移除引号
  static String _removeQuotes(String text) {
    var cleaned = text.trim();

    // 移除英文引号
    if (cleaned.startsWith('"') &&
        cleaned.endsWith('"') &&
        cleaned.length > 1) {
      cleaned = cleaned.substring(1, cleaned.length - 1);
    }

    // 移除中文引号
    if (cleaned.startsWith('"') &&
        cleaned.endsWith('"') &&
        cleaned.length > 1) {
      cleaned = cleaned.substring(1, cleaned.length - 1);
    }

    return cleaned.trim();
  }

  /// 移除指定前缀
  static String _removePrefixes(String text, List<String> prefixes) {
    var cleaned = text;
    for (final prefix in prefixes) {
      if (cleaned.startsWith(prefix)) {
        cleaned = cleaned.substring(prefix.length).trim();
        break; // 只移除第一个匹配的前缀
      }
    }
    return cleaned;
  }

  // ========== 私有辅助方法：JSON处理 ==========

  /// 在文本中查找JSON
  static String? _findJsonInText(String text) {
    // 1. 优先查找JSON数组
    final arrayMatch = _jsonArrayRegex.firstMatch(text);
    if (arrayMatch != null) {
      final json = arrayMatch.group(0);
      if (json != null) return json;
    }

    // 2. 查找JSON对象
    final objectMatch = _jsonObjectRegex.firstMatch(text);
    if (objectMatch != null) {
      final json = objectMatch.group(0);
      if (json != null) return json;
    }

    // 3. 手动查找（处理嵌套情况）
    return _findJsonManually(text);
  }

  /// 手动查找JSON（处理嵌套括号）
  static String? _findJsonManually(String text) {
    // 查找数组
    final arrayStart = text.indexOf('[');
    if (arrayStart != -1) {
      final arrayEnd = _findMatchingBracket(text, arrayStart, '[', ']');
      if (arrayEnd != -1) {
        return text.substring(arrayStart, arrayEnd + 1);
      }
    }

    // 查找对象
    final objectStart = text.indexOf('{');
    if (objectStart != -1) {
      final objectEnd = _findMatchingBracket(text, objectStart, '{', '}');
      if (objectEnd != -1) {
        return text.substring(objectStart, objectEnd + 1);
      }
    }

    return null;
  }

  /// 查找匹配的闭合括号（处理嵌套）
  static int _findMatchingBracket(
    String text,
    int startIndex,
    String openBracket,
    String closeBracket,
  ) {
    int depth = 0;
    for (int i = startIndex; i < text.length; i++) {
      if (text[i] == openBracket) {
        depth++;
      } else if (text[i] == closeBracket) {
        depth--;
        if (depth == 0) {
          return i;
        }
      }
    }
    return -1; // 未找到匹配的闭合括号
  }

  /// 验证JSON是否有效
  static bool _isValidJson(String text) {
    try {
      jsonDecode(text);
      return true;
    } catch (_) {
      return false;
    }
  }

  // ========== 私有辅助方法：Mermaid处理 ==========

  /// 为Mermaid中括号内容添加引号
  /// 例如: I -->|找到| J[截取到第一个双换行符()]
  /// 转换为: I -->|找到| J["截取到第一个双换行符()"]
  static String _quoteMermaidBrackets(String code) {
    // 匹配所有中括号内容: [xxx]
    final bracketRegex = RegExp(r'\[([^\]]*)\]');

    return code.replaceAllMapped(bracketRegex, (match) {
      final content = match.group(1);
      if (content == null || content.isEmpty) return match.group(0)!;

      // 如果内容已经被引号包裹，不处理
      final trimmed = content.trim();
      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
          (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return match.group(0)!;
      }

      // 添加双引号
      return '["$content"]';
    });
  }

  /// 为Mermaid花括号内容添加引号
  /// 例如: A{是否有效}
  /// 转换为: A{"是否有效"}
  static String _quoteMermaidBraces(String code) {
    // 匹配所有花括号内容: {xxx}
    final braceRegex = RegExp(r'\{([^\}]*)\}');

    return code.replaceAllMapped(braceRegex, (match) {
      final content = match.group(1);
      if (content == null || content.isEmpty) return match.group(0)!;

      // 如果内容已经被引号包裹，不处理
      final trimmed = content.trim();
      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
          (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return match.group(0)!;
      }

      // 添加双引号
      return '{"$content"}';
    });
  }

  /// 为Mermaid竖线内容添加引号
  /// 例如: A -->|条件判断| B
  /// 转换为: A -->|"条件判断"| B
  static String _quoteMermaidPipes(String code) {
    // 匹配所有竖线内容: |xxx|
    final pipeRegex = RegExp(r'\|([^\|]*)\|');

    return code.replaceAllMapped(pipeRegex, (match) {
      final content = match.group(1);
      if (content == null || content.isEmpty) return match.group(0)!;

      // 如果内容已经被引号包裹，不处理
      final trimmed = content.trim();
      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
          (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return match.group(0)!;
      }

      // 添加双引号
      return '|"$content"|';
    });
  }

  /// 修复Mermaid格式
  static String _fixMermaidFormat(String code) {
    var fixed = code;

    // 1. 统一换行符
    fixed = fixed.replaceAll('\r\n', '\n');

    // 2. 移除多余的空行（保留单个空行）
    fixed = fixed.replaceAll(RegExp(r'\n{3,}'), '\n\n');

    // 3. Trim首尾
    fixed = fixed.trim();

    return fixed;
  }
}

/// 文本清理选项
class CleanOptions {
  /// 要移除的前缀列表（如 ['标题：', 'Title:']）
  final List<String> prefixes;

  /// 最大文本长度（超出部分将被截断）
  final int? maxLength;

  const CleanOptions({
    this.prefixes = const [],
    this.maxLength,
  });

  @override
  String toString() {
    return 'CleanOptions(prefixes: $prefixes, maxLength: $maxLength)';
  }
}
