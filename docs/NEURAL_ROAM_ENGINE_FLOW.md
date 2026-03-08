# 神经漫游引擎流程图

本文档说明当前生效的神经漫游引擎实现，以及它在浏览器、复习界面和队列内部的实际运行规则。

当前主链路：

- `UnifiedDataSourceManager -> NeuralRoamQueue -> ConceptNeuralQueue -> ConceptQueryEngine`
- 仓库里虽然还保留了旧版 `NeuralQueue.ts` / `QueryEngine.ts`，但当前 `neural-roam` 队列实例并不走那条路径。

## 1. 当前架构流程

```mermaid
flowchart TD
    UI["界面层<br/>Browser / Review"] --> UDSM["UnifiedDataSourceManager<br/>createQueue('neural-roam')"]
    UDSM --> NRQ["NeuralRoamQueue"]
    NRQ --> CNQ["ConceptNeuralQueue"]
    CNQ --> CQE["ConceptQueryEngine"]

    subgraph STATE["持久化状态 + 会话状态"]
        SEED["seedPool<br/>仅概念节点"]
        ANCHOR["anchorPool<br/>概念节点或虚拟节点"]
        SESSION["session<br/>history / displayPath / navigationMode / bookmark"]
    end

    NRQ <--> SEED
    NRQ <--> ANCHOR
    NRQ <--> SESSION

    CNQ <--> SEED
    CNQ <--> ANCHOR
    CNQ <--> SESSION

    CQE --> B15["反向链接<br/>权重 15"]
    CQE --> O10["直接出链<br/>权重 10"]
    CQE --> I6["间接出链<br/>权重 6"]
    CQE --> D3["描述符块<br/>权重 3"]

    B15 --> CNQ
    O10 --> CNQ
    I6 --> CNQ
    D3 --> CNQ

    CNQ --> NEXT["getNextCard()"]
    NEXT --> CARD["返回下一张漫游节点"]
```

## 2. 下一节点选择流程

```mermaid
flowchart TD
    START["请求下一节点"] --> MODE{"当前是否为 follow 模式"}

    MODE -- 是 --> PATHNEXT{"displayPath 中是否还有下一个节点"}
    PATHNEXT -- 是 --> FOLLOWRET["返回路径中的下一个节点"]
    PATHNEXT -- 否 --> TOEXPLORE["切回 explore 模式"]

    MODE -- 否 --> FOCUSCHECK
    TOEXPLORE --> FOCUSCHECK{"已有 currentFocus 且不需要轮换"}

    FOCUSCHECK -- 否 --> PICKFOCUS["从 seedPool 选择下一个 focus<br/>按优先级加权随机"]
    PICKFOCUS --> FOUND{"是否找到可用 focus"}
    FOUND -- 否 --> EMPTY["返回 null"]
    FOUND -- 是 --> FETCH

    FOCUSCHECK -- 是 --> FETCH["获取 currentFocus 的邻居节点"]

    FETCH --> UNVISITED{"是否存在未访问邻居"}
    UNVISITED -- 是 --> PICKNEIGHBOR["按关联权重加权随机选择邻居"]
    PICKNEIGHBOR --> ACTIVATE["激活节点<br/>追加 displayPath<br/>写入 history<br/>标记 visited"]
    ACTIVATE --> PREFETCH["预取最可能的 2 个后续邻居"]
    PREFETCH --> RETURNNODE["返回该节点"]

    UNVISITED -- 否 --> FOCUSSELF{"focus 自身是否尚未访问"}
    FOCUSSELF -- 是 --> RETURNFOCUS["先返回一次 focus 节点"]
    RETURNFOCUS --> RETURNNODE

    FOCUSSELF -- 否 --> EXHAUST["将当前 focus 标记为 exhausted"]
    EXHAUST --> ROTATE["轮换到下一个 focus"]
    ROTATE --> FOCUSCHECK
```

## 3. 焦点与分支流程

```mermaid
flowchart TD
    LOCK["lock-focus / setCurrentFocus"] --> ANCHOR["将节点加入 anchorPool"]
    ANCHOR --> CONCEPT{"是否为概念节点"}
    CONCEPT -- 是 --> SEED["确保该节点存在于 seedPool"]
    CONCEPT -- 否 --> VIRTUAL["作为虚拟锚点保留"]
    SEED --> BOOKMARK["可选：将当前路径保存为书签"]
    VIRTUAL --> BOOKMARK
    BOOKMARK --> NEWFOCUS["设置 currentFocus 并开始漫游"]

    JUMP["jumpToHistoryNode"] --> FOLLOW["切换到 follow 模式"]
    FOLLOW --> BRANCH{"是否从路径中段重新探索"}
    BRANCH -- 是 --> TRUNCATE["截断后续路径<br/>开启新分支"]
    BRANCH -- 否 --> KEEP["沿当前路径继续"]

    CLEAR["clearHistory"] --> RESET["仅重置会话导航状态"]
    RESET --> KEEPPOOLS["保留 seedPool 和 anchorPool"]
```

## 4. 实际规则

- 队列类型字面量仍然是 `neural-roam`。
- 浏览器切到神经漫游时，卡片类型过滤会被强制为 `concept-only`。
- 只有 Concept 卡可以加入 `seedPool`，也就是漫游种子池。
- 浏览器显示的神经漫游数量，本质上是 `seedPool` 的数量，不是历史记录长度。
- `seedPool` 用于自动轮换 focus。
- `anchorPool` 用于锁定焦点、跳转历史节点、作为分支重启点。
- 如果一个节点同时通过多种关系被命中，只保留最高权重的那条关系。
- `explore` 模式会继续向图上的邻居扩散。
- `follow` 模式只沿着现有的 `displayPath` 往前走。
- `clearHistory()` 只会清理会话导航状态，不会删除种子和锚点。

## 5. 关键参数

- `neighborsPerRound = 5`
- `prefetchNeighborCount = 2`
- `historyLimit = 300`
- 种子优先级：
  - 普通：`0.65`
  - 高优先级：`0.9`
- focus 选择加权：
  - 概念节点会额外获得 `1.6x` 加成

## 6. 补充说明

- `NeuralRoamQueue.handleReview()` 中的评分结果，不直接决定漫游路径的下一跳。
- 当前代码持久化使用的是 `v5` 状态结构。
- 有些旧文档还写着 `v3`，以当前源码实现为准。
