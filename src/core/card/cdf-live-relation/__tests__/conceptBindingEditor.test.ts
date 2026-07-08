import { describe, expect, it } from 'vitest';
import {
  applyCdfConceptBindingEdit,
  planCdfConceptBindingEdit,
} from '../conceptBindingEditor';

const oldConcept = '20260703020202-bcdefgh';
const staleConcept = '20260703099999-staleaa';
const newConcept = '20260703030303-cdefghi';
const nonDocTarget = '20260703040404-ddddddd';

describe('CDF concept binding editor', () => {
  it('plans normal existing-reference replacement and preserves alias text and attrs', () => {
    const plan = planCdfConceptBindingEdit({
      sourceBlockId: 'definition-source',
      source: `((20260703020202-bcdefgh "Old concept")) :> old definition {: id="definition-source"}`,
      selectedConceptBlockId: newConcept,
      expectedConceptBlockId: oldConcept,
      relationFamily: 'definition',
      target: { id: newConcept, type: 'd' },
    });

    expect(plan.kind).toBe('replace-existing-reference');
    expect(applyCdfConceptBindingEdit(plan)).toEqual({
      ok: true,
      source: `((20260703030303-cdefghi "Old concept")) :> old definition {: id="definition-source"}`,
    });
  });

  it('plans stale-reference repair with expected actual and selected diagnostics', () => {
    const plan = planCdfConceptBindingEdit({
      sourceBlockId: 'definition-source',
      source: `((20260703020202-bcdefgh "Old concept")) :> old definition`,
      selectedConceptBlockId: newConcept,
      expectedConceptBlockId: staleConcept,
      relationFamily: 'definition',
      target: { id: newConcept, type: 'd' },
    });

    expect(plan).toEqual(expect.objectContaining({
      kind: 'repair-stale-reference',
      sourceBlockId: 'definition-source',
      requiresConfirmation: true,
      diagnostics: [
        expect.objectContaining({
          code: 'stale-old-concept-reference',
          expectedConceptBlockId: staleConcept,
          actualConceptBlockId: oldConcept,
          selectedConceptBlockId: newConcept,
        }),
      ],
    }));
    expect(applyCdfConceptBindingEdit(plan)).toEqual({
      ok: true,
      source: `((20260703030303-cdefghi "Old concept")) :> old definition`,
    });
  });

  it('plans empty definition binding by inserting the selected concept ref before the definition operator', () => {
    const plan = planCdfConceptBindingEdit({
      sourceBlockId: 'definition-source',
      source: 'Old concept :> definition text {: id="definition-source"}',
      selectedConceptBlockId: newConcept,
      expectedConceptBlockId: '',
      relationFamily: 'definition',
      target: { id: newConcept, type: 'd' },
    });

    expect(plan.kind).toBe('bind-empty-definition');
    expect(applyCdfConceptBindingEdit(plan)).toEqual({
      ok: true,
      source: `((20260703030303-cdefghi)) Old concept :> definition text {: id="definition-source"}`,
    });
  });

  it('accepts a document target without requiring an existing concept simple card', () => {
    const plan = planCdfConceptBindingEdit({
      sourceBlockId: 'definition-source',
      source: `((20260703020202-bcdefgh)) :> old definition`,
      selectedConceptBlockId: newConcept,
      expectedConceptBlockId: oldConcept,
      relationFamily: 'definition',
      target: { id: newConcept, type: 'd' },
    });

    expect(plan.kind).toBe('replace-existing-reference');
    expect(plan.diagnostics).toEqual([]);
  });

  it('rejects non-document targets', () => {
    const plan = planCdfConceptBindingEdit({
      sourceBlockId: 'definition-source',
      source: `((20260703020202-bcdefgh)) :> old definition`,
      selectedConceptBlockId: nonDocTarget,
      expectedConceptBlockId: oldConcept,
      relationFamily: 'definition',
      target: { id: nonDocTarget, type: 'p' },
    });

    expect(plan).toEqual(expect.objectContaining({
      kind: 'unavailable',
      diagnostics: [
        expect.objectContaining({
          code: 'invalid-target-block',
          selectedConceptBlockId: nonDocTarget,
        }),
      ],
    }));
  });

  it('rejects invalid grammar and ambiguous concept references', () => {
    expect(planCdfConceptBindingEdit({
      sourceBlockId: 'definition-source',
      source: `((20260703020202-bcdefgh)) :> definition ;; extra`,
      selectedConceptBlockId: newConcept,
      expectedConceptBlockId: oldConcept,
      relationFamily: 'definition',
      target: { id: newConcept, type: 'd' },
    })).toEqual(expect.objectContaining({
      kind: 'unavailable',
      diagnostics: [expect.objectContaining({ code: 'invalid-source-grammar' })],
    }));

    expect(planCdfConceptBindingEdit({
      sourceBlockId: 'definition-source',
      source: `((20260703020202-bcdefgh)) ((20260703099999-staleaa)) :> definition`,
      selectedConceptBlockId: newConcept,
      expectedConceptBlockId: oldConcept,
      relationFamily: 'definition',
      target: { id: newConcept, type: 'd' },
    })).toEqual(expect.objectContaining({
      kind: 'unavailable',
      diagnostics: [expect.objectContaining({ code: 'ambiguous-concept-reference' })],
    }));
  });

  it('reports missing source and missing old concept binding diagnostics', () => {
    expect(planCdfConceptBindingEdit({
      sourceBlockId: '',
      source: '',
      selectedConceptBlockId: newConcept,
      expectedConceptBlockId: oldConcept,
      relationFamily: 'definition',
      target: { id: newConcept, type: 'd' },
    })).toEqual(expect.objectContaining({
      kind: 'unavailable',
      diagnostics: [expect.objectContaining({ code: 'missing-source-block' })],
    }));

    expect(planCdfConceptBindingEdit({
      sourceBlockId: 'unknown-source',
      source: 'plain text without a concept ref',
      selectedConceptBlockId: newConcept,
      expectedConceptBlockId: oldConcept,
      target: { id: newConcept, type: 'd' },
    })).toEqual(expect.objectContaining({
      kind: 'unavailable',
      diagnostics: [expect.objectContaining({ code: 'missing-old-concept-reference' })],
    }));
  });

  it('rejects descriptor empty binding instead of activating through metadata only', () => {
    const plan = planCdfConceptBindingEdit({
      sourceBlockId: 'descriptor-source',
      source: 'cue ;; answer',
      selectedConceptBlockId: newConcept,
      expectedConceptBlockId: '',
      relationFamily: 'descriptor',
      target: { id: newConcept, type: 'd' },
    });

    expect(plan).toEqual(expect.objectContaining({
      kind: 'unavailable',
      diagnostics: [
        expect.objectContaining({
          code: 'descriptor-structure-repair-unavailable',
          sourceBlockId: 'descriptor-source',
          selectedConceptBlockId: newConcept,
        }),
      ],
    }));
    expect(applyCdfConceptBindingEdit(plan)).toEqual({
      ok: false,
      diagnostics: plan.diagnostics,
    });
  });
});
