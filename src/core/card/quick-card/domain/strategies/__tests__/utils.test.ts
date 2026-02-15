/**
 * 策略工具函数单元测试
 */

import { describe, it, expect } from 'vitest';
import { removeIAL, splitBySymbol } from '../utils';

describe('utils', () => {
  describe('removeIAL', () => {
    it('should remove IAL attributes from content', () => {
      const content = '测试>>背面{: id="20260215134723-hm26mfn" updated="20260215140726"}';
      const result = removeIAL(content);
      
      expect(result).toBe('测试>>背面');
    });

    it('should handle content without IAL', () => {
      const content = '测试>>背面';
      const result = removeIAL(content);
      
      expect(result).toBe('测试>>背面');
    });

    it('should remove multiple IAL blocks', () => {
      const content = '测试{: id="1"}>>背面{: id="2"}';
      const result = removeIAL(content);
      
      expect(result).toBe('测试>>背面');
    });

    it('should handle IAL with complex attributes', () => {
      const content = '测试>>背面{: id="20260215134723-hm26mfn" style="animation: 450ms linear 0s 1 normal none running addCard;" updated="20260215140726" custom-fsrs-card-id="20260215060725-eb671ky" custom-fsrs-card-type="item"}';
      const result = removeIAL(content);
      
      expect(result).toBe('测试>>背面');
    });

    it('should trim whitespace after removing IAL', () => {
      const content = '测试>>背面  {: id="123"}  ';
      const result = removeIAL(content);
      
      expect(result).toBe('测试>>背面');
    });
  });

  describe('splitBySymbol', () => {
    it('should split content by symbol', () => {
      const [part1, part2] = splitBySymbol('问题 >> 答案', '>>');
      
      expect(part1).toBe('问题');
      expect(part2).toBe('答案');
    });

    it('should remove IAL before splitting', () => {
      const [part1, part2] = splitBySymbol('测试>>背面{: id="123"}', '>>');
      
      expect(part1).toBe('测试');
      expect(part2).toBe('背面');
    });

    it('should handle content without symbol', () => {
      const [part1, part2] = splitBySymbol('只有问题', '>>');
      
      expect(part1).toBe('只有问题');
      expect(part2).toBe('');
    });

    it('should handle IAL in both parts', () => {
      const [part1, part2] = splitBySymbol('问题{: id="1"}>>答案{: id="2"}', '>>');
      
      expect(part1).toBe('问题');
      expect(part2).toBe('答案');
    });

    it('should trim whitespace from both parts', () => {
      const [part1, part2] = splitBySymbol('  问题  >>  答案  ', '>>');
      
      expect(part1).toBe('问题');
      expect(part2).toBe('答案');
    });

    it('should handle concept card symbol', () => {
      const [part1, part2] = splitBySymbol('DDD::领域驱动设计{: id="123"}', '::');
      
      expect(part1).toBe('DDD');
      expect(part2).toBe('领域驱动设计');
    });

    it('should handle descriptor card symbol', () => {
      const [part1, part2] = splitBySymbol('特点;;易于扩展{: id="123"}', ';;');
      
      expect(part1).toBe('特点');
      expect(part2).toBe('易于扩展');
    });
  });
});
