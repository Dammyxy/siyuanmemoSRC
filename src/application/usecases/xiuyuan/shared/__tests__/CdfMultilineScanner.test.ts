import { describe, expect, it, vi } from 'vitest';
import { resolveCdfMultilineScan } from '../CdfMultilineScanner';

type SqlRow = Record<string, unknown>;

function createScannerApiMock(sqlImpl: (stmt: string) => Promise<SqlRow[]>) {
  return {
    sql: vi.fn(sqlImpl),
    getBlockKramdown: vi.fn().mockResolvedValue({ kramdown: 'Parent :::' }),
  };
}

describe('resolveCdfMultilineScan', () => {
  it('uses explicit marker first and falls back to recursive marker', async () => {
    const parentId = '20260101000000-parent1';
    const containerId = '20260101000001-listcon1';
    const childA = '20260101000002-childaa';
    const childB = '20260101000003-childbb';

    const api = createScannerApiMock(async (stmt) => {
      if (stmt.includes(`WHERE id = '${parentId}'`) && stmt.includes('SELECT type')) {
        return [{ type: 'i' }];
      }
      if (stmt.includes(`WHERE parent_id = '${parentId}'`) && stmt.includes("AND type = 'p'")) {
        return [{ id: '20260101000004-parentp', content: 'Parent :::', markdown: 'Parent :::' }];
      }
      if (stmt.includes(`WHERE parent_id = '${parentId}'`) && stmt.includes("AND type = 'l'")) {
        return [{ id: containerId }];
      }
      if (stmt.includes(`WHERE parent_id = '${containerId}'`) && stmt.includes("AND type = 'i'")) {
        return [{ id: childA, subtype: 'u' }, { id: childB, subtype: 'u' }];
      }
      if (stmt.includes(`WHERE parent_id = '${childA}'`) && stmt.includes("AND type = 'p'")) {
        return [{ id: '20260101000005-aparag', content: '纯文本', markdown: '纯文本' }];
      }
      if (stmt.includes(`WHERE parent_id = '${childB}'`) && stmt.includes("AND type = 'p'")) {
        return [{ id: '20260101000006-bparag', content: '定义::内容', markdown: '定义::内容' }];
      }
      if (stmt.includes(`WHERE id = '${childA}'`) && stmt.includes('WITH RECURSIVE descendants')) {
        return [
          { id: '20260101000005-aparag', content: '纯文本', markdown: '纯文本' },
          { id: '20260101000007-anested', content: '属性;;答案', markdown: '属性;;答案' },
        ];
      }
      if (stmt.includes(`WHERE id = '${childB}'`) && stmt.includes('WITH RECURSIVE descendants')) {
        return [
          { id: '20260101000006-bparag', content: '定义::内容', markdown: '定义::内容' },
          { id: '20260101000008-bnested', content: '属性;;答案', markdown: '属性;;答案' },
        ];
      }
      return [];
    });

    const result = await resolveCdfMultilineScan(parentId, api);

    expect(result.parentParagraphId).toBe('20260101000004-parentp');
    expect(result.parentParagraphText).toBe('Parent :::');
    expect(result.parentParagraphKramdown).toBe('Parent :::');
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].explicitMarkerKind).toBe('none');
    expect(result.nodes[0].recursiveMarkerKind).toBe('descriptor-forward');
    expect(result.nodes[0].markerKind).toBe('descriptor-forward');
    expect(result.nodes[1].explicitMarkerKind).toBe('definition-both');
    expect(result.nodes[1].recursiveMarkerKind).toBe('definition-both');
    expect(result.nodes[1].markerKind).toBe('definition-both');
  });

  it('stops scanning when the next direct child contains document block reference', async () => {
    const parentId = '20260102000000-parent1';
    const containerId = '20260102000001-listcon1';
    const childA = '20260102000002-childaa';
    const childB = '20260102000003-childbb';
    const childC = '20260102000004-childcc';
    const docRef = '20260102000005-abcdeff';

    const api = createScannerApiMock(async (stmt) => {
      if (stmt.includes(`WHERE id = '${parentId}'`) && stmt.includes('SELECT type')) {
        return [{ type: 'i' }];
      }
      if (stmt.includes(`WHERE parent_id = '${parentId}'`) && stmt.includes("AND type = 'p'")) {
        return [{ id: '20260102000006-parentp', content: 'Parent :::', markdown: 'Parent :::' }];
      }
      if (stmt.includes(`WHERE parent_id = '${parentId}'`) && stmt.includes("AND type = 'l'")) {
        return [{ id: containerId }];
      }
      if (stmt.includes(`WHERE parent_id = '${containerId}'`) && stmt.includes("AND type = 'i'")) {
        return [{ id: childA, subtype: 'u' }, { id: childB, subtype: 'u' }, { id: childC, subtype: 'u' }];
      }
      if (stmt.includes(`WHERE parent_id = '${childA}'`) && stmt.includes("AND type = 'p'")) {
        return [{ id: '20260102000007-aparag', content: '属性;;答案', markdown: '属性;;答案' }];
      }
      if (stmt.includes(`WHERE parent_id = '${childB}'`) && stmt.includes("AND type = 'p'")) {
        return [{ id: '20260102000008-bparag', content: `((${docRef})) 子概念`, markdown: `((${docRef})) 子概念` }];
      }
      if (stmt.includes(`WHERE id = '${childA}'`) && stmt.includes('WITH RECURSIVE descendants')) {
        return [{ id: '20260102000007-aparag', content: '属性;;答案', markdown: '属性;;答案' }];
      }
      if (stmt.includes('WHERE id IN') && stmt.includes(docRef)) {
        return [{ id: docRef, type: 'd' }];
      }
      return [];
    });

    const result = await resolveCdfMultilineScan(parentId, api);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe(childA);
    expect(result.stoppedByDocumentReference).toBe(true);
    expect(result.stopNodeId).toBe(childB);
  });

  it('resolves ordered/unordered children for ;;; multiline node', async () => {
    const parentId = '20260103000000-parent1';
    const containerId = '20260103000001-listcon1';
    const childNode = '20260103000002-childaa';
    const nestedContainerId = '20260103000003-listcon2';

    const api = createScannerApiMock(async (stmt) => {
      if (stmt.includes(`WHERE id = '${parentId}'`) && stmt.includes('SELECT type')) {
        return [{ type: 'i' }];
      }
      if (stmt.includes(`WHERE parent_id = '${parentId}'`) && stmt.includes("AND type = 'p'")) {
        return [{ id: '20260103000004-parentp', content: 'Parent :::', markdown: 'Parent :::' }];
      }
      if (stmt.includes(`WHERE parent_id = '${parentId}'`) && stmt.includes("AND type = 'l'")) {
        return [{ id: containerId }];
      }
      if (stmt.includes(`WHERE parent_id = '${containerId}'`) && stmt.includes("AND type = 'i'")) {
        return [{ id: childNode, subtype: 'u' }];
      }
      if (stmt.includes(`WHERE parent_id = '${childNode}'`) && stmt.includes("AND type = 'p'")) {
        return [{ id: '20260103000005-childp', content: '起源;;;', markdown: '起源;;;' }];
      }
      if (stmt.includes(`WHERE id = '${childNode}'`) && stmt.includes('WITH RECURSIVE descendants')) {
        return [{ id: '20260103000005-childp', content: '起源;;;', markdown: '起源;;;' }];
      }
      if (stmt.includes(`WHERE parent_id = '${childNode}'`) && stmt.includes("AND type = 'l'") && stmt.includes('LIMIT 1')) {
        return [{ id: nestedContainerId }];
      }
      if (stmt.includes(`WHERE parent_id = '${nestedContainerId}'`) && stmt.includes("AND type = 'i'")) {
        return [
          { id: '20260103000006-subo01', subtype: 'o' },
          { id: '20260103000007-subo02', subtype: 'o' },
          { id: '20260103000008-subu01', subtype: 'u' },
        ];
      }
      return [];
    });

    const result = await resolveCdfMultilineScan(parentId, api);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].markerKind).toBe('descriptor-multiline');
    expect(result.nodes[0].orderedChildListItemIds).toEqual([
      '20260103000006-subo01',
      '20260103000007-subo02',
    ]);
    expect(result.nodes[0].unorderedChildListItemIds).toEqual(['20260103000008-subu01']);
  });
});
