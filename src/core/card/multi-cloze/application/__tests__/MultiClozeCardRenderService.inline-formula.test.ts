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

  it('strips trailing Siyuan block attrs from inline formula source kramdown', async () => {
    const service = new TestableMultiClozeCardRenderService(
      'P(A|B)=[\\cloze{P(B|A)}*P(A)]/P(B) {: custom-fsrs-card-type="item" custom-xiuyuan-id="xy_1" id="block-1" updated="20260415120000"}',
    );

    const vm = await service.prepareViewModel({
      blockId: '20260415120000-inline-attrs',
      meta: {
        faceIndex: 0,
        clozeRenderMode: 'inline-formula-cloze',
        faces: [{
          question: '$$P(A|B)=[{\\color{#166534}\\boxed{\\text{[...]}}}*P(A)]/P(B)$$',
          answer: '$$P(A|B)=[{\\color{#166534}P(B|A)}*P(A)]/P(B)$$',
        }],
      },
    });

    expect(vm.frontHtml).not.toContain('{:');
    expect(vm.frontHtml).not.toContain('custom-fsrs-card-type');
    expect(vm.backHtml).not.toContain('{:');
    expect(vm.backHtml).not.toContain('custom-fsrs-card-type');
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

  it('strips trailing Siyuan block attrs from stored inline formula faces when source kramdown is unavailable', async () => {
    const service = new TestableMultiClozeCardRenderService(null);

    const vm = await service.prepareViewModel({
      blockId: '20260415120000-inline-fallback-attrs',
      meta: {
        faceIndex: 0,
        clozeRenderMode: 'inline-formula-cloze',
        faces: [{
          question: 'P(A|B)=[{\\color{#166534}\\boxed{\\text{[...]}}}*P(A)]/P(B) {: custom-fsrs-card-type="item" id="block-1"}',
          answer: 'P(A|B)=[{\\color{#166534}P(B|A)}*P(A)]/P(B) {: custom-fsrs-card-type="item" id="block-1"}',
        }],
      },
    });

    expect(vm.frontHtml).not.toContain('{:');
    expect(vm.backHtml).not.toContain('{:');
    expect(vm.frontHtml.startsWith('$$')).toBe(true);
    expect(vm.backHtml.endsWith('$$')).toBe(true);
  });
});
