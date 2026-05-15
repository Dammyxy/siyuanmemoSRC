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

  it('renders numbered formula clozes without leaking marker ids into math output', async () => {
    const service = new TestableMultiClozeCardRenderService(
      'E=\\cloze{#2}{mc^2}+\\cloze{c3}{x}',
    );

    const vm = await service.prepareViewModel({
      blockId: '20260515120000-inline-marker',
      meta: {
        faceIndex: 0,
        clozeRenderMode: 'inline-formula-cloze',
        faces: [
          {
            question: '$$E={\\color{#166534}\\boxed{\\text{[...]}}}+x$$',
            answer: '$$E={\\color{#166534}mc^2}+x$$',
          },
          {
            question: '$$E=mc^2+{\\color{#166534}\\boxed{\\text{[...]}}}$$',
            answer: '$$E=mc^2+{\\color{#166534}x}$$',
          },
        ],
      },
    });

    expect(vm.frontHtml).toBe('$$E={\\color{#166534}\\boxed{\\text{[...]}}}+x$$');
    expect(vm.backHtml).toBe('$$E={\\color{#166534}mc^2}+x$$');
    expect(vm.frontHtml).not.toContain('\\cloze');
    expect(vm.frontHtml).not.toContain('#2');
    expect(vm.frontHtml).not.toContain('c3');
    expect(vm.backHtml).not.toContain('\\cloze');
    expect(vm.backHtml).not.toContain('#2');
    expect(vm.backHtml).not.toContain('c3');
  });

  it('keeps only the current formula fragment hidden while non-current fragments stay visible', async () => {
    const service = new TestableMultiClozeCardRenderService(
      'P=\\cloze{c1}{a}+\\cloze{c2}{{b}}+\\cloze{c3}{c}',
    );

    const vm = await service.prepareViewModel({
      blockId: '20260515120000-inline-focus',
      meta: {
        faceIndex: 1,
        clozeRenderMode: 'inline-formula-cloze',
        faces: [
          { question: '', answer: '' },
          { question: '', answer: '' },
          { question: '', answer: '' },
        ],
      },
    });

    expect(vm.frontHtml).toBe('$$P=a+{\\color{#166534}\\boxed{\\text{[...]}}}+c$$');
    expect(vm.backHtml).toBe('$$P=a+{\\color{#166534}{b}}+c$$');
    expect(vm.frontHtml).not.toContain('\\cloze');
    expect(vm.backHtml).not.toContain('\\cloze');
  });

  it('falls back to safe stored faces when source formula cloze syntax is malformed', async () => {
    const service = new TestableMultiClozeCardRenderService(
      'E=\\cloze{c1}{mc^2',
    );

    const vm = await service.prepareViewModel({
      blockId: '20260515120000-inline-malformed',
      meta: {
        faceIndex: 0,
        clozeRenderMode: 'inline-formula-cloze',
        faces: [{
          question: '$$E={\\color{#166534}\\boxed{\\text{[...]}}}$$',
          answer: '$$E={\\color{#166534}mc^2}$$',
        }],
      },
    });

    expect(vm.frontHtml).toBe('$$E={\\color{#166534}\\boxed{\\text{[...]}}}$$');
    expect(vm.backHtml).toBe('$$E={\\color{#166534}mc^2}$$');
    expect(vm.frontHtml).not.toContain('\\cloze');
    expect(vm.backHtml).not.toContain('\\cloze');
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

  it('normalizes raw stored formula cloze faces before math rendering when source is unavailable', async () => {
    const service = new TestableMultiClozeCardRenderService(null);

    const vm = await service.prepareViewModel({
      blockId: '20260515120000-inline-raw-stored',
      meta: {
        faceIndex: 0,
        clozeRenderMode: 'inline-formula-cloze',
        faces: [{
          question: 'E=\\cloze{#2}{mc^2}',
          answer: 'E=\\cloze{#2}{mc^2}',
        }],
      },
    });

    expect(vm.frontHtml).toBe('$$E={\\color{#166534}\\boxed{\\text{[...]}}}$$');
    expect(vm.backHtml).toBe('$$E={\\color{#166534}mc^2}$$');
    expect(vm.frontHtml).not.toContain('\\cloze');
    expect(vm.backHtml).not.toContain('\\cloze');
    expect(vm.frontHtml).not.toContain('#2');
    expect(vm.backHtml).not.toContain('#2');
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

  it('repairs stale faceIndex when an inline formula card only has one cloze left', async () => {
    const service = new TestableMultiClozeCardRenderService(
      'P(A|B)=[\\cloze{P(B|A)}*P(A)]/P(B)',
    );

    const vm = await service.prepareViewModel({
      blockId: '20260428093000-inline-stale-face',
      meta: {
        faceIndex: 1,
        clozeRenderMode: 'inline-formula-cloze',
        faces: [{
          question: '$$P(A|B)=[{\\color{#166534}\\boxed{\\text{[...]}}}*P(A)]/P(B)$$',
          answer: '$$P(A|B)=[{\\color{#166534}P(B|A)}*P(A)]/P(B)$$',
        }],
      },
    });

    expect(vm.faceIndex).toBe(0);
    expect(vm.requestedFaceIndex).toBe(1);
    expect(vm.frontHtml).toContain('\\boxed{\\text{[...]}}');
    expect(vm.backHtml).toContain('{\\color{#166534}P(B|A)}');
  });
});
