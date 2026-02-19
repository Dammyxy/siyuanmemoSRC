/**
 * MigrationService - Xiuyuan 卡片迁移服务
 * 
 * @deprecated 此服务为一次性迁移工具，未来可能移除
 * 
 * 负责将现有的 Xiuyuan 卡片迁移到新的 Riff 同步机制。
 * 
 * @module services/MigrationService
 */

import type { XiuyuanService } from '@/core/xiuyuan/service';
import type { StorageManager } from '@/core/storage/manager';
import * as riffAPI from '@/core/siyuan/riff';
import { setBlockAttrs } from '@/core/siyuan/api';

/**
 * 迁移结果
 */
export interface MigrationResult {
  /** 总共的 Xiuyuan 数量 */
  total: number;
  /** 成功迁移的数量 */
  migrated: number;
  /** 失败的数量 */
  failed: number;
  /** 错误详情 */
  errors: Array<{ xiuyuanID: string; error: string }>;
}

/**
 * Xiuyuan 卡片迁移服务
 */
export class MigrationService {
  constructor(
    private xiuyuanService: XiuyuanService,
    private storageManager: StorageManager
  ) {}

  /**
   * 迁移现有 Xiuyuan 卡片到 Riff
   * 
   * @returns 迁移结果
   * 
   * @description
   * 遍历所有 Xiuyuan 卡片，检查是否已在 Riff 中。
   * 未在 Riff 中的卡片将：
   * 1. 添加代表块到 Riff
   * 2. 标记块属性
   * 3. 更新所有 FSRSCard 的 blockId
   * 
   * @example
   * ```typescript
   * const result = await migrationService.migrateExistingXiuyuanCards();
   * console.log(`迁移完成: ${result.migrated}/${result.total}`);
   * if (result.failed > 0) {
   *   console.error('迁移失败:', result.errors);
   * }
   * ```
   */
  async migrateExistingXiuyuanCards(): Promise<MigrationResult> {
    console.log('[MigrationService] 开始迁移 Xiuyuan 卡片...');
    
    const xiuyuans = this.xiuyuanService.getAllXiuyuans();
    let migratedCount = 0;
    let failedCount = 0;
    const errors: Array<{ xiuyuanID: string; error: string }> = [];

    console.log(`[MigrationService] 找到 ${xiuyuans.length} 个 Xiuyuan`);

    for (const xiuyuan of xiuyuans) {
      try {
        console.log(`[MigrationService] 处理 Xiuyuan: ${xiuyuan.id}`);
        
        // 1. 选择代表块
        const representativeBlockID = this.selectRepresentativeBlock(xiuyuan);
        console.log(`[MigrationService] 代表块: ${representativeBlockID}`);

        // 2. 检查是否已在 Riff 中
        const riffCards = await riffAPI.getRiffCardsByBlockIDs([representativeBlockID]);
        
        if (riffCards.length > 0) {
          console.log(`[MigrationService] Xiuyuan ${xiuyuan.id} 已在 Riff 中，跳过`);
          continue;
        }

        // 3. 添加到 Riff
        console.log(`[MigrationService] 添加到 Riff: ${representativeBlockID}`);
        await riffAPI.addRiffCards(riffAPI.BUILTIN_DECK_ID, [representativeBlockID]);

        // 4. 标记块属性
        console.log(`[MigrationService] 标记块属性`);
        await setBlockAttrs(representativeBlockID, {
          'custom-fsrs-xiuyuan-id': xiuyuan.id,
          'custom-fsrs-template-id': xiuyuan.templateID,
        });

        // 5. 更新所有 FSRSCard 的 blockId
        console.log(`[MigrationService] 更新 FSRSCard 的 blockId`);
        const mappings = this.xiuyuanService.getMappingsByXiuyuanID(xiuyuan.id);
        
        for (const mapping of mappings) {
          const card = this.storageManager.getCard(mapping.cardID);
          if (card) {
            // 更新 blockId 为代表块
            card.blockId = representativeBlockID;
            this.storageManager.setCard(card);
            console.log(`[MigrationService] 更新卡片 ${card.id} 的 blockId`);
          }
        }

        migratedCount++;
        console.log(`[MigrationService] Xiuyuan ${xiuyuan.id} 迁移成功`);
      } catch (error) {
        failedCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[MigrationService] Xiuyuan ${xiuyuan.id} 迁移失败:`, errorMessage);
        errors.push({
          xiuyuanID: xiuyuan.id,
          error: errorMessage,
        });
      }
    }

    // 保存更新后的卡片
    if (migratedCount > 0) {
      console.log('[MigrationService] 保存更新后的卡片...');
      await this.storageManager.saveCards();
    }

    const result: MigrationResult = {
      total: xiuyuans.length,
      migrated: migratedCount,
      failed: failedCount,
      errors,
    };

    console.log('[MigrationService] 迁移完成:', result);
    return result;
  }

  /**
   * 选择代表块
   * 
   * @param xiuyuan - Xiuyuan 对象
   * @returns 代表块 ID
   * 
   * @private
   * @description
   * 根据模版类型选择合适的代表块：
   * - builtin-list-item: 父列表项（第一个块）
   * - builtin-concept-descriptor: 描述符块
   * - builtin-bidirectional: 第一个块
   * - 其他: 第一个块
   */
  private selectRepresentativeBlock(xiuyuan: any): string {
    const { blockIDs, templateID, fields } = xiuyuan;

    if (!blockIDs || blockIDs.length === 0) {
      throw new Error('blockIDs cannot be empty');
    }

    // 构建字段映射
    const fieldMapping: Record<string, string> = {};
    if (fields) {
      for (const field of fields) {
        fieldMapping[field.name] = field.blockID;
      }
    }

    switch (templateID) {
      case 'builtin-list-item':
        // 列表模版：选择父列表项（第一个块）
        return blockIDs[0];

      case 'builtin-concept-descriptor':
        // 概念-描述符模版：选择描述符块
        return fieldMapping['descriptor'] || blockIDs[0];

      case 'builtin-bidirectional':
        // 双向卡片：选择第一个块
        return blockIDs[0];

      default:
        // 其他模版：默认选择第一个块
        return blockIDs[0];
    }
  }
}
