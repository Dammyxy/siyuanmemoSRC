# Requirements Document

## Introduction

本文档定义了 XiuYuan 完全统一化功能的需求。该功能旨在将所有卡片创建流程统一到 XiuYuan DDD 架构，移除旧代码，优化存储性能，并支持灵活的卡片类型和模板组合。

## Glossary

- **XiuYuan（修缘）**: 卡片来源，对应 Anki 的 Note 概念，存储字段映射和模板信息，可生成一张或多张卡片（代码中使用 xiuyuan）
- **Card（卡片）**: FSRS 卡片实体，包含调度数据和复习状态
- **Template（模板）**: 定义卡片字段结构和生成规则的配置
- **UnifiedStorageManager**: 统一存储管理器，使用 MessagePack 格式和内存索引
- **CardApplicationService**: 卡片应用服务，提供统一的卡片创建、删除、更新接口
- **BlockID**: 思源笔记中的块标识符
- **xiuyuanID**: XiuYuan 实体的唯一标识符（代码中的字段名）
- **CardType**: 卡片类型枚举（Item、Topic、Concept、Descriptor）
- **SchedulerType**: 调度器类型（fsrs-v6、a-factor、sm2）
- **DDD**: 领域驱动设计（Domain-Driven Design）

## Requirements

### Requirement 1: 统一存储管理

**User Story:** 作为系统架构师，我希望使用统一的存储管理器，以便优化查询性能并支持数十万卡片的高效管理。

#### Acceptance Criteria

1. THE UnifiedStorageManager SHALL store both XiuYuan and Card data in a single MessagePack file
2. WHEN the system loads data, THE UnifiedStorageManager SHALL build memory indexes for blockID, xiuyuanID, type, due, and priority
3. WHEN querying due cards, THE UnifiedStorageManager SHALL return results in less than 100ms for datasets containing 100,000 cards
4. WHEN creating a card, THE UnifiedStorageManager SHALL update all relevant indexes automatically
5. WHEN deleting a card, THE UnifiedStorageManager SHALL remove it from all indexes and cascade delete the XiuYuan if no other cards exist
6. THE UnifiedStorageManager SHALL use debounced auto-save with a 1-second delay to persist changes
7. WHEN data is saved, THE UnifiedStorageManager SHALL serialize using MessagePack format
8. THE UnifiedStorageManager SHALL validate data consistency and detect orphaned cards or empty XiuYuans

### Requirement 2: 统一卡片创建流程

**User Story:** 作为开发者，我希望所有卡片创建都通过 CardApplicationService，以便确保一致性并移除重复代码。

#### Acceptance Criteria

1. WHEN creating a card, THE CardApplicationService SHALL accept a CreateCardCommand with blockIds, cardType, templateId, schedulerType, and priority
2. WHEN templateId is not specified, THE CardApplicationService SHALL automatically select an appropriate template based on cardType, block count, and symbol detection
3. WHEN creating a card, THE CardApplicationService SHALL create or find the corresponding XiuYuan entity
4. WHEN a XiuYuan is created, THE CardApplicationService SHALL generate one or more Card entities based on the template's cardRules
5. WHEN a card is created, THE CardApplicationService SHALL publish a CardCreated domain event
6. THE CardApplicationService SHALL ensure every created card has a valid xiuyuanID reference
7. WHEN deleting a card, THE CardApplicationService SHALL publish a CardDeleted domain event
8. WHEN updating a card, THE CardApplicationService SHALL publish a CardUpdated domain event

### Requirement 3: 移除旧代码

**User Story:** 作为维护者，我希望移除所有旧的卡片创建代码，以便简化代码库并避免混淆。

#### Acceptance Criteria

1. THE system SHALL NOT contain any calls to createDefaultCard function
2. THE system SHALL NOT contain CardService class or its implementations
3. THE system SHALL NOT contain Card Builder Strategies
4. THE system SHALL NOT use separate xiuyuan.msgpack and cards.msgpack files
5. THE system SHALL NOT read or write priority values from block attributes
6. WHEN legacy code is encountered, THE system SHALL throw a deprecation error with migration guidance

### Requirement 4: 简化卡片类型

**User Story:** 作为用户，我希望使用简化的卡片类型系统，以便更容易理解和使用。

#### Acceptance Criteria

1. THE CardType enum SHALL contain exactly four types: Item, Topic, Concept, and Descriptor
2. THE system SHALL NOT support Incremental or Webpage card types
3. WHEN a card is created, THE system SHALL validate that the cardType is one of the four supported types
4. THE system SHALL migrate or reject any existing cards with unsupported types

### Requirement 5: 灵活的类型和模板组合

**User Story:** 作为用户，我希望类型和模板可以独立组合，以便根据需求灵活创建不同的卡片。

#### Acceptance Criteria

1. THE system SHALL allow Concept cards to use either FSRS v6 or A-Factor schedulers
2. THE system SHALL allow any CardType to be combined with any compatible template
3. WHEN a Concept card has a descriptor block, THE system SHALL default to FSRS v6 scheduler
4. WHEN a Concept card has no descriptor block, THE system SHALL default to A-Factor scheduler
5. THE system SHALL store schedulerType independently from cardType in the Card entity

### Requirement 6: 一对多关系支持

**User Story:** 作为用户，我希望一个块可以生成多张卡片，以便支持双向卡片和列表模版卡等高级功能。

#### Acceptance Criteria

1. WHEN a bidirectional template is used, THE system SHALL generate two cards (forward and reverse) from the same XiuYuan
2. WHEN a list template is used, THE system SHALL generate N cards where N equals the number of child list items
3. WHEN querying cards by blockID, THE UnifiedStorageManager SHALL return all cards associated with that block
4. WHEN querying cards by xiuyuanID, THE UnifiedStorageManager SHALL return all cards generated from that XiuYuan
5. WHEN deleting a XiuYuan, THE system SHALL cascade delete all associated cards
6. WHEN the last card of a XiuYuan is deleted, THE system SHALL automatically delete the XiuYuan

### Requirement 7: 内置模板支持

**User Story:** 作为用户，我希望系统提供多种内置模板，以便快速创建不同类型的卡片。

#### Acceptance Criteria

1. THE system SHALL provide a builtin-basic-qa template for simple question-answer cards
2. THE system SHALL provide a builtin-bidirectional template for generating forward and reverse cards
3. THE system SHALL provide a builtin-cloze template for cloze deletion cards
4. THE system SHALL provide a builtin-concept-simple template for single-block concept cards
5. THE system SHALL provide a builtin-concept-descriptor template for concept-descriptor pairs
6. THE system SHALL provide a builtin-quick-card template for fast card creation
7. THE system SHALL provide a builtin-symbol-qa template for symbol-detected cards (using <>)
8. THE system SHALL provide a builtin-quick-bidirectional template for single-block bidirectional cards
9. THE system SHALL provide a builtin-list-item template for list-based cards
10. THE TemplateRegistry SHALL register all builtin templates on initialization

### Requirement 8: 自动模板选择

**User Story:** 作为用户，我希望系统能自动选择合适的模板，以便简化卡片创建流程。

#### Acceptance Criteria

1. WHEN a block contains the <> symbol, THE system SHALL automatically select the builtin-symbol-qa template
2. WHEN creating a Concept card with two blocks, THE system SHALL automatically select the builtin-concept-descriptor template
3. WHEN creating a Concept card with one block, THE system SHALL automatically select the builtin-concept-simple template
4. WHEN creating an Item card with one block, THE system SHALL automatically select the builtin-quick-card template
5. WHEN creating an Item card with two blocks, THE system SHALL automatically select the builtin-basic-qa template
6. WHEN a templateId is explicitly provided, THE system SHALL use the specified template regardless of automatic selection rules

### Requirement 9: 优先级统一存储

**User Story:** 作为用户，我希望卡片优先级只存储在 FSRSCard 中，以便简化数据管理并避免同步问题。

#### Acceptance Criteria

1. THE system SHALL store priority values only in the FSRSCard.priority field
2. THE system SHALL NOT read priority values from block attributes
3. THE system SHALL NOT write priority values to block attributes
4. WHEN a card is created, THE system SHALL initialize priority to 50 if not specified
5. WHEN priority is updated, THE system SHALL update only the FSRSCard.priority field and trigger a save operation

### Requirement 10: Riff 同步兼容性

**User Story:** 作为用户，我希望 Riff 同步功能继续正常工作，以便与外部系统保持数据同步。

#### Acceptance Criteria

1. WHEN syncing from Riff, THE XiuyuanSyncService SHALL create a XiuYuan for each new Riff card
2. WHEN syncing from Riff, THE XiuyuanSyncService SHALL ensure every created card has a valid xiuyuanID
3. WHEN syncing from Riff, THE XiuyuanSyncService SHALL NOT overwrite existing local cards
4. WHEN syncing from Riff, THE XiuyuanSyncService SHALL automatically select an appropriate template for each card
5. WHEN syncing from Riff, THE XiuyuanSyncService SHALL preserve priority values from block attributes during initial sync
6. WHEN a Riff card is deleted, THE XiuyuanSyncService SHALL delete the corresponding local card and XiuYuan

### Requirement 11: 性能优化

**User Story:** 作为用户，我希望系统能高效处理大量卡片，以便支持数十万卡片的学习场景。

#### Acceptance Criteria

1. WHEN loading 100,000 cards, THE UnifiedStorageManager SHALL complete in less than 2 seconds
2. WHEN querying due cards, THE UnifiedStorageManager SHALL return results in less than 100ms
3. WHEN creating a card, THE UnifiedStorageManager SHALL complete in less than 50ms
4. WHEN deleting a card, THE UnifiedStorageManager SHALL complete in less than 50ms
5. WHEN updating a card, THE UnifiedStorageManager SHALL complete in less than 50ms
6. THE UnifiedStorageManager SHALL use O(1) lookup for queries by blockID, xiuyuanID, and type
7. THE UnifiedStorageManager SHALL maintain a sorted index for due date queries

### Requirement 12: 数据一致性验证

**User Story:** 作为系统管理员，我希望系统能验证数据一致性，以便及时发现和修复数据问题。

#### Acceptance Criteria

1. THE UnifiedStorageManager SHALL provide a validateConsistency method that checks for orphaned cards
2. WHEN validating consistency, THE system SHALL detect cards with missing xiuyuanID references
3. WHEN validating consistency, THE system SHALL detect XiuYuans with no associated cards
4. WHEN validating consistency, THE system SHALL detect cards referencing non-existent XiuYuans
5. THE UnifiedStorageManager SHALL provide an autoFix method that removes orphaned data
6. WHEN autoFix is called, THE system SHALL delete orphaned cards and empty XiuYuans

### Requirement 13: 领域事件支持

**User Story:** 作为开发者，我希望系统发布领域事件，以便实现松耦合的事件驱动架构。

#### Acceptance Criteria

1. WHEN a card is created, THE CardCreationService SHALL publish a CardCreated event
2. WHEN a card is deleted, THE CardDeletionService SHALL publish a CardDeleted event
3. WHEN a card is updated, THE system SHALL publish a CardUpdated event
4. THE CardCreated event SHALL contain the card ID, xiuyuanID, blockID, and cardType
5. THE CardDeleted event SHALL contain the card ID and xiuyuanID
6. THE CardUpdated event SHALL contain the card ID and updated fields

### Requirement 14: 批量操作支持

**User Story:** 作为用户，我希望系统支持批量创建卡片，以便提高大量卡片创建的效率。

#### Acceptance Criteria

1. THE UnifiedStorageManager SHALL provide a batchCreateCards method
2. WHEN batch creating cards, THE system SHALL create all cards in a single transaction
3. WHEN batch creating cards, THE system SHALL update indexes only once after all cards are created
4. WHEN batch creating cards, THE system SHALL trigger only one save operation
5. WHEN batch creating cards fails, THE system SHALL rollback all changes and return an error

### Requirement 15: 模板验证

**User Story:** 作为开发者，我希望系统能验证模板定义，以便确保模板配置正确。

#### Acceptance Criteria

1. WHEN registering a template, THE TemplateRegistry SHALL validate that the template has an id and name
2. WHEN registering a template, THE TemplateRegistry SHALL validate that the template has at least one field
3. WHEN registering a template, THE TemplateRegistry SHALL validate that the template has at least one cardRule
4. WHEN registering a template, THE TemplateRegistry SHALL validate that field names are unique
5. WHEN registering a template, THE TemplateRegistry SHALL validate that cardRules reference only existing fields
6. WHEN template validation fails, THE TemplateRegistry SHALL return a list of validation errors

