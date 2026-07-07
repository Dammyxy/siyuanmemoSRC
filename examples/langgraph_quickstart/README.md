# LangChain / LangGraph Quickstart

这个目录是一个最小可运行示例，用来理解：

- `langchain-openai`: 连接 OpenAI 聊天模型。
- `langchain`: 提供统一的模型调用和应用组合接口。
- `langgraph`: 把多个步骤编排成一个状态图工作流。

## 运行前准备

你已经安装过：

```powershell
pip install langgraph langchain langchain-openai
```

还需要设置 OpenAI API key：

```powershell
$env:OPENAI_API_KEY="你的_api_key"
```

可选：指定模型名。默认使用 `gpt-4o-mini`：

```powershell
$env:OPENAI_MODEL="gpt-4o-mini"
```

## 运行

在真正的项目目录执行：

```powershell
cd H:\project-F\flashcard\.worktrees\siyuan-plugin-siyuanmemo\kernel-companion-p0
python .\examples\langgraph_quickstart\quickstart.py
```

## 这段示例做了什么

`quickstart.py` 里有两个节点：

1. `answer_question`: 先调用模型回答问题。
2. `polish_answer`: 再调用模型，把回答改得更适合初学者。

LangGraph 用 `GraphState` 在节点之间传递状态：

```text
question -> draft -> final_answer
```

你可以把它理解成“可编排、可扩展、可循环的 Agent 流程”。以后要加搜索、读文件、写卡片、调用工具，就继续往这个图里加节点。

## 下一步可以怎么改

- 把 `question` 改成用户输入。
- 加一个“判断是否需要补充资料”的分支节点。
- 加一个“生成 Anki/RemNote 卡片”的节点。
- 加一个“把结果保存到 Markdown 文件”的节点。
