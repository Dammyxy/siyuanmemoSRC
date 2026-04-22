import { describe, expect, it } from 'vitest';
import { getPromptContractForTask } from '@/application/services/AIPromptContractRegistry';

describe('AIPromptContractRegistry', () => {
  it('keeps concept-coach self-test contracts canonical while enforcing short answers and sparse details', () => {
    const fullRun = getPromptContractForTask('concept-coach/full-run');
    const selfTestTab = getPromptContractForTask('concept-coach/self-test-cards');
    const fullText = fullRun.runtimeLines.join('\n');
    const tabText = selfTestTab.runtimeLines.join('\n');

    expect(fullText).toContain('id、kind、selected、summary、prompt、answer、details、clozeTargets');
    expect(fullText).toContain('answer 尽量控制在 3-20 个字');
    expect(fullText).toContain('details 默认返回空数组');
    expect(fullText).not.toContain('id、mode、kind、selected、summary、draftMarkdown');

    expect(tabText).toContain('answer 尽量控制在 3-20 个字');
    expect(tabText).toContain('details 默认返回空数组');
    expect(tabText).toContain('不要返回 mode-specific draftMarkdown');
  });

  it('exposes cdfStructure as a first-class semantic stage in concept-coach contracts', () => {
    const fullRun = getPromptContractForTask('concept-coach/full-run');
    const cdfTab = getPromptContractForTask('concept-coach/cdf-structure');
    const fullText = fullRun.runtimeLines.join('\n');
    const tabText = cdfTab.runtimeLines.join('\n');

    expect(fullText).toContain('cdfStructure');
    expect(fullText).toContain('anchors');
    expect(fullText).toContain('definitionCandidates');
    expect(fullText).toContain('descriptorGroups');
    expect(fullText).toContain('提示→答案');
    expect(fullText).toContain('items 超过 1 个');
    expect(fullText).toContain('每个 items[].text 都必须写成');
    expect(tabText).toContain('cdfStructure');
    expect(tabText).toContain('conceptName');
    expect(tabText).toContain('前身→恒星');
    expect(tabText).toContain('阶段→恒星演化末期');
    expect(tabText).toContain('只有单条 item 可以保持纯答案文本');
    expect(tabText).toContain('不要返回 ::: / ;;; markdown');
  });
});
