import { describe, expect, it } from 'vitest';
import { MultiClozeCardRenderService } from '../MultiClozeCardRenderService';

class TestableMultiClozeCardRenderService extends MultiClozeCardRenderService {
  constructor(private readonly sourceKramdown: string | null = null) {
    super();
  }

  protected async loadBreadcrumbs(): Promise<[]> {
    return [];
  }

  protected async loadSourceKramdown(): Promise<string | null> {
    return this.sourceKramdown;
  }
}

describe('MultiClozeCardRenderService inline formula mode', () => {
  it('renders source formula clozes as full expressions on both sides', async () => {
    const service = new TestableMultiClozeCardRenderService(
      'P(A|B)=[\\cloze{P(B|A)}*P(A)]/P(B)',
    );

    const vm = await service.prepareViewModel({
      blockId: '20260301120000-inline01',
      meta: {
        faceIndex: 0,
        clozeRenderMode: 'inline-formula-cloze',
        faces: [{
          question: '$$P(A|B)=[{\\color{#166534}\\boxed{\\text{[...]}}}*P(A)]/P(B)$$',
          answer: '$$P(A|B)=[{\\color{#166534}P(B|A)}*P(A)]/P(B)$$',
        }],
      },
    });

    expect(vm.renderMode).toBe('inline-formula-cloze');
    expect(vm.frontHtml.startsWith('$$')).toBe(true);
    expect(vm.frontHtml).toContain('\\boxed{\\text{[...]}}');
    expect(vm.backHtml.startsWith('$$')).toBe(true);
    expect(vm.backHtml).toContain('{\\color{#166534}P(B|A)}');
  });

  it('keeps stored full-expression faces as the fallback in inline formula mode', async () => {
    const service = new TestableMultiClozeCardRenderService(null);

    const vm = await service.prepareViewModel({
      blockId: '20260301120000-inline02',
      meta: {
        faceIndex: 0,
        clozeRenderMode: 'inline-formula-cloze',
        faces: [{
          question: 'P(A|B)=[{\\color{#166534}\\boxed{\\text{[...]}}}*P(A)]/P(B)',
          answer: 'P(A|B)=[{\\color{#166534}P(B|A)}*P(A)]/P(B)',
        }],
      },
    });

    expect(vm.frontHtml.startsWith('$$')).toBe(true);
    expect(vm.frontHtml.endsWith('$$')).toBe(true);
    expect(vm.backHtml.startsWith('$$')).toBe(true);
    expect(vm.backHtml.endsWith('$$')).toBe(true);
    expect(vm.backHtml).toContain('{\\color{#166534}P(B|A)}');
  });
});
