# Mermaid测试示例

这个文件包含多个mermaid代码块，用于测试优化工具。

## 示例1：简单流程图

```mermaid
graph TD
    A[开始] --> B[处理数据]
    B --> C{是否成功}
    C -->|是| D[保存结果]
    C -->|否| E[记录错误]
    D --> F[结束]
    E --> F
```

## 示例2：复杂判断流程

```mermaid
graph TD
    Start[AI输出] --> Check{包含代码块?}
    Check -->|是| Extract[提取内容]
    Check -->|否| Return[直接返回]
    Extract --> DoubleNewline{有双换行符?}
    DoubleNewline -->|找到| Cut[截取到第一个双换行符()]
    DoubleNewline -->|未找到| Keep[保留全部内容]
    Cut --> Quote[为特殊符号添加引号]
    Keep --> Quote
    Quote --> Fix[修复格式]
    Fix --> Done[返回优化后的代码]
```

## 示例3：带中文标签

```mermaid
flowchart LR
    A[用户输入] --> B{验证通过?}
    B -->|通过| C[调用API]
    B -->|失败| D[返回错误信息]
    C --> E{API响应}
    E -->|成功| F[解析JSON]
    E -->|失败| G[重试机制]
    G -->|重试成功| F
    G -->|重试失败| H[记录日志并报错]
```

## 示例4：已经优化过的代码块（不应该被修改）

```mermaid
graph TD
    A["已优化"] --> B{"判断节点"}
    B -->|"是"| C["处理"]
    B -->|"否"| D["跳过"]
```

## 示例5：状态图

```mermaid
stateDiagram-v2
    [*] --> 待处理
    待处理 --> 处理中: 开始处理
    处理中 --> 已完成: 处理成功
    处理中 --> 失败: 处理失败
    失败 --> 待处理: 重试
    已完成 --> [*]
```

## 普通文本

这段文本不应该被修改。

这里没有代码块。
