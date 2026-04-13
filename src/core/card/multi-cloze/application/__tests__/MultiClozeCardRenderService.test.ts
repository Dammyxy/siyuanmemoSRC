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

  protected renderRichKramdown(kramdown: string): string {
    return `<rich>${kramdown}</rich>`;
  }
}

describe('MultiClozeCardRenderService', () => {
  it('renders source kramdown with only the current cloze hidden and then restored inline', async () => {
    const service = new TestableMultiClozeCardRenderService('**Alpha** {{Beta}} and {{Gamma}}');

    const vm = await service.prepareViewModel({
      blockId: '20260215000000-source01',
      meta: {
        faceIndex: 0,
        faces: [
          { question: '**Alpha** <mark>[...]</mark> and Gamma', answer: 'Beta' },
          { question: '**Alpha** Beta and <mark>[...]</mark>', answer: 'Gamma' },
        ],
      },
    });

    expect(vm.frontHtml).toBe(
      '<rich>**Alpha** <span data-type="mark" class="siyuanmemo-multi-cloze__placeholder">[...]</span> and Gamma</rich>',
    );
    expect(vm.frontHtml).not.toContain('==[...]==');
    expect(vm.backHtml).toBe(
      '<rich>**Alpha** <span data-type="mark" class="siyuanmemo-multi-cloze__answer">Beta</span> and Gamma</rich>',
    );
  });

  it('strips trailing block attribute lines from source kramdown before rendering', async () => {
    const service = new TestableMultiClozeCardRenderService([
      'Alpha {{Beta}} gamma',
      '* {: updated="20260412142656" custom-xiuyuan-id="xy_1" id="block-1"}',
    ].join('\n'));

    const vm = await service.prepareViewModel({
      blockId: '20260215000000-source-attrs',
      meta: {
        faceIndex: 0,
        faces: [{
          question: 'Alpha <mark>[...]</mark> gamma',
          answer: 'Beta',
        }],
      },
    });

    expect(vm.frontHtml).toBe(
      '<rich>Alpha <span data-type="mark" class="siyuanmemo-multi-cloze__placeholder">[...]</span> gamma</rich>',
    );
    expect(vm.backHtml).toBe(
      '<rich>Alpha <span data-type="mark" class="siyuanmemo-multi-cloze__answer">Beta</span> gamma</rich>',
    );
  });

  it('falls back to stored faces and restores the answer inside the cloze position when source kramdown is unavailable', async () => {
    const service = new TestableMultiClozeCardRenderService(null);

    const vm = await service.prepareViewModel({
      blockId: '20260215000000-fallback01',
      meta: {
        faceIndex: 0,
        faces: [{
          question: '**Danger** unit should have [...] conditions and [link](siyuan://blocks/block-1)',
          answer: 'safe',
        }],
      },
    });

    expect(vm.frontHtml).toBe(
      '<rich>**Danger** unit should have <span data-type="mark" class="siyuanmemo-multi-cloze__placeholder">[...]</span> conditions and [link](siyuan://blocks/block-1)</rich>',
    );
    expect(vm.backHtml).toBe(
      '<rich>**Danger** unit should have <span data-type="mark" class="siyuanmemo-multi-cloze__answer">safe</span> conditions and [link](siyuan://blocks/block-1)</rich>',
    );
  });

  it('falls back to stored faces when the source cloze count no longer matches persisted multi-face metadata', async () => {
    const service = new TestableMultiClozeCardRenderService('Alpha {{Beta}} only');

    const vm = await service.prepareViewModel({
      blockId: '20260215000000-fallback02',
      meta: {
        faceIndex: 1,
        faces: [
          { question: 'Alpha <mark>[...]</mark> Gamma', answer: 'Beta' },
          { question: 'Alpha Beta <mark>[...]</mark>', answer: 'Gamma' },
        ],
      },
    });

    expect(vm.frontHtml).toBe(
      '<rich>Alpha Beta <span data-type="mark" class="siyuanmemo-multi-cloze__placeholder">[...]</span></rich>',
    );
    expect(vm.backHtml).toBe(
      '<rich>Alpha Beta <span data-type="mark" class="siyuanmemo-multi-cloze__answer">Gamma</span></rich>',
    );
  });
});
