# 数据存储方案

## 1. 存储架构

### 1.1 统一存储文件

```
data/
  └── unified-cards.msgpack  // 统一存储（Xiuyuan + Card）
```

**不再使用**：
- ❌ `xiuyuan.msgpack`（旧的 Xiuyuan 存储）
- ❌ `cards.msgpack`（旧的 FSRS 卡片存储）

### 1.2 存储结构

```typescript
interface UnifiedCardStore {
  version: number;  // 当前版本：1
  
  // Xiuyuan 数据
  xiuyuans: Record<string, {
    id: string;                    // xy_1234567890_abc123
    blockIDs: string[];            // 关联的块 ID 列表
    templateID: string;            // 模板 ID
    fields: Array<{
      name: string;                // 字段名
      blockID: string;             // 字段对应的块 ID
    }>;
    createdAt: number;
    updatedAt: number;
    meta?: Record<string, any>;    // 扩展元数据
  }>;
  
  // FSRS 卡片数据
  cards: Record<string, {
    // === 身份 ===
    id: string;
    xiuyuanID: string;             // ✅ 必需，关联到 Xiuyuan
    blockId: string;
    
    // === FSRS 核心字段 ===
    due: number;
    stability: number;
    difficulty: number;
    reps: number;
    lapses: number;
    state: number;
    lastReview: number;
    elapsedDays: number;
    scheduledDays: number;
    learning_step: number;
    
    // === 类型和模板 ===
    type: 'item' | 'topic' | 'concept' | 'descriptor';
    templateID: string;
    schedulerType: 'fsrs-v6' | 'a-factor' | 'sm2';
    
    // === 优先级（统一） ===
    priority: number;              // 0-100
    
    // === 扩展功能 ===
    tags: string[];
    leechCount: number;
    isLeech: boolean;
    skipped: boolean;
    skipNote?: string;
    skipUntil?: number;
    
    // === 元数据 ===
    meta: {
      xiuyuanID: string;
      templateID: string;
      ruleIndex: number;
      typeMarker?: string;
      frontBlockIDs: string[];
      backBlockIDs: string[];
      fieldMapping: Record<string, string>;
      frontFields: string[];
      backFields: string[];
      // 列表模版卡专用
      cue?: string;
      answer?: string;
      allChildren?: Array<{
        id: string;
        cue: string;
        answer: string;
        index: number;
      }>;
      currentIndex?: number;
    };
    
    // === 时间戳 ===
    createdAt: number;
    updatedAt: number;
  }>;
}
```

## 2. 内存索引

### 2.1 索引结构

```typescript
class UnifiedStorageManager {
  // 数据存储
  private xiuyuans: Map<string, IXiuyuan> = new Map();
  private cards: Map<string, FSRSCard> = new Map();
  
  // 内存索引（加载时构建，不持久化）
  private indexByBlockID: Map<string, string[]> = new Map();
  private indexByXiuyuanID: Map<string, string[]> = new Map();
  private indexByType: Map<CardType, string[]> = new Map();
  private indexByDue: FSRSCard[] = [];
  private indexByPriority: Map<number, string[]> = new Map();
  
  // 脏标记
  private dirty: boolean = false;
}
```

### 2.2 索引构建

```typescript
private rebuildIndexes(): void {
  console.time('[Storage] Rebuild indexes');
  
  // 清空索引
  this.indexByBlockID.clear();
  this.indexByXiuyuanID.clear();
  this.indexByType.clear();
  this.indexByDue = [];
  this.indexByPriority.clear();
  
  // 重建索引
  for (const card of this.cards.values()) {
    // 1. blockID 索引
    const blockCards = this.indexByBlockID.get(card.blockId) || [];
    blockCards.push(card.id);
    this.indexByBlockID.set(card.blockId, blockCards);
    
    // 2. xiuyuanID 索引
    if (card.meta?.xiuyuanID) {
      const xiuyuanCards = this.indexByXiuyuanID.get(card.meta.xiuyuanID) || [];
      xiuyuanCards.push(card.id);
      this.indexByXiuyuanID.set(card.meta.xiuyuanID, xiuyuanCards);
    }
    
    // 3. type 索引
    const typeCards = this.indexByType.get(card.type) || [];
    typeCards.push(card.id);
    this.indexByType.set(card.type, typeCards);
    
    // 4. priority 索引
    const priorityCards = this.indexByPriority.get(card.priority) || [];
    priorityCards.push(card.id);
    this.indexByPriority.set(card.priority, priorityCards);
    
    // 5. due 索引
    this.indexByDue.push(card);
  }
  
  // 按 due 排序
  this.indexByDue.sort((a, b) => a.due - b.due);
  
  console.timeEnd('[Storage] Rebuild indexes');
}
```

## 3. CRUD 操作

### 3.1 创建（Create）

```typescript
async createCard(xiuyuan: IXiuyuan, card: FSRSCard): Promise<Result<void>> {
  // 1. 保存 Xiuyuan
  this.xiuyuans.set(xiuyuan.id, xiuyuan);
  
  // 2. 保存 Card
  this.cards.set(card.id, card);
  
  // 3. 更新索引
  this.updateIndexesForCard(card, 'add');
  
  // 4. 标记为脏
  this.dirty = true;
  
  // 5. 自动保存（防抖）
  this.scheduleSave();
  
  return ok(undefined);
}
```

### 3.2 读取（Read）

```typescript
// 按 ID 查询
getCard(cardId: string): FSRSCard | undefined {
  return this.cards.get(cardId);
}

// 按块 ID 查询
getCardsByBlockId(blockId: string): FSRSCard[] {
  const cardIds = this.indexByBlockID.get(blockId) || [];
  return cardIds.map(id => this.cards.get(id)!).filter(Boolean);
}

// 按 Xiuyuan ID 查询
getCardsByXiuyuanId(xiuyuanId: string): FSRSCard[] {
  const cardIds = this.indexByXiuyuanID.get(xiuyuanId) || [];
  return cardIds.map(id => this.cards.get(id)!).filter(Boolean);
}

// 按类型查询
getCardsByType(type: CardType): FSRSCard[] {
  const cardIds = this.indexByType.get(type) || [];
  return cardIds.map(id => this.cards.get(id)!).filter(Boolean);
}

// 获取到期卡片
getDueCards(limit: number = 100): FSRSCard[] {
  const now = Date.now();
  return this.indexByDue
    .filter(card => card.due <= now && !card.skipped)
    .slice(0, limit);
}

// 获取所有卡片
getAllCards(): FSRSCard[] {
  return Array.from(this.cards.values());
}
```

### 3.3 更新（Update）

```typescript
async updateCard(card: FSRSCard): Promise<Result<void>> {
  // 1. 检查卡片是否存在
  if (!this.cards.has(card.id)) {
    return err(new Error(`Card not found: ${card.id}`));
  }
  
  // 2. 获取旧卡片
  const oldCard = this.cards.get(card.id)!;
  
  // 3. 更新卡片
  card.updatedAt = Date.now();
  this.cards.set(card.id, card);
  
  // 4. 更新索引（如果关键字段变化）
  if (oldCard.blockId !== card.blockId || 
      oldCard.type !== card.type || 
      oldCard.priority !== card.priority) {
    this.updateIndexesForCard(oldCard, 'remove');
    this.updateIndexesForCard(card, 'add');
  }
  
  // 5. 重新排序 due 索引
  this.indexByDue.sort((a, b) => a.due - b.due);
  
  // 6. 标记为脏
  this.dirty = true;
  
  // 7. 自动保存
  this.scheduleSave();
  
  return ok(undefined);
}
```

### 3.4 删除（Delete）

```typescript
async deleteCard(cardId: string): Promise<Result<void>> {
  // 1. 获取卡片
  const card = this.cards.get(cardId);
  if (!card) {
    return err(new Error(`Card not found: ${cardId}`));
  }
  
  // 2. 删除卡片
  this.cards.delete(cardId);
  
  // 3. 更新索引
  this.updateIndexesForCard(card, 'remove');
  
  // 4. 检查是否需要删除 Xiuyuan
  const xiuyuanCards = this.getCardsByXiuyuanId(card.meta.xiuyuanID);
  if (xiuyuanCards.length === 0) {
    this.xiuyuans.delete(card.meta.xiuyuanID);
  }
  
  // 5. 标记为脏
  this.dirty = true;
  
  // 6. 自动保存
  this.scheduleSave();
  
  return ok(undefined);
}

// 删除 Xiuyuan（级联删除所有卡片）
async deleteXiuyuan(xiuyuanId: string): Promise<Result<void>> {
  // 1. 获取所有关联的卡片
  const cards = this.getCardsByXiuyuanId(xiuyuanId);
  
  // 2. 删除所有卡片
  for (const card of cards) {
    await this.deleteCard(card.id);
  }
  
  // 3. 删除 Xiuyuan
  this.xiuyuans.delete(xiuyuanId);
  
  // 4. 标记为脏
  this.dirty = true;
  
  // 5. 自动保存
  this.scheduleSave();
  
  return ok(undefined);
}
```

## 4. 持久化策略

### 4.1 自动保存（防抖）

```typescript
private saveTimer: NodeJS.Timeout | null = null;
private readonly SAVE_DELAY = 1000;  // 1秒防抖

private scheduleSave(): void {
  if (this.saveTimer) {
    clearTimeout(this.saveTimer);
  }
  
  this.saveTimer = setTimeout(() => {
    this.save();
  }, this.SAVE_DELAY);
}
```

### 4.2 保存到文件

```typescript
async save(): Promise<Result<void>> {
  if (!this.dirty) {
    return ok(undefined);
  }
  
  try {
    console.time('[Storage] Save to file');
    
    // 1. 构建存储数据
    const data: UnifiedCardStore = {
      version: 1,
      xiuyuans: Object.fromEntries(this.xiuyuans),
      cards: Object.fromEntries(this.cards),
    };
    
    // 2. 序列化为 MessagePack
    const buffer = encode(data);
    
    // 3. 写入文件
    await this.plugin.saveData('unified-cards.msgpack', buffer);
    
    // 4. 清除脏标记
    this.dirty = false;
    
    console.timeEnd('[Storage] Save to file');
    console.log(`[Storage] Saved ${this.cards.size} cards, ${this.xiuyuans.size} xiuyuans`);
    
    return ok(undefined);
  } catch (error) {
    console.error('[Storage] Save failed:', error);
    return err(error as Error);
  }
}
```

### 4.3 从文件加载

```typescript
async load(): Promise<Result<void>> {
  try {
    console.time('[Storage] Load from file');
    
    // 1. 读取文件
    const buffer = await this.plugin.loadData('unified-cards.msgpack');
    if (!buffer) {
      console.log('[Storage] No data file found, using empty store');
      return ok(undefined);
    }
    
    // 2. 反序列化
    const data = decode(buffer) as UnifiedCardStore;
    
    // 3. 加载到内存
    this.xiuyuans = new Map(Object.entries(data.xiuyuans));
    this.cards = new Map(Object.entries(data.cards));
    
    // 4. 重建索引
    this.rebuildIndexes();
    
    // 5. 清除脏标记
    this.dirty = false;
    
    console.timeEnd('[Storage] Load from file');
    console.log(`[Storage] Loaded ${this.cards.size} cards, ${this.xiuyuans.size} xiuyuans`);
    
    return ok(undefined);
  } catch (error) {
    console.error('[Storage] Load failed:', error);
    return err(error as Error);
  }
}
```

## 5. 性能优化

### 5.1 批量操作

```typescript
async batchCreateCards(
  xiuyuan: IXiuyuan,
  cards: FSRSCard[]
): Promise<Result<void>> {
  // 1. 保存 Xiuyuan
  this.xiuyuans.set(xiuyuan.id, xiuyuan);
  
  // 2. 批量保存 Card
  for (const card of cards) {
    this.cards.set(card.id, card);
    this.updateIndexesForCard(card, 'add');
  }
  
  // 3. 一次性排序
  this.indexByDue.sort((a, b) => a.due - b.due);
  
  // 4. 标记为脏
  this.dirty = true;
  
  // 5. 自动保存
  this.scheduleSave();
  
  return ok(undefined);
}
```

### 5.2 增量更新索引

```typescript
private updateIndexesForCard(
  card: FSRSCard,
  action: 'add' | 'remove'
): void {
  if (action === 'add') {
    // 添加到索引
    this.addToIndex(this.indexByBlockID, card.blockId, card.id);
    this.addToIndex(this.indexByXiuyuanID, card.meta.xiuyuanID, card.id);
    this.addToIndex(this.indexByType, card.type, card.id);
    this.addToIndex(this.indexByPriority, card.priority, card.id);
  } else {
    // 从索引移除
    this.removeFromIndex(this.indexByBlockID, card.blockId, card.id);
    this.removeFromIndex(this.indexByXiuyuanID, card.meta.xiuyuanID, card.id);
    this.removeFromIndex(this.indexByType, card.type, card.id);
    this.removeFromIndex(this.indexByPriority, card.priority, card.id);
    
    // 从 due 索引移除
    const index = this.indexByDue.findIndex(c => c.id === card.id);
    if (index !== -1) {
      this.indexByDue.splice(index, 1);
    }
  }
}
```

### 5.3 查询缓存

```typescript
private queryCache: Map<string, any> = new Map();
private readonly CACHE_TTL = 5000;  // 5秒缓存

async getDueCardsWithCache(limit: number): Promise<FSRSCard[]> {
  const cacheKey = `due:${limit}`;
  const cached = this.queryCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
    return cached.data;
  }
  
  const data = this.getDueCards(limit);
  this.queryCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });
  
  return data;
}
```

## 6. 数据一致性

### 6.1 验证规则

```typescript
async validateConsistency(): Promise<string[]> {
  const errors: string[] = [];
  
  // 1. 检查所有卡片都有 xiuyuanID
  for (const card of this.cards.values()) {
    if (!card.meta?.xiuyuanID) {
      errors.push(`Card ${card.id} missing xiuyuanID`);
    }
  }
  
  // 2. 检查所有 xiuyuanID 都存在
  for (const card of this.cards.values()) {
    if (card.meta?.xiuyuanID && !this.xiuyuans.has(card.meta.xiuyuanID)) {
      errors.push(`Card ${card.id} references non-existent Xiuyuan ${card.meta.xiuyuanID}`);
    }
  }
  
  // 3. 检查所有 Xiuyuan 都有至少一张卡片
  for (const xiuyuan of this.xiuyuans.values()) {
    const cards = this.getCardsByXiuyuanId(xiuyuan.id);
    if (cards.length === 0) {
      errors.push(`Xiuyuan ${xiuyuan.id} has no cards`);
    }
  }
  
  return errors;
}
```

### 6.2 自动修复

```typescript
async autoFix(): Promise<number> {
  let fixedCount = 0;
  
  // 1. 删除孤儿卡片
  for (const card of this.cards.values()) {
    if (card.meta?.xiuyuanID && !this.xiuyuans.has(card.meta.xiuyuanID)) {
      await this.deleteCard(card.id);
      fixedCount++;
    }
  }
  
  // 2. 删除空 Xiuyuan
  for (const xiuyuan of this.xiuyuans.values()) {
    const cards = this.getCardsByXiuyuanId(xiuyuan.id);
    if (cards.length === 0) {
      this.xiuyuans.delete(xiuyuan.id);
      fixedCount++;
    }
  }
  
  return fixedCount;
}
```

## 7. 统计信息

```typescript
getStats(): {
  totalCards: number;
  totalXiuyuans: number;
  cardsByType: Record<CardType, number>;
  dueCards: number;
  newCards: number;
  learningCards: number;
  reviewCards: number;
} {
  const now = Date.now();
  
  return {
    totalCards: this.cards.size,
    totalXiuyuans: this.xiuyuans.size,
    cardsByType: {
      item: this.indexByType.get('item')?.length || 0,
      topic: this.indexByType.get('topic')?.length || 0,
      concept: this.indexByType.get('concept')?.length || 0,
      descriptor: this.indexByType.get('descriptor')?.length || 0,
    },
    dueCards: this.indexByDue.filter(c => c.due <= now).length,
    newCards: Array.from(this.cards.values()).filter(c => c.state === 0).length,
    learningCards: Array.from(this.cards.values()).filter(c => c.state === 1).length,
    reviewCards: Array.from(this.cards.values()).filter(c => c.state === 2).length,
  };
}
```
