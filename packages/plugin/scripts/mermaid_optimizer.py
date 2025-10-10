#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Markdown文件处理器

负责处理markdown文件中的mermaid代码块：
- 扫描文件中的所有```mermaid```代码块
- 提取并优化每个代码块的内容
- 替换原文件中的代码块
"""

import re
from pathlib import Path
from typing import List, Tuple, Optional
from mermaid_formatter import MermaidFormatter


class MarkdownProcessor:
    """Markdown文件处理器"""

    # Mermaid代码块正则（捕获完整的代码块）
    _MERMAID_BLOCK_REGEX = re.compile(
        r'(```mermaid\s*\n)(.*?)(\n```)',
        re.DOTALL
    )

    def __init__(self, formatter: Optional[MermaidFormatter] = None):
        """
        初始化处理器
        
        Args:
            formatter: Mermaid格式化器实例，默认使用MermaidFormatter
        """
        self.formatter = formatter or MermaidFormatter()

    def process_file(self, file_path: Path, in_place: bool = True) -> Tuple[bool, str]:
        """
        处理单个markdown文件
        
        Args:
            file_path: 文件路径
            in_place: 是否直接修改原文件（True）或输出到新文件（False）
            
        Returns:
            (是否成功, 消息)
        """
        try:
            # 读取文件
            content = file_path.read_text(encoding='utf-8')
            
            # 查找所有mermaid代码块
            matches = list(self._MERMAID_BLOCK_REGEX.finditer(content))
            
            if not matches:
                return True, f"未找到mermaid代码块"
            
            # 处理每个代码块
            processed_count = 0
            new_content = content
            
            # 从后往前替换，避免索引位置变化
            for match in reversed(matches):
                original_code = match.group(2)
                
                # 优化代码
                optimized_code = self.formatter.extract_mermaid(original_code)
                
                if optimized_code and optimized_code != original_code:
                    # 构建新的代码块
                    new_block = f"{match.group(1)}{optimized_code}{match.group(3)}"
                    
                    # 替换
                    new_content = (
                        new_content[:match.start()] + 
                        new_block + 
                        new_content[match.end():]
                    )
                    processed_count += 1
            
            # 保存文件
            if processed_count > 0:
                if in_place:
                    file_path.write_text(new_content, encoding='utf-8')
                    return True, f"优化了 {processed_count} 个mermaid代码块"
                else:
                    output_path = file_path.with_suffix('.optimized.md')
                    output_path.write_text(new_content, encoding='utf-8')
                    return True, f"优化了 {processed_count} 个mermaid代码块，输出到 {output_path}"
            else:
                return True, f"找到 {len(matches)} 个mermaid代码块，但无需优化"
            
        except Exception as e:
            return False, f"处理失败: {str(e)}"

    def process_directory(
        self, 
        dir_path: Path, 
        recursive: bool = True,
        in_place: bool = True
    ) -> List[Tuple[Path, bool, str]]:
        """
        批量处理目录中的markdown文件
        
        Args:
            dir_path: 目录路径
            recursive: 是否递归处理子目录
            in_place: 是否直接修改原文件
            
        Returns:
            [(文件路径, 是否成功, 消息), ...]
        """
        results = []
        
        # 查找所有markdown文件
        pattern = '**/*.md' if recursive else '*.md'
        md_files = list(dir_path.glob(pattern))
        
        # 处理每个文件
        for md_file in md_files:
            success, message = self.process_file(md_file, in_place)
            results.append((md_file, success, message))
        
        return results

    def preview_changes(self, file_path: Path) -> List[Tuple[str, str]]:
        """
        预览文件中将要进行的更改
        
        Args:
            file_path: 文件路径
            
        Returns:
            [(原始代码, 优化后代码), ...]
        """
        changes = []
        
        try:
            content = file_path.read_text(encoding='utf-8')
            matches = self._MERMAID_BLOCK_REGEX.finditer(content)
            
            for match in matches:
                original_code = match.group(2)
                optimized_code = self.formatter.extract_mermaid(original_code)
                
                if optimized_code and optimized_code != original_code:
                    changes.append((original_code, optimized_code))
        
        except Exception:
            pass
        
        return changes

"""
Mermaid格式化工具

基于Dart版本的AIOutputFormatter，专注于Mermaid代码块的格式优化。
主要功能：
- 提取代码直到遇到说明文字
- 为中括号、花括号、竖线内容添加引号
- 统一格式（换行符等）
"""

import re
from typing import Optional


class MermaidFormatter:
    """Mermaid代码格式化器"""

    # Think标签正则
    _THINK_TAG_REGEX = re.compile(r'<think>[\s\S]*?</think>', re.MULTILINE)
    
    # Markdown代码块正则
    _MARKDOWN_CODE_BLOCK_REGEX = re.compile(
        r'```(?:json|mermaid)?\s*\n?(.*?)\n?```',
        re.DOTALL
    )

    @classmethod
    def extract_mermaid(cls, raw_text: str) -> Optional[str]:
        """
        从文本中提取并优化Mermaid代码
        
        处理流程（对应Dart版本的3/4/5步骤）：
        3. 提取代码直到遇到说明文字（连续两个换行符）
        4. 为特殊符号内容添加引号（中括号、花括号、竖线）
        5. 统一格式（换行符等）
        
        Args:
            raw_text: 原始文本（可能包含think标签、markdown包装等）
            
        Returns:
            优化后的Mermaid代码，失败返回None
        """
        try:
            if not raw_text:
                return None

            # 1. 移除think标签
            cleaned = cls._remove_think_tag(raw_text)

            # 2. 移除markdown包装
            cleaned = cls._remove_markdown_code_block(cleaned)

            # 3. 移除代码后的说明文字（遇到连续两个换行符停止）
            double_newline_index = cleaned.find('\n\n')
            if double_newline_index != -1:
                cleaned = cleaned[:double_newline_index]

            # 4. 为特殊符号内容添加引号
            cleaned = cls._quote_mermaid_brackets(cleaned)
            cleaned = cls._quote_mermaid_braces(cleaned)
            cleaned = cls._quote_mermaid_pipes(cleaned)

            # 5. 格式修正
            cleaned = cls._fix_mermaid_format(cleaned)

            return cleaned if cleaned else None

        except Exception:
            return None

    @staticmethod
    def _remove_think_tag(text: str) -> str:
        """移除think标签"""
        return MermaidFormatter._THINK_TAG_REGEX.sub('', text).strip()

    @classmethod
    def _remove_markdown_code_block(cls, text: str) -> str:
        """移除markdown代码块包装"""
        # 尝试正则匹配
        match = cls._MARKDOWN_CODE_BLOCK_REGEX.search(text)
        if match:
            content = match.group(1)
            if content:
                return content.strip()

        # 手动处理
        cleaned = text

        # 移除开头的markdown标记
        if cleaned.startswith('```json'):
            cleaned = cleaned[7:]
        elif cleaned.startswith('```mermaid'):
            cleaned = cleaned[10:]
        elif cleaned.startswith('```'):
            cleaned = cleaned[3:]

        # 移除结尾的markdown标记
        if cleaned.endswith('```'):
            cleaned = cleaned[:-3]

        return cleaned.strip()

    @staticmethod
    def _quote_mermaid_brackets(code: str) -> str:
        """
        为Mermaid中括号内容添加引号
        例如: I -->|找到| J[截取到第一个双换行符()]
        转换为: I -->|找到| J["截取到第一个双换行符()"]
        """
        def replace_bracket(match):
            content = match.group(1)
            if not content:
                return match.group(0)

            # 如果内容已经被引号包裹，不处理
            trimmed = content.strip()
            if ((trimmed.startswith('"') and trimmed.endswith('"')) or
                (trimmed.startswith("'") and trimmed.endswith("'"))):
                return match.group(0)

            # 添加双引号
            return f'["{content}"]'

        return re.sub(r'\[([^\]]*)\]', replace_bracket, code)

    @staticmethod
    def _quote_mermaid_braces(code: str) -> str:
        """
        为Mermaid花括号内容添加引号
        例如: A{是否有效}
        转换为: A{"是否有效"}
        """
        def replace_brace(match):
            content = match.group(1)
            if not content:
                return match.group(0)

            # 如果内容已经被引号包裹，不处理
            trimmed = content.strip()
            if ((trimmed.startswith('"') and trimmed.endswith('"')) or
                (trimmed.startswith("'") and trimmed.endswith("'"))):
                return match.group(0)

            # 添加双引号
            return f'{{"{content}"}}'

        return re.sub(r'\{([^\}]*)\}', replace_brace, code)

    @staticmethod
    def _quote_mermaid_pipes(code: str) -> str:
        """
        为Mermaid竖线内容添加引号
        例如: A -->|条件判断| B
        转换为: A -->|"条件判断"| B
        """
        def replace_pipe(match):
            content = match.group(1)
            if not content:
                return match.group(0)

            # 如果内容已经被引号包裹，不处理
            trimmed = content.strip()
            if ((trimmed.startswith('"') and trimmed.endswith('"')) or
                (trimmed.startswith("'") and trimmed.endswith("'"))):
                return match.group(0)

            # 添加双引号
            return f'|"{content}"|'

        return re.sub(r'\|([^\|]*)\|', replace_pipe, code)

    @staticmethod
    def _fix_mermaid_format(code: str) -> str:
        """修复Mermaid格式"""
        # 1. 统一换行符
        fixed = code.replace('\r\n', '\n')

        # 2. 移除多余的空行（保留单个空行）
        fixed = re.sub(r'\n{3,}', '\n\n', fixed)

        # 3. Trim首尾
        fixed = fixed.strip()

        return fixed

"""
Mermaid Markdown优化工具

用于优化markdown文件中的mermaid代码块格式。
支持单文件和批量处理。

使用示例：
    # 处理单个文件（直接修改）
    python mermaid_optimizer.py file.md
    
    # 处理单个文件（输出到新文件）
    python mermaid_optimizer.py file.md --no-in-place
    
    # 批量处理目录
    python mermaid_optimizer.py docs/
    
    # 批量处理目录（非递归）
    python mermaid_optimizer.py docs/ --no-recursive
    
    # 预览将要进行的更改
    python mermaid_optimizer.py file.md --preview
"""

import sys
import argparse
from pathlib import Path
from typing import List




class ColoredOutput:
    """带颜色的终端输出"""
    
    # ANSI颜色码
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    RESET = '\033[0m'
    BOLD = '\033[1m'
    
    @classmethod
    def success(cls, text: str) -> str:
        return f"{cls.GREEN}✓ {text}{cls.RESET}"
    
    @classmethod
    def warning(cls, text: str) -> str:
        return f"{cls.YELLOW}⚠ {text}{cls.RESET}"
    
    @classmethod
    def error(cls, text: str) -> str:
        return f"{cls.RED}✗ {text}{cls.RESET}"
    
    @classmethod
    def info(cls, text: str) -> str:
        return f"{cls.BLUE}ℹ {text}{cls.RESET}"
    
    @classmethod
    def highlight(cls, text: str) -> str:
        return f"{cls.CYAN}{cls.BOLD}{text}{cls.RESET}"


def print_preview(file_path: Path, changes: List[tuple]) -> None:
    """打印预览信息"""
    print(ColoredOutput.highlight(f"\n📄 {file_path}"))
    print(f"发现 {len(changes)} 个需要优化的mermaid代码块\n")
    
    for i, (original, optimized) in enumerate(changes, 1):
        print(f"{ColoredOutput.info(f'代码块 #{i}')}")
        print(f"\n{ColoredOutput.YELLOW}原始:{ColoredOutput.RESET}")
        print(f"```mermaid\n{original}\n```")
        print(f"\n{ColoredOutput.GREEN}优化后:{ColoredOutput.RESET}")
        print(f"```mermaid\n{optimized}\n```")
        print("-" * 60)


def process_single_file(
    file_path: Path, 
    processor: MarkdownProcessor,
    preview: bool = False,
    in_place: bool = True
) -> bool:
    """处理单个文件"""
    
    if not file_path.exists():
        print(ColoredOutput.error(f"文件不存在: {file_path}"))
        return False
    
    if not file_path.is_file():
        print(ColoredOutput.error(f"不是文件: {file_path}"))
        return False
    
    if file_path.suffix.lower() != '.md':
        print(ColoredOutput.error(f"不是markdown文件: {file_path}"))
        return False
    
    # 预览模式
    if preview:
        changes = processor.preview_changes(file_path)
        if changes:
            print_preview(file_path, changes)
        else:
            print(ColoredOutput.info(f"{file_path}: 无需优化"))
        return True
    
    # 处理文件
    success, message = processor.process_file(file_path, in_place)
    
    if success:
        print(ColoredOutput.success(f"{file_path}: {message}"))
    else:
        print(ColoredOutput.error(f"{file_path}: {message}"))
    
    return success


def process_directory(
    dir_path: Path,
    processor: MarkdownProcessor,
    recursive: bool = True,
    preview: bool = False,
    in_place: bool = True
) -> None:
    """处理目录"""
    
    if not dir_path.exists():
        print(ColoredOutput.error(f"目录不存在: {dir_path}"))
        return
    
    if not dir_path.is_dir():
        print(ColoredOutput.error(f"不是目录: {dir_path}"))
        return
    
    # 查找所有markdown文件
    pattern = '**/*.md' if recursive else '*.md'
    md_files = list(dir_path.glob(pattern))
    
    if not md_files:
        print(ColoredOutput.warning(f"未找到markdown文件: {dir_path}"))
        return
    
    print(ColoredOutput.info(f"找到 {len(md_files)} 个markdown文件"))
    print()
    
    # 预览模式
    if preview:
        total_changes = 0
        for md_file in md_files:
            changes = processor.preview_changes(md_file)
            if changes:
                print_preview(md_file, changes)
                total_changes += len(changes)
        
        print(ColoredOutput.highlight(f"\n总计: {total_changes} 个代码块需要优化"))
        return
    
    # 批量处理
    results = processor.process_directory(dir_path, recursive, in_place)
    
    success_count = 0
    error_count = 0
    
    for file_path, success, message in results:
        if success:
            print(ColoredOutput.success(f"{file_path}: {message}"))
            success_count += 1
        else:
            print(ColoredOutput.error(f"{file_path}: {message}"))
            error_count += 1
    
    # 打印汇总
    print()
    print(ColoredOutput.highlight("=" * 60))
    print(f"处理完成: {success_count} 成功, {error_count} 失败")


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description='优化markdown文件中的mermaid代码块格式',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s file.md              # 处理单个文件（直接修改）
  %(prog)s file.md --preview    # 预览更改
  %(prog)s docs/                # 批量处理目录（递归）
  %(prog)s docs/ --no-recursive # 批量处理目录（非递归）
  %(prog)s file.md --no-in-place # 输出到新文件
        """
    )
    
    parser.add_argument(
        'path',
        type=str,
        help='markdown文件或目录路径'
    )
    
    parser.add_argument(
        '--preview',
        action='store_true',
        help='预览将要进行的更改，不实际修改文件'
    )
    
    parser.add_argument(
        '--no-in-place',
        action='store_true',
        help='不直接修改原文件，输出到新文件（文件名加.optimized后缀）'
    )
    
    parser.add_argument(
        '--no-recursive',
        action='store_true',
        help='处理目录时不递归子目录'
    )
    
    parser.add_argument(
        '--version',
        action='version',
        version='%(prog)s 1.0.0'
    )
    
    args = parser.parse_args()
    
    # 解析路径
    path = Path(args.path)
    in_place = not args.no_in_place
    recursive = not args.no_recursive
    
    # 创建处理器
    formatter = MermaidFormatter()
    processor = MarkdownProcessor(formatter)
    
    # 处理
    try:
        if path.is_file():
            success = process_single_file(path, processor, args.preview, in_place)
            sys.exit(0 if success else 1)
        elif path.is_dir():
            process_directory(path, processor, recursive, args.preview, in_place)
            sys.exit(0)
        else:
            print(ColoredOutput.error(f"路径不存在: {path}"))
            sys.exit(1)
    
    except KeyboardInterrupt:
        print()
        print(ColoredOutput.warning("操作已取消"))
        sys.exit(130)
    
    except Exception as e:
        print(ColoredOutput.error(f"发生错误: {str(e)}"))
        sys.exit(1)


if __name__ == '__main__':
    main()
