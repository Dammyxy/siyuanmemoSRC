/**
 * 简化的 Mock 测试 - 用于验证 Mock 是否正常工作
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Siyuan API
vi.mock('@/core/siyuan/api', () => ({
  request: vi.fn().mockResolvedValue({}),
  setBlockAttrs: vi.fn().mockResolvedValue(undefined),
  getBlockInfo: vi.fn().mockResolvedValue({}),
}));

describe('Mock 验证测试', () => {
  it('Mock Riff API 应该正常工作', async () => {
    const riffCards = new Map<string, any>();
    
    const mockRiffAPI = {
      getRiffDueCards: vi.fn().mockImplementation(async (deckID: string) => {
        const cards = Array.from(riffCards.values()).filter(c => c.deckID === deckID);
        console.log('[Mock Test] getRiffDueCards called with:', deckID);
        console.log('[Mock Test] Returning cards:', cards);
        return {
          cards,
          unreviewedCount: cards.length,
          unreviewedNewCardCount: 0,
          unreviewedOldCardCount: cards.length,
        };
      }),
      addCard: (card: any) => { 
        console.log('[Mock Test] Adding card:', card);
        riffCards.set(card.cardID, card); 
      },
    };

    // 添加卡片
    mockRiffAPI.addCard({
      cardID: 'test-card',
      blockID: 'test-block',
      deckID: 'test-deck',
      nextDues: {
        1: new Date(Date.now() + 1000).toISOString(),
        2: new Date(Date.now() + 2000).toISOString(),
        3: new Date(Date.now() + 3000).toISOString(),
        4: new Date(Date.now() + 4000).toISOString(),
      },
    });

    // 验证卡片已添加
    const result = await mockRiffAPI.getRiffDueCards('test-deck');
    console.log('[Mock Test] Result:', result);
    
    expect(result.cards.length).toBe(1);
    expect(result.cards[0].cardID).toBe('test-card');
  });
});
