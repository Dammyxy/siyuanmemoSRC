import { describe, expect, it } from 'vitest';
import {
  deriveCdfLiveRelations,
  type CdfLiveBlockNode,
} from '../index';

const conceptA = '20260101000000-aaaaaaa';
const conceptB = '20260101000000-bbbbbbb';
const conceptC = '20260101000000-ccccccc';
const nonDoc = '20260101000000-ppppppp';

function node(id: string, markdown: string, children: CdfLiveBlockNode[] = []): CdfLiveBlockNode {
  return {
    id,
    type: 'i',
    markdown,
    children,
  };
}

describe('CDF live relation scanner', () => {
  it('derives definition relations from source-block concept refs and expands both direction', () => {
    const result = deriveCdfLiveRelations(node('source-definition', `((${conceptA} "Concept A")) :: definition text`));

    expect(result.relations.map((relation) => relation.relationKind).sort()).toEqual([
      'definition-forward',
      'definition-reverse',
    ]);
    expect(result.relations[0]).toEqual(expect.objectContaining({
      sourceBlockId: 'source-definition',
      conceptBlockId: conceptA,
      relationStatus: 'active-live',
      contentStatus: 'content-complete',
      fieldMappingSnapshot: {
        concept: conceptA,
        definition: 'source-definition',
      },
    }));
    expect(result.relations.map((relation) => relation.relationKey).sort()).toEqual([
      `source-definition:${conceptA}:definition-forward`,
      `source-definition:${conceptA}:definition-reverse`,
    ]);
  });

  it('binds descriptors to nearest direct-child boundary and treats nested refs as content', () => {
    const root = node('root', 'root', [
      node('boundary-a', `((${conceptA}))`, [
        node('descriptor-a', `cue ;; answer with nested ref ((${conceptB}))`, [
          node('nested-ref', `((${conceptC}))`),
        ]),
      ]),
    ]);

    const result = deriveCdfLiveRelations(root);

    expect(result.relations).toHaveLength(1);
    expect(result.relations[0]).toEqual(expect.objectContaining({
      sourceBlockId: 'descriptor-a',
      conceptBlockId: conceptA,
      relationKind: 'descriptor-forward',
      content: {
        cue: 'cue',
        answer: `answer with nested ref ((${conceptB}))`,
      },
    }));
  });

  it('changes descriptor concept at same-level boundaries without using heading or document fallback', () => {
    const root = node('root', 'document title', [
      node('boundary-a', `((${conceptA}))`),
      node('descriptor-a', 'first ;; answer'),
      node('boundary-b', `((${conceptB}))`),
      node('descriptor-b', 'second ;; answer'),
    ]);

    const result = deriveCdfLiveRelations(root);

    expect(result.relations.map((relation) => [relation.sourceBlockId, relation.conceptBlockId])).toEqual([
      ['descriptor-a', conceptA],
      ['descriptor-b', conceptB],
    ]);
  });

  it('dedupes duplicate concept refs and records warning issues without blocking valid refs', () => {
    const result = deriveCdfLiveRelations(
      node('source-definition', `((${conceptA})) ((${conceptA})) ((${nonDoc})) :> definition`),
      { conceptTargets: { [conceptA]: 'd', [nonDoc]: 'p' } },
    );

    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].conceptBlockId).toBe(conceptA);
    expect(result.relations[0].issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'duplicate-ref', severity: 'warning' }),
      expect.objectContaining({ code: 'non-doc-ref-warning', severity: 'warning' }),
    ]));
  });

  it('keeps concept display order by source order and excludes title from relation identity', () => {
    const result = deriveCdfLiveRelations(
      node('source-definition', `((${conceptB})) ((${conceptA})) :> definition`),
      { conceptTargets: {
        [conceptA]: { id: conceptA, type: 'd', title: 'Concept A renamed' },
        [conceptB]: { id: conceptB, type: 'd', title: 'Concept B' },
      } },
    );

    expect(result.relations.map((relation) => relation.conceptSnapshot)).toEqual([
      { conceptBlockId: conceptB, displayText: 'Concept B', order: 0 },
      { conceptBlockId: conceptA, displayText: 'Concept A renamed', order: 1 },
    ]);
    expect(result.relations.map((relation) => relation.relationKey)).toEqual([
      `source-definition:${conceptB}:definition-forward`,
      `source-definition:${conceptA}:definition-forward`,
    ]);
  });

  it('blocks definition binding when all refs are invalid or missing targets', () => {
    const result = deriveCdfLiveRelations(
      node('source-definition', `((${nonDoc})) :> definition`),
      { conceptTargets: { [nonDoc]: 'p' } },
    );

    expect(result.relations).toHaveLength(0);
    expect(result.issues.map((entry) => entry.issue)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid-concept-ref', severity: 'blocking' }),
    ]));
  });

  it('records missing concept target as a blocking live relation issue', () => {
    const result = deriveCdfLiveRelations(
      node('source-definition', `((${conceptA})) :> definition`),
      { conceptTargets: { [conceptA]: null } },
    );

    expect(result.relations).toHaveLength(0);
    expect(result.issues.map((entry) => entry.issue)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing-concept-target', severity: 'blocking' }),
    ]));
  });

  it('derives definition group children with breadcrumbs and relation keys independent from labels', () => {
    const root = node('group-root', `((${conceptA})) Chapter :::`, [
      node('definition-child', 'plain definition'),
      node('explicit-child', `((${conceptB})) :< reverse definition`),
    ]);

    const result = deriveCdfLiveRelations(root);

    expect(result.relations.map((relation) => relation.relationKey).sort()).toEqual([
      `definition-child:${conceptA}:definition-forward`,
      `explicit-child:${conceptB}:definition-reverse`,
    ]);
    expect(result.relations.map((relation) => relation.sourceSnapshot.breadcrumb)).toEqual([
      [`((${conceptA})) Chapter`],
      [`((${conceptA})) Chapter`],
    ]);
  });

  it('derives nested group breadcrumbs without adding breadcrumb text to relation keys', () => {
    const root = node('group-root', `((${conceptA})) Chapter :::`, [
      node('nested-group', 'Section :::', [
        node('definition-child', 'plain definition'),
      ]),
    ]);

    const result = deriveCdfLiveRelations(root);

    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].relationKey).toBe(`definition-child:${conceptA}:definition-forward`);
    expect(result.relations[0].sourceSnapshot.breadcrumb).toEqual([`((${conceptA})) Chapter`, 'Section']);
  });

  it('derives descriptor group plain and arrow leaves under live concept boundaries', () => {
    const root = node('root', 'root', [
      node('boundary-a', `((${conceptA}))`, [
        node('group', 'Traits ;;;', [
          node('plain-leaf', 'answer only'),
          node('arrow-leaf', 'cue -> answer'),
        ]),
      ]),
    ]);

    const result = deriveCdfLiveRelations(root);

    expect(result.relations.map((relation) => ({
      sourceBlockId: relation.sourceBlockId,
      shape: relation.contentShape,
      content: relation.content,
      breadcrumb: relation.sourceSnapshot.breadcrumb,
    }))).toEqual([
      {
        sourceBlockId: 'plain-leaf',
        shape: 'descriptor-group-plain',
        content: { cue: '', answer: 'answer only' },
        breadcrumb: ['Traits'],
      },
      {
        sourceBlockId: 'arrow-leaf',
        shape: 'descriptor-group-arrow',
        content: { cue: 'cue', answer: 'answer' },
        breadcrumb: ['Traits'],
      },
    ]);
  });

  it('ignores blank group children while keeping explicit blank sources content-incomplete', () => {
    const root = node('root', 'root', [
      node('definition-group', `((${conceptA})) Chapter :::`, [
        node('new-blank-definition-child', '   {: id="new-blank-definition-child"}'),
        node('explicit-empty-definition', `((${conceptA})) :>   {: id="explicit-empty-definition"}`),
      ]),
      node('boundary-a', `((${conceptA}))`, [
        node('descriptor-group', 'Traits ;;;', [
          node('new-blank-descriptor-child', '   {: id="new-blank-descriptor-child"}'),
          node('explicit-empty-descriptor', 'cue ;;   {: id="explicit-empty-descriptor"}'),
        ]),
      ]),
    ]);

    const result = deriveCdfLiveRelations(root);

    expect(result.relations.map(relation => ({
      sourceBlockId: relation.sourceBlockId,
      contentStatus: relation.contentStatus,
      content: relation.content,
    }))).toEqual([
      {
        sourceBlockId: 'explicit-empty-definition',
        contentStatus: 'content-incomplete',
        content: { definition: '' },
      },
      {
        sourceBlockId: 'explicit-empty-descriptor',
        contentStatus: 'content-incomplete',
        content: { cue: 'cue', answer: '' },
      },
    ]);
    expect(result.issues.map(issue => issue.sourceBlockId)).not.toContain('new-blank-definition-child');
    expect(result.issues.map(issue => issue.sourceBlockId)).not.toContain('new-blank-descriptor-child');
  });

  it('records missing concept ref instead of falling back to source document context', () => {
    const result = deriveCdfLiveRelations(node('descriptor-without-boundary', 'cue ;; answer'));

    expect(result.relations).toHaveLength(0);
    expect(result.issues.map((entry) => entry.issue)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing-concept-ref', severity: 'blocking' }),
    ]));
  });
});
