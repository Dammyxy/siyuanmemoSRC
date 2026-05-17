# Semantic Exploration Redesign

Date: 2026-05-17

## Goal

Redesign Semantic Activation into a clear product surface:

- Review owns active exploration.
- Browser owns reviewable history.
- Paths contain only real, user-readable SiYuan objects.
- System inference stays on edges, explanations, and suggestions, not as fake nodes.

This design replaces the current Browser Semantic workbench shape, which mixes exploration, review handoff, and history browsing in one surface.

## Product Positioning

Semantic Exploration is not the third Neural Roam engine. It is an independent exploration tool for building understanding paths across real SiYuan blocks and flashcards.

Neural Roam engines answer: "What related nodes can I traverse?"

Semantic Exploration answers: "What path helps me understand this node, and why is this next step meaningful?"

The learning strategy lenses are:

- `接入旧知`: use existing knowledge to understand the current node.
- `重构旧知`: use the current node to revise or reinterpret previous understanding.
- `自由连接`: look for useful connections without forcing a direction.

## Surface Split

### Review Sidebar

Review owns active exploration. The Semantic panel lives in the same side area as the AI sidebar, selected through tabs:

- `AI`
- `语义`

The Semantic sidebar behaves like a companion to the current review item. It does not replace the main review flow unless the user explicitly asks to view something.

### Browser Review

Browser owns session review. It shows what happened in one Semantic session:

- session metadata
- tree/path timeline
- nodes
- edge explanations
- details
- later list
- suggestions
- archived branches

Browser does not show candidate lists by default. It offers `继续探索`, which opens or focuses Review with the current session pinned.

## Review Sidebar Binding

The sidebar has three binding states:

- `跟随当前`: follows the current review item when it has a real `blockId`.
- `已固定: {root}`: pinned to a chosen Semantic session; card changes do not change the sidebar.
- `当前不可探索`: current item has no resolvable real node.

Pin state is Review sidebar surface state, not a Semantic session event. It does not sync across windows.

When following current review:

- If the current root has an active session, open the most recently active one.
- If it has ended sessions only, show the most recent ended session with `查看回顾` and `从这里继续`.
- If it has no session, show `开始探索`.
- If several active sessions exist, open the most recent and show `其他 N 条探索`.

Any real SiYuan node can be a root if it has a resolvable `blockId`. Semantic roots are not Concept-only.

## Sidebar Layout

The Review sidebar uses this order:

1. Binding status bar
2. Current node
3. Active path
4. Candidate area
5. Suggestions

The active path shows only the selected branch, not the whole tree. Branch count appears as a compact entry, for example `3 条分支`.

For forked sessions, inherited context appears as one compact line:

`接续: 恒星演化 -> 主序星`

Browser shows the full inherited path.

## Session And Path Model

A Semantic session is a branch tree, not a single line.

Core rules:

- One session has a root.
- A session can have multiple branches.
- Edges connect real nodes.
- Active path is derived from root to active cursor.
- New branches share prefixes instead of copying path nodes.
- Branches are sorted by recent activity.

Candidate click behavior:

- Single click: follow candidate and append one edge to the active branch.
- Candidate menu `新开路径`: create a sibling branch from the current node to that candidate and switch active cursor to the new branch end.
- Double click: follow once, then view the new node in the main review content area.

Path node behavior in Review sidebar:

- Single click: move active cursor to that node.
- Double click: move active cursor and view that node.
- Moving cursor never deletes existing edges.

`撤回上一步` moves the active cursor back. It does not delete history.

`归档分支` hides an unwanted branch from default branch lists. Browser can show archived branches, and archived branches can be restored.

## Ended Sessions And Forking

Ended sessions are frozen review records.

Continuing an ended session creates a fork session, not a reopened ended session.

Fork data keeps both meanings:

- `rootNodeId`: original root
- `branchRootNodeId`: fork node
- `forkedFromSessionId`
- `forkedFromNodeId`

The forked session displays inherited context from original root to fork node, but does not copy those edges as new history.

Browser shows inherited context as dimmed history labeled `来自上一条探索`.

Review sidebar shows a compact inherited summary only.

## Real Nodes Only

User-visible paths and main candidates only contain real, locatable objects:

- flashcards
- SiYuan blocks
- documents
- headings
- list items
- paragraphs
- concept blocks, when they are real blocks

System-inferred or AI-generated content is not a path node unless the user binds or materializes it to a real object.

These stay outside the path:

- inferred concepts without blocks
- AI relation names
- hidden or implicit knowledge
- abstract explanations

They can appear as:

- edge explanations
- recommendation reasons
- evidence
- suggestions

## No Bare IDs

No user-visible path, candidate, station, later item, branch item, or detail title may use a bare block id as the primary label.

Display priority:

1. node title
2. content first line
3. document path segment
4. `内容暂不可用`

IDs belong only in debug/details sections.

Unreadable nodes:

- are filtered from candidates
- cannot be added as a new path step
- remain in historical paths if already recorded
- show `内容暂不可用`
- expose retry, locate, and debug details where appropriate

## Read Model Ownership

The backend Semantic read model returns presentation-ready data. UI surfaces do not hydrate nodes from block ids themselves.

Node presentation includes:

- `displayTitle`
- `summary`
- `nodeKind`
- `breadcrumb`
- `availability`
- `sourceBlockId`
- `cardId`
- `debugId`

Edge explanation includes:

- `fromNodeId`
- `toNodeId`
- `lens`
- `primaryExplanation`
- `reasonTags`
- `evidence`
- `createdBy`
- `createdAt`

User-selected candidate follows create edges with `createdBy = user-selected`. System recommendation evidence remains attached to the edge.

Use one core session read model with surface projections:

- `semantic.session.read`: core session/tree/presentation truth.
- `semantic.sidebar.read`: Review sidebar projection: binding state, current node, active path, branches, candidates, later, suggestions.
- `semantic.browser.read`: Browser projection: session list/tree/timeline, selected node details, edge explanations, later, suggestions, archived branches.

Candidates are dynamically computed on read. Candidate generation is not persisted as history.

Persisted session events include:

- follow
- new branch
- active cursor moved
- archive branch
- mark irrelevant
- save for later
- remove later
- suggestion created
- suggestion ignored
- suggestion bound
- suggestion materialized
- end session
- fork session

Pin/unpin is not a Semantic event.

## Candidate Area

The candidate area uses a segmented control:

- `接入旧知`
- `重构旧知`
- `自由连接`

Candidate cards show:

- title or first line
- one-line summary
- node type
- short reason tags

Candidate actions:

- click: follow
- double click: follow and view
- `稍后`: save to current session's later list
- `不相关`: mark irrelevant for current session/root
- `新开路径`: branch to this candidate from the current node

`不相关` is session/root-scoped, not global.

`稍后` is persisted to the current session and appears as a light entry at the top of the candidate area, for example `稍后 5`.

Browser also shows later items in a collapsed section.

## Suggestions

Suggestions are not real candidates.

They come from AI or system inference and remain in a separate collapsed section named `建议补充`.

Suggestion actions:

- `绑定已有块`
- `创建块`
- `忽略`

After binding or materializing, the suggestion becomes a real candidate. It does not auto-enter the path.

Newly bound/materialized candidates are pinned near the top for the current round and labeled `刚绑定` or `刚创建`.

Suggestions are persisted to the session, so Browser review can show them later.

## Browser Review

Browser shows one session at a time.

Information architecture:

- header: session title, root, status, updated time, node count
- main area: branch tree/timeline
- edge rows: short edge explanation between nodes
- detail pane: selected node details
- collapsed sections: later, suggestions, archived branches

Timeline node display:

- title or first line
- one-line summary
- type tag

Edge display:

- one short explanation line
- reason tags, for example `接入旧知 · 块链接 · 同文档`

Browser node click:

- single click: select node and show details
- double click: same as single click

Browser actions:

- `查看`: show details in Browser detail pane
- `定位`: locate source block
- `继续探索`: open or focus Review Semantic sidebar and pin this session

Browser does not control the main review content area directly.

## Main Review Content Viewing

Review sidebar `查看` reuses the main review content area as a temporary view state. It is not a modal and not a new overlay panel.

Temporary view state:

- shows `查看中: {node title}`
- has `返回当前复习`
- renders the selected block/card using existing review/block rendering paths
- keeps the Semantic sidebar unchanged
- does not affect the current review queue
- does not create a new Semantic path event

If the user views another node, the temporary view state replaces the viewed object.

No view history is kept. Semantic path history is the history.

Flashcard viewing:

- default answer hidden
- reveal is allowed
- reveal does not score
- `复习` starts a temporary one-card review

Temporary one-card review:

- scores the card through formal scheduling
- returns to the original review item after completion
- does not advance the original queue
- suppresses that reviewed card from the original queue for the current session if it would appear later

## AI Integration

AI and Semantic sidebars do not implicitly share temporary view context.

Semantic sidebar can provide a secondary action:

`分析路径`

This sends the active path, edge explanations, current node, and later summary to the AI sidebar.

AI output cannot directly create path nodes. AI output enters `建议补充`; the user must bind or create a real block/card before it can become a candidate.

## Open Questions

- Exact storage shape for branch tree and inherited context.
- How to expose `semantic.session.read`, `semantic.sidebar.read`, and `semantic.browser.read` through existing backend RPC contracts.
- How temporary review suppression integrates with current review session advancement policies.
- Whether Browser should include a weak `更多 -> 复习这张` escape hatch for flashcards. Current product direction says no primary Browser review action.

