import { describe, expect, it } from 'vitest';
import { MultiClozeCardRenderService } from '../MultiClozeCardRenderService';

class TestableMultiClozeCardRenderService extends MultiClozeCardRenderService {
  // Avoid touching Siyuan APIs in unit tests.
  protected async loadBreadcrumbs(): Promise<[]> {
    return [];
  }
}

describe('MultiClozeCardRenderService', () => {
  const createCard = (question: string, answer: string) => ({
    blockId: '20260215000000-abcdefg',
    meta: {
      faceIndex: 0,
      faces: [{ question, answer }],
    },
  });

  it('keeps display math answer for block-level math questions', async () => {
    const service = new TestableMultiClozeCardRenderService();
    const vm = await service.prepareViewModel(
      createCard('$$E={\\color{#166534}\\boxed{\\text{[...]}}}$$', '$$MC^2$$')
    );

    expect(vm.renderMode).toBe('default');
    expect(vm.currentFace.answer).toBe('$$MC^2$$');
  });

  it('normalizes display math answer to inline for inline math questions', async () => {
    const service = new TestableMultiClozeCardRenderService();
    const vm = await service.prepareViewModel(
      createCard('$E={\\color{#166534}\\boxed{\\text{[...]}}}$', '$$MC^2$$')
    );

    expect(vm.renderMode).toBe('default');
    expect(vm.currentFace.answer).toBe('$MC^2$');
  });
});
