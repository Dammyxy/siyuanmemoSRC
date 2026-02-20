/**
 * RiffBlacklistService 单元测试
 * 
 * @description
 * 测试 RiffBlacklistService 的黑名单添加、移除、查询和持久化功能。
 * 
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RiffBlacklistService } from '../RiffBlacklistService';
import type { IFileService } from '../../../infrastructure/services/FileService';

describe('RiffBlacklistService', () => {
  let service: RiffBlacklistService;
  let mockFileService: IFileService;
  let mockStorage: Map<string, any>;

  beforeEach(() => {
    // 创建内存存储模拟文件系统
    mockStorage = new Map();

    // 创建 mock FileService
    mockFileService = {
      readJSON: vi.fn(async (fileName: string) => {
        return mockStorage.get(fileName) || null;
      }),
      writeJSON: vi.fn(async (fileName: string, data: any) => {
        mockStorage.set(fileName, data);
      }),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      readMsgpack: vi.fn(),
      writeMsgpack: vi.fn()
    };

    // 创建服务实例
    service = new RiffBlacklistService(mockFileService);
  });

  describe('init', () => {
    it('should initialize with empty blacklist when file does not exist', async () => {
      await service.init();

      expect(service.getBlacklist().size).toBe(0);
      expect(mockFileService.writeJSON).toHaveBeenCalledWith(
        'riff-blacklist.json',
        { blacklist: [] }
      );
    });

    it('should load existing blacklist from file', async () => {
      const existingData = {
        blacklist: ['block-1', 'block-2', 'block-3']
      };
      mockStorage.set('riff-blacklist.json', existingData);

      await service.init();

      const blacklist = service.getBlacklist();
      expect(blacklist.size).toBe(3);
      expect(blacklist.has('block-1')).toBe(true);
      expect(blacklist.has('block-2')).toBe(true);
      expect(blacklist.has('block-3')).toBe(true);
    });

    it('should handle corrupted data gracefully', async () => {
      mockStorage.set('riff-blacklist.json', { invalid: 'data' });

      await service.init();

      // Should initialize with empty blacklist
      expect(service.getBlacklist().size).toBe(0);
    });

    it('should handle file read errors', async () => {
      mockFileService.readJSON = vi.fn().mockRejectedValue(new Error('Read error'));

      await expect(service.init()).rejects.toThrow();
      // Should still have empty blacklist after error
      expect(service.getBlacklist().size).toBe(0);
    });
  });

  describe('addToBlacklist', () => {
    beforeEach(async () => {
      await service.init();
    });

    it('should add block to blacklist', async () => {
      await service.addToBlacklist('block-1');

      expect(service.isInBlacklist('block-1')).toBe(true);
      expect(service.getBlacklist().size).toBe(1);
    });

    it('should not add duplicate blocks', async () => {
      await service.addToBlacklist('block-1');
      await service.addToBlacklist('block-1');

      expect(service.getBlacklist().size).toBe(1);
    });

    it('should add multiple different blocks', async () => {
      await service.addToBlacklist('block-1');
      await service.addToBlacklist('block-2');
      await service.addToBlacklist('block-3');

      expect(service.getBlacklist().size).toBe(3);
      expect(service.isInBlacklist('block-1')).toBe(true);
      expect(service.isInBlacklist('block-2')).toBe(true);
      expect(service.isInBlacklist('block-3')).toBe(true);
    });

    it('should throw error for invalid block ID', async () => {
      await expect(service.addToBlacklist('')).rejects.toThrow('Invalid block ID');
      await expect(service.addToBlacklist(null as any)).rejects.toThrow('Invalid block ID');
      await expect(service.addToBlacklist(undefined as any)).rejects.toThrow('Invalid block ID');
    });

    it('should persist changes to file', async () => {
      await service.addToBlacklist('block-1');

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(mockFileService.writeJSON).toHaveBeenCalledWith(
        'riff-blacklist.json',
        { blacklist: ['block-1'] }
      );
    });
  });

  describe('removeFromBlacklist', () => {
    beforeEach(async () => {
      mockStorage.set('riff-blacklist.json', {
        blacklist: ['block-1', 'block-2', 'block-3']
      });
      await service.init();
    });

    it('should remove block from blacklist', async () => {
      await service.removeFromBlacklist('block-2');

      expect(service.isInBlacklist('block-2')).toBe(false);
      expect(service.getBlacklist().size).toBe(2);
      expect(service.isInBlacklist('block-1')).toBe(true);
      expect(service.isInBlacklist('block-3')).toBe(true);
    });

    it('should handle removing non-existent block', async () => {
      await service.removeFromBlacklist('non-existent');

      expect(service.getBlacklist().size).toBe(3);
    });

    it('should throw error for invalid block ID', async () => {
      await expect(service.removeFromBlacklist('')).rejects.toThrow('Invalid block ID');
      await expect(service.removeFromBlacklist(null as any)).rejects.toThrow('Invalid block ID');
    });

    it('should persist changes to file', async () => {
      await service.removeFromBlacklist('block-2');

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 350));

      const savedData = mockStorage.get('riff-blacklist.json');
      expect(savedData.blacklist).toHaveLength(2);
      expect(savedData.blacklist).not.toContain('block-2');
    });
  });

  describe('isInBlacklist', () => {
    beforeEach(async () => {
      mockStorage.set('riff-blacklist.json', {
        blacklist: ['block-1', 'block-2']
      });
      await service.init();
    });

    it('should return true for blacklisted blocks', () => {
      expect(service.isInBlacklist('block-1')).toBe(true);
      expect(service.isInBlacklist('block-2')).toBe(true);
    });

    it('should return false for non-blacklisted blocks', () => {
      expect(service.isInBlacklist('block-3')).toBe(false);
      expect(service.isInBlacklist('non-existent')).toBe(false);
    });

    it('should return false for invalid block IDs', () => {
      expect(service.isInBlacklist('')).toBe(false);
      expect(service.isInBlacklist(null as any)).toBe(false);
      expect(service.isInBlacklist(undefined as any)).toBe(false);
    });

    it('should have O(1) lookup time', () => {
      // Add many items to test performance
      const largeBlacklist = Array.from({ length: 10000 }, (_, i) => `block-${i}`);
      mockStorage.set('riff-blacklist.json', { blacklist: largeBlacklist });
      
      // Lookup should be fast regardless of size
      const start = Date.now();
      service.isInBlacklist('block-5000');
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(10); // Should be nearly instant
    });
  });

  describe('getBlacklist', () => {
    beforeEach(async () => {
      mockStorage.set('riff-blacklist.json', {
        blacklist: ['block-1', 'block-2', 'block-3']
      });
      await service.init();
    });

    it('should return copy of blacklist', () => {
      const blacklist = service.getBlacklist();

      expect(blacklist.size).toBe(3);
      expect(blacklist.has('block-1')).toBe(true);
      expect(blacklist.has('block-2')).toBe(true);
      expect(blacklist.has('block-3')).toBe(true);
    });

    it('should return new Set instance (not reference)', () => {
      const blacklist1 = service.getBlacklist();
      const blacklist2 = service.getBlacklist();

      expect(blacklist1).not.toBe(blacklist2);
      expect(blacklist1).toEqual(blacklist2);
    });

    it('should not allow external modification', async () => {
      const blacklist = service.getBlacklist();
      blacklist.add('external-block');

      // Original blacklist should not be affected
      expect(service.isInBlacklist('external-block')).toBe(false);
      expect(service.getBlacklist().size).toBe(3);
    });
  });

  describe('clearBlacklist', () => {
    beforeEach(async () => {
      mockStorage.set('riff-blacklist.json', {
        blacklist: ['block-1', 'block-2', 'block-3']
      });
      await service.init();
    });

    it('should clear all items from blacklist', async () => {
      await service.clearBlacklist();

      expect(service.getBlacklist().size).toBe(0);
      expect(service.isInBlacklist('block-1')).toBe(false);
      expect(service.isInBlacklist('block-2')).toBe(false);
      expect(service.isInBlacklist('block-3')).toBe(false);
    });

    it('should persist cleared state immediately', async () => {
      await service.clearBlacklist();

      // Should save immediately without debounce
      expect(mockFileService.writeJSON).toHaveBeenCalledWith(
        'riff-blacklist.json',
        { blacklist: [] }
      );
    });

    it('should handle clearing empty blacklist', async () => {
      await service.clearBlacklist();
      await service.clearBlacklist();

      expect(service.getBlacklist().size).toBe(0);
    });
  });

  describe('debounce mechanism', () => {
    beforeEach(async () => {
      await service.init();
    });

    it('should debounce multiple rapid additions', async () => {
      await service.addToBlacklist('block-1');
      await service.addToBlacklist('block-2');
      await service.addToBlacklist('block-3');

      // Should not save immediately
      expect(mockFileService.writeJSON).toHaveBeenCalledTimes(1); // Only init save

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 350));

      // Should save once after debounce
      expect(mockFileService.writeJSON).toHaveBeenCalledTimes(2);
      const savedData = mockStorage.get('riff-blacklist.json');
      expect(savedData.blacklist).toHaveLength(3);
    });

    it('should debounce multiple rapid removals', async () => {
      mockStorage.set('riff-blacklist.json', {
        blacklist: ['block-1', 'block-2', 'block-3']
      });
      await service.init();

      const initialCallCount = (mockFileService.writeJSON as any).mock.calls.length;

      await service.removeFromBlacklist('block-1');
      await service.removeFromBlacklist('block-2');

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 350));

      // Should save once after debounce
      expect(mockFileService.writeJSON).toHaveBeenCalledTimes(initialCallCount + 1);
      const savedData = mockStorage.get('riff-blacklist.json');
      expect(savedData.blacklist).toHaveLength(1);
      expect(savedData.blacklist).toContain('block-3');
    });

    it('should not save when adding duplicate', async () => {
      await service.addToBlacklist('block-1');
      await new Promise(resolve => setTimeout(resolve, 350));

      const callCountBefore = (mockFileService.writeJSON as any).mock.calls.length;

      await service.addToBlacklist('block-1'); // Duplicate
      await new Promise(resolve => setTimeout(resolve, 350));

      // Should not trigger additional save
      expect(mockFileService.writeJSON).toHaveBeenCalledTimes(callCountBefore);
    });

    it('should not save when removing non-existent item', async () => {
      const callCountBefore = (mockFileService.writeJSON as any).mock.calls.length;

      await service.removeFromBlacklist('non-existent');
      await new Promise(resolve => setTimeout(resolve, 350));

      // Should not trigger save
      expect(mockFileService.writeJSON).toHaveBeenCalledTimes(callCountBefore);
    });
  });

  describe('persistence round-trip', () => {
    it('should persist and reload blacklist correctly', async () => {
      await service.init();

      // Add items
      await service.addToBlacklist('block-1');
      await service.addToBlacklist('block-2');
      await service.addToBlacklist('block-3');

      // Wait for save
      await new Promise(resolve => setTimeout(resolve, 350));

      // Create new service instance and load
      const newService = new RiffBlacklistService(mockFileService);
      await newService.init();

      // Should have same items
      expect(newService.getBlacklist().size).toBe(3);
      expect(newService.isInBlacklist('block-1')).toBe(true);
      expect(newService.isInBlacklist('block-2')).toBe(true);
      expect(newService.isInBlacklist('block-3')).toBe(true);
    });
  });
});
