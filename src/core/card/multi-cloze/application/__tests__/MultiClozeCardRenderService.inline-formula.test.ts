import { describe, expect, it } from 'vitest';
import { MultiClozeCardRenderService } from '../MultiClozeCardRenderService';

class TestableMultiClozeCardRenderService extends MultiClozeCardRenderService {
  protected async loadBreadcrumbs(): Promise<[]> {
    return [];
  }
}

describe('MultiClozeCardRenderService inline formula mode', () => {
  const service = new TestableMultiClozeCardRenderService();

  it('keeps inline formula question untouched when render mode is inline-formula-cloze', async () => {
    const vm = await service.prepareViewModel({
      blockId: '20260301120000-inline01',
      meta: {
        faceIndex: 0,
        clozeRenderMode: 'inline-formula-cloze',
        faces: [{
          question: '$$E={\\color{#166534}\\boxed{\\text{[...]}}}$$',
          answer: '$$E={\\color{#166534}MC^2}$$',
        }],
      },
    });

    expect(vm.renderMode).toBe('inline-formula-cloze');
    expect(vm.currentFace.question).toContain('\\boxed{\\text{[...]}}');
    expect(vm.currentFace.question).not.toContain('<mark>');
    expect(vm.currentFace.answer).toContain('{\\color{#166534}MC^2}');
  });

  it('uses default mode and mark wrapping when inline mode is not set', async () => {
    const vm = await service.prepareViewModel({
      blockId: '20260301120000-inline02',
      meta: {
        faceIndex: 0,
        faces: [{
          question: 'alpha [...] beta',
          answer: 'gamma',
        }],
      },
    });

    expect(vm.renderMode).toBe('default');
    expect(vm.currentFace.question).toContain('<mark>[...]</mark>');
  });

  it('normalizes legacy inline formula faces without math delimiters', async () => {
    const vm = await service.prepareViewModel({
      blockId: '20260301120000-inline03',
      meta: {
        faceIndex: 0,
        clozeRenderMode: 'inline-formula-cloze',
        faces: [{
          question: 'P(A|B)=[{\\color{#166534}\\boxed{\\text{[...]}}}*P(A)]/P(B)',
          answer: 'P(A|B)=[{\\color{#166534}P(B|A)}*P(A)]/P(B)',
        }],
      },
    });

    expect(vm.currentFace.question.startsWith('$$')).toBe(true);
    expect(vm.currentFace.question.endsWith('$$')).toBe(true);
    expect(vm.currentFace.answer.startsWith('$$')).toBe(true);
    expect(vm.currentFace.answer.endsWith('$$')).toBe(true);
  });
});
