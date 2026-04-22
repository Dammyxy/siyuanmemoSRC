import { describe, expect, it } from 'vitest';
import { HIDE_CURRENT_IN_SCOPE_COMMAND_ID } from '@/core/queue/abstraction/customActionIds';
import { resolveReviewKeyAction } from '../reviewKeyActionResolver';

describe('reviewKeyActionResolver', () => {
  it('uses Space/Enter as immediate grade(3) for topic-like cards before reveal', () => {
    expect(resolveReviewKeyAction({
      key: ' ',
      answerShown: false,
      isTopicLike: true,
    })).toEqual({ type: 'grade', rating: 3 });

    expect(resolveReviewKeyAction({
      key: 'enter',
      answerShown: false,
      isTopicLike: true,
    })).toEqual({ type: 'grade', rating: 3 });
  });

  it('uses Space/Enter as hide-current-in-scope for filter-group topic-like cards', () => {
    expect(resolveReviewKeyAction({
      key: ' ',
      answerShown: false,
      isTopicLike: true,
      topicLikeAction: 'hide-current-in-scope',
    })).toEqual({
      type: 'command',
      commandId: HIDE_CURRENT_IN_SCOPE_COMMAND_ID,
    });

    expect(resolveReviewKeyAction({
      key: 'enter',
      answerShown: false,
      isTopicLike: true,
      topicLikeAction: 'hide-current-in-scope',
    })).toEqual({
      type: 'command',
      commandId: HIDE_CURRENT_IN_SCOPE_COMMAND_ID,
    });
  });

  it('does not rate item cards on rating keys before answer is shown', () => {
    expect(resolveReviewKeyAction({
      key: 'd',
      answerShown: false,
      isTopicLike: false,
    })).toEqual({ type: 'none' });
  });

  it('maps legacy letter keys to ratings when answer is shown', () => {
    expect(resolveReviewKeyAction({
      key: 's',
      answerShown: true,
      isTopicLike: false,
    })).toEqual({ type: 'grade', rating: 2 });

    expect(resolveReviewKeyAction({
      key: 'l',
      answerShown: true,
      isTopicLike: false,
    })).toEqual({ type: 'grade', rating: 3 });
  });

  it('keeps skip on 0/x and not on s', () => {
    expect(resolveReviewKeyAction({
      key: 'x',
      answerShown: true,
      isTopicLike: false,
    })).toEqual({ type: 'skip' });

    expect(resolveReviewKeyAction({
      key: '0',
      answerShown: true,
      isTopicLike: false,
    })).toEqual({ type: 'skip' });
  });
});
