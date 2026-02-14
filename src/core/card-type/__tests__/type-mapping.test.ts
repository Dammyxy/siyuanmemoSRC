/**
 * 类型映射工具测试
 * 
 * 验证卡片类型标记与技术类型之间的映射关系。
 */

import { describe, it, expect } from 'vitest';
import { CardType } from '@/types/card';
import {
  TYPE_MAPPING,
  REVERSE_TYPE_MAPPING,
  getTechnicalType,
  getPossibleMarkers,
  isValidTypeMapping,
  getMarkerDisplayName,
  getMarkerIcon,
  getMarkerDescription,
} from '../type-mapping';

describe('类型映射常量', () => {
  it('TYPE_MAPPING 应该正确映射概念卡到 Concept', () => {
    expect(TYPE_MAPPING.concept).toBe(CardType.Concept);
  });

  it('TYPE_MAPPING 应该正确映射描述符卡到 Descriptor', () => {
    expect(TYPE_MAPPING.descriptor).toBe(CardType.Descriptor);
  });

  it('REVERSE_TYPE_MAPPING 应该正确反向映射 Concept 到概念卡', () => {
    expect(REVERSE_TYPE_MAPPING[CardType.Concept]).toContain('concept');
  });

  it('REVERSE_TYPE_MAPPING 应该正确反向映射 Descriptor 到描述符卡', () => {
    expect(REVERSE_TYPE_MAPPING[CardType.Descriptor]).toContain('descriptor');
  });

  it('REVERSE_TYPE_MAPPING 应该返回空数组对于 Topic', () => {
    expect(REVERSE_TYPE_MAPPING[CardType.Topic]).toEqual([]);
  });

  it('REVERSE_TYPE_MAPPING 应该返回空数组对于 Item', () => {
    expect(REVERSE_TYPE_MAPPING[CardType.Item]).toEqual([]);
  });
});

describe('getTechnicalType', () => {
  it('应该返回概念卡的技术类型为 Concept', () => {
    expect(getTechnicalType('concept')).toBe(CardType.Concept);
  });

  it('应该返回描述符卡的技术类型为 Descriptor', () => {
    expect(getTechnicalType('descriptor')).toBe(CardType.Descriptor);
  });
});

describe('getPossibleMarkers', () => {
  it('应该返回 Concept 类型的可能标记包含概念卡', () => {
    const markers = getPossibleMarkers(CardType.Concept);
    expect(markers).toContain('concept');
  });

  it('应该返回 Descriptor 类型的可能标记包含描述符卡', () => {
    const markers = getPossibleMarkers(CardType.Descriptor);
    expect(markers).toContain('descriptor');
  });

  it('应该返回空数组对于 Item 类型', () => {
    const markers = getPossibleMarkers(CardType.Item);
    expect(markers).toEqual([]);
  });

  it('应该返回空数组对于 Topic 类型', () => {
    const markers = getPossibleMarkers(CardType.Topic);
    expect(markers).toEqual([]);
  });

  it('应该返回空数组对于没有标记的类型', () => {
    const markers = getPossibleMarkers(CardType.Incremental);
    expect(markers).toEqual([]);
  });
});

describe('isValidTypeMapping', () => {
  it('应该验证概念卡和 Concept 的映射为有效', () => {
    expect(isValidTypeMapping('concept', CardType.Concept)).toBe(true);
  });

  it('应该验证描述符卡和 Descriptor 的映射为有效', () => {
    expect(isValidTypeMapping('descriptor', CardType.Descriptor)).toBe(true);
  });

  it('应该验证概念卡和 Item 的映射为无效', () => {
    expect(isValidTypeMapping('concept', CardType.Item)).toBe(false);
  });

  it('应该验证概念卡和 Topic 的映射为无效', () => {
    expect(isValidTypeMapping('concept', CardType.Topic)).toBe(false);
  });

  it('应该验证描述符卡和 Item 的映射为无效', () => {
    expect(isValidTypeMapping('descriptor', CardType.Item)).toBe(false);
  });

  it('应该验证描述符卡和 Topic 的映射为无效', () => {
    expect(isValidTypeMapping('descriptor', CardType.Topic)).toBe(false);
  });
});

describe('getMarkerDisplayName', () => {
  it('应该返回概念卡的显示名称', () => {
    expect(getMarkerDisplayName('concept')).toBe('概念卡');
  });

  it('应该返回描述符卡的显示名称', () => {
    expect(getMarkerDisplayName('descriptor')).toBe('描述符卡');
  });
});

describe('getMarkerIcon', () => {
  it('应该返回概念卡的图标', () => {
    expect(getMarkerIcon('concept')).toBe('🧠');
  });

  it('应该返回描述符卡的图标', () => {
    expect(getMarkerIcon('descriptor')).toBe('🏷️');
  });
});

describe('getMarkerDescription', () => {
  it('应该返回概念卡的描述', () => {
    const desc = getMarkerDescription('concept');
    expect(desc).toContain('知识概念');
    expect(desc).toContain('神经漫游');
  });

  it('应该返回描述符卡的描述', () => {
    const desc = getMarkerDescription('descriptor');
    expect(desc).toContain('属性');
    expect(desc).toContain('父概念');
  });
});
