/**
 * ReviewDialogManager - Unified Data Source Integration Tests
 * 验证 ReviewDialogManager 是否正确使用统一数据源架构
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReviewDialogManager } from '../ReviewDialogManager';
import type { ReviewDialogManagerDeps } from '../ReviewDialogManager';

// Mock dependencies
vi.mock('@/strategies/createUnifiedReviewDialog', () => ({
  createUnifiedReviewDialog: vi.fn((options) => {
    console.log('[Mock] createUnifiedReviewDialog called with:', options);
    return {
      dialog: { element: document.createElement('div') },
      destroy: vi.fn()
    };
  })
}));

vi.mock('@/core/siyuan/api', () => ({
  pushErrMsg: vi.fn(),
  pushMsg: vi.fn()
}));

describe('ReviewDialogManager - Unified Data Source Integration', () => {
  let manager: ReviewDialogManager;
  let mockDeps: ReviewDialogManagerDeps;

  beforeEach(() => {
    // 创建 mock 依赖
    mockDeps = {
      app: {} as any,
      i18n: {
        retrievalPractice: '提取练习',
        loadFailed: '加载失败'
      },
      storage: {} as any,
      scheduler: {} as any,
      finalDrillQueue: {} as any,
      filterGroupQueue: {} as any,
      incrementalQueue: {} as any,
      isInitialized: () => true,
      plugin: {
        app: {},
        i18n: { retrievalPractice: '提取练习' }
      }
    };

    manager = new ReviewDialogManager(mockDeps);
  });

  it('should use createUnifiedReviewDialog for retrieval practice', async () => {
    const { createUnifiedReviewDialog } = await import('@/strategies/createUnifiedReviewDialog');
    
    await manager.openRetrievalPractice();
    
    // 验证 createUnifiedReviewDialog 被调用
    expect(createUnifiedReviewDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        plugin: mockDeps.plugin,
        queueType: 'retrieval-practice',
        title: '提取练习',
        onClose: expect.any(Function)
      })
    );
  });

  it('should pass correct plugin reference', async () => {
    const { createUnifiedReviewDialog } = await import('@/strategies/createUnifiedReviewDialog');
    
    await manager.openRetrievalPractice();
    
    const callArgs = (createUnifiedReviewDialog as any).mock.calls[0][0];
    expect(callArgs.plugin).toBe(mockDeps.plugin);
  });

  it('should handle initialization check', async () => {
    const { pushErrMsg } = await import('@/core/siyuan/api');
    
    // 模拟未初始化状态
    mockDeps.isInitialized = () => false;
    const uninitializedManager = new ReviewDialogManager(mockDeps);
    
    await uninitializedManager.openRetrievalPractice();
    
    // 验证错误消息被推送
    expect(pushErrMsg).toHaveBeenCalled();
  });

  it('should destroy previous dialog before opening new one', async () => {
    const { createUnifiedReviewDialog } = await import('@/strategies/createUnifiedReviewDialog');
    
    // 打开第一个对话框
    await manager.openRetrievalPractice();
    const firstDialog = (createUnifiedReviewDialog as any).mock.results[0].value;
    
    // 打开第二个对话框
    await manager.openRetrievalPractice();
    
    // 验证第一个对话框被销毁
    expect(firstDialog.destroy).toHaveBeenCalled();
  });
});
