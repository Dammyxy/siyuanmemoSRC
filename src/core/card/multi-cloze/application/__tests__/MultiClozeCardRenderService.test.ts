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

    expect(vm.frontContent.html).toBe(
      '<rich>**Alpha** <span data-type="mark" class="siyuanmemo-multi-cloze__placeholder" style="--siyuanmemo-multi-cloze-blank-width: 4ch">[...]</span> and <span data-type="mark" class="siyuanmemo-multi-cloze__answer siyuanmemo-multi-cloze__answer--context">Gamma</span></rich>',
    );
    expect(vm.frontContent.html).not.toContain('==[...]==');
    expect(vm.backContent.html).toBe(
      '<rich>**Alpha** <span data-type="mark" class="siyuanmemo-multi-cloze__answer siyuanmemo-multi-cloze__answer--current">Beta</span> and <span data-type="mark" class="siyuanmemo-multi-cloze__answer siyuanmemo-multi-cloze__answer--context">Gamma</span></rich>',
    );
  });

  it('adds bounded placeholder width for text and complex source answers', async () => {
    const service = new TestableMultiClozeCardRenderService('Short {{answer}} and formula {{$E=mc^2$}}');

    const textVm = await service.prepareViewModel({
      blockId: '20260215000000-width-text',
      meta: {
        faceIndex: 0,
        faces: [
          { question: 'Short <mark>[...]</mark> and formula $E=mc^2$', answer: 'answer' },
          { question: 'Short answer and formula <mark>[...]</mark>', answer: '$E=mc^2$' },
        ],
      },
    });
    const complexVm = await service.prepareViewModel({
      blockId: '20260215000000-width-complex',
      meta: {
        faceIndex: 1,
        faces: [
          { question: 'Short <mark>[...]</mark> and formula $E=mc^2$', answer: 'answer' },
          { question: 'Short answer and formula <mark>[...]</mark>', answer: '$E=mc^2$' },
        ],
      },
    });

    expect(textVm.frontContent.html).toContain('style="--siyuanmemo-multi-cloze-blank-width: 6ch"');
    expect(complexVm.frontContent.html).toContain('style="--siyuanmemo-multi-cloze-blank-width: 12ch"');
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

    expect(vm.frontContent.html).toBe(
      '<rich>Alpha <span data-type="mark" class="siyuanmemo-multi-cloze__placeholder" style="--siyuanmemo-multi-cloze-blank-width: 4ch">[...]</span> gamma</rich>',
    );
    expect(vm.backContent.html).toBe(
      '<rich>Alpha <span data-type="mark" class="siyuanmemo-multi-cloze__answer siyuanmemo-multi-cloze__answer--current">Beta</span> gamma</rich>',
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

    expect(vm.frontContent.html).toBe(
      '<rich>**Danger** unit should have <span data-type="mark" class="siyuanmemo-multi-cloze__placeholder" style="--siyuanmemo-multi-cloze-blank-width: 4ch">[...]</span> conditions and <a href="siyuan://blocks/block-1">link</a></rich>',
    );
    expect(vm.backContent.html).toBe(
      '<rich>**Danger** unit should have <span data-type="mark" class="siyuanmemo-multi-cloze__answer siyuanmemo-multi-cloze__answer--current">safe</span> conditions and <a href="siyuan://blocks/block-1">link</a></rich>',
    );
    expect(vm.frontContent.atoms).toContainEqual(expect.objectContaining({
      kind: 'siyuan-link',
      target: 'siyuan://blocks/block-1',
      label: 'link',
    }));
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

    expect(vm.frontContent.html).toBe(
      '<rich>Alpha Beta <span data-type="mark" class="siyuanmemo-multi-cloze__placeholder" style="--siyuanmemo-multi-cloze-blank-width: 5ch">[...]</span></rich>',
    );
    expect(vm.backContent.html).toBe(
      '<rich>Alpha Beta <span data-type="mark" class="siyuanmemo-multi-cloze__answer siyuanmemo-multi-cloze__answer--current">Gamma</span></rich>',
    );
  });

  it('uses faceKey face index before stale legacy meta faceIndex', async () => {
    const service = new TestableMultiClozeCardRenderService('Alpha {{Beta}} and {{Gamma}}');

    const vm = await service.prepareViewModel({
      blockId: '20260215000000-facekey',
      faceKey: { ruleId: 'multi-cloze', faceIndex: 1 },
      meta: {
        faceIndex: 0,
        faces: [
          { question: 'Alpha <mark>[...]</mark> and Gamma', answer: 'Beta' },
          { question: 'Alpha Beta and <mark>[...]</mark>', answer: 'Gamma' },
        ],
      },
    });

    expect(vm.faceIndex).toBe(1);
    expect(vm.frontContent.html).toContain('Alpha <span data-type="mark" class="siyuanmemo-multi-cloze__answer siyuanmemo-multi-cloze__answer--context">Beta</span> and <span data-type="mark" class="siyuanmemo-multi-cloze__placeholder"');
    expect(vm.backContent.html).toContain('Alpha <span data-type="mark" class="siyuanmemo-multi-cloze__answer siyuanmemo-multi-cloze__answer--context">Beta</span> and <span data-type="mark" class="siyuanmemo-multi-cloze__answer siyuanmemo-multi-cloze__answer--current">Gamma</span>');
  });
});
