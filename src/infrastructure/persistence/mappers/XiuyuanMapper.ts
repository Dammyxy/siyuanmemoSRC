/**
 * XiuyuanMapper - Xiuyuan 映射器
 * 
 * @module XiuyuanMapper
 * @description
 * 负责在领域模型（IXiuyuan）和持久化模型（XiuyuanPersistenceDTO）之间转换。
 * 
 * @see XiuyuanPersistenceDTO
 * @see IXiuyuan
 */

import type { IXiuyuan } from '../../../core/xiuyuan/types';
import type { XiuyuanPersistenceDTO } from '../dto/CardPersistenceDTO';

/**
 * Xiuyuan 映射器
 */
export class XiuyuanMapper {
  /**
   * 领域模型 → 持久化模型
   * 
   * @param xiuyuan 领域模型
   * @returns 持久化模型
   */
  static toPersistence(xiuyuan: IXiuyuan): XiuyuanPersistenceDTO {
    return {
      id: xiuyuan.id,
      blockIDs: xiuyuan.blockIDs,
      fields: xiuyuan.fields.map(field => ({
        name: field.name,
        blockID: field.blockID,
        marker: field.marker,
      })),
      templateID: xiuyuan.templateID,
      createdAt: xiuyuan.createdAt,
      updatedAt: xiuyuan.updatedAt,
      meta: xiuyuan.meta,
    };
  }

  /**
   * 持久化模型 → 领域模型
   * 
   * @param dto 持久化模型
   * @returns 领域模型
   */
  static toDomain(dto: XiuyuanPersistenceDTO): IXiuyuan {
    return {
      id: dto.id,
      blockIDs: dto.blockIDs,
      fields: dto.fields.map(field => ({
        name: field.name,
        blockID: field.blockID,
        marker: field.marker,
      })),
      templateID: dto.templateID,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
      meta: dto.meta,
    };
  }

  /**
   * 批量转换：领域模型 → 持久化模型
   */
  static toPersistenceBatch(xiuyuans: IXiuyuan[]): XiuyuanPersistenceDTO[] {
    return xiuyuans.map(x => this.toPersistence(x));
  }

  /**
   * 批量转换：持久化模型 → 领域模型
   */
  static toDomainBatch(dtos: XiuyuanPersistenceDTO[]): IXiuyuan[] {
    return dtos.map(dto => this.toDomain(dto));
  }
}
