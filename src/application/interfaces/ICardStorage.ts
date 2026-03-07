import type { FSRSCard } from '@/types/card';

/**
 * 卡片存储接口
 * 
 * 定义卡片存储的标准契约，用于依赖注入。
 * 
 * @remarks
 * 这个接口抽象了卡片的持久化操作，使得：
 * 1. 领域层不依赖具体的存储实现
 * 2. 可以轻松切换存储后端（内存、文件、数据库等）
 * 3. 便于单元测试（可以使用 Mock 实现）
 * 
 * @example
 * ```typescript
 * // 在应用服务中使用
 * class CardApplicationService {
 *   constructor(private cardStorage: ICardStorage) {}
 *   
 *   async getCard(blockId: string) {
 *     return await this.cardStorage.getCard(blockId);
 *   }
 * }
 * ```
 */
export interface ICardStorage {
  /**
   * 获取指定块 ID 的卡片
   * 
   * @param blockId - 块 ID
   * @returns 卡片对象，如果不存在则返回 null
   */
  getCard(blockId: string): Promise<FSRSCard | null>;
  
  /**
   * 保存或更新卡片
   * 
   * @param card - 要保存的卡片对象
   */
  setCard(card: FSRSCard): Promise<void>;
  
  /**
   * 删除指定块 ID 的卡片
   * 
   * @param blockId - 块 ID
   */
  deleteCard(blockId: string): Promise<void>;
  
  /**
   * 获取所有卡片
   * 
   * @returns 所有卡片的数组
   */
  getAllCards(): Promise<FSRSCard[]>;
  
  /**
   * 批量获取卡片
   * 
   * @param blockIds - 块 ID 数组
   * @returns 卡片数组
   */
  getCards?(blockIds: string[]): Promise<FSRSCard[]>;
  
  /**
   * 批量保存卡片
   * 
   * @param cards - 卡片数组
   */
  setCards?(cards: FSRSCard[]): Promise<void>;
}
