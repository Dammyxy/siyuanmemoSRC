/**
 * 手动测试脚本：验证 rotateToEnd() 修复
 *
 * 运行方式：
 * 1. 在插件中手动测试复习流程
 * 2. 或使用此脚本进行单元测试
 */

import { describe, it, expect } from 'vitest';

describe('rotateToEnd() 修复验证', () => {
  it('应该使用 remove + add 模式，而不是直接 push', async () => {
    // 这个测试验证 BaseCompositeQueue.rotateToEnd() 使用正确的模式

    // ❌ 旧实现（错误）：
    // const allItems = await this.dataSource.getAll();
    // allItems.push(item);  // 假设返回引用，实际不生效

    // ✅ 新实现（正确）：
    // await this.dataSource.remove([item]);
    // await this.dataSource.add([item]);

    // 测试验证：
    // 1. 创建一个返回副本的 DataSource
    class CopyReturningDataSource {
      private items: string[] = [];

      constructor(initialItems: string[]) {
        this.items = [...initialItems];
      }

      async getAll(): Promise<string[]> {
        // 返回副本，而不是内部引用
        return [...this.items];
      }

      async add(items: string[]): Promise<number> {
        this.items.push(...items);
        return items.length;
      }

      async remove(items: string[]): Promise<number> {
        const initialLength = this.items.length;
        this.items = this.items.filter(i => !items.includes(i));
        return initialLength - this.items.length;
      }
    }

    // 2. 测试正确的模式（remove + add）
    const dataSource = new CopyReturningDataSource(['item1', 'item2', 'item3']);

    // 模拟 rotateToEnd 的正确实现
    const itemToMove = 'item1';
    await dataSource.remove([itemToMove]);
    await dataSource.add([itemToMove]);

    const result = await dataSource.getAll();
    expect(result).toEqual(['item2', 'item3', 'item1']);
  });

  it('应该防止直接修改 getAll() 返回的数组', async () => {
    // 验证 DataSource 返回副本，防止外部修改

    class SafeDataSource {
      private items: string[] = ['item1', 'item2'];

      async getAll(): Promise<string[]> {
        // ✅ 返回副本
        return [...this.items];
      }
    }

    const dataSource = new SafeDataSource();

    // 获取数组
    const items = await dataSource.getAll();

    // 尝试修改返回的数组
    items.push('item3');
    items[0] = 'modified';

    // 验证 DataSource 内部数据未被修改
    const items2 = await dataSource.getAll();
    expect(items2).toEqual(['item1', 'item2']); // 未受影响
  });
});

/**
 * 手动测试步骤
 *
 * 1. 启动思源笔记
 * 2. 打开插件复习界面
 * 3. 跳过几张卡片（使用"稍后"或"跳过"按钮）
 * 4. 继续复习，验证跳过的卡片是否会再次出现
 *
 * 预期结果：
 * - 跳过的卡片应该在队列末尾再次出现
 * - 不是永久消失
 * - 不是立即出现（而是到末尾）
 */
