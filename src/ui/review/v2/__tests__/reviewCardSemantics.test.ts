import { describe, expect, it } from 'vitest';
import { isTopicLikeCard } from '../reviewCardSemantics';

describe('reviewCardSemantics', () => {
  it('treats topic and concept as topic-like cards', () => {
    expect(isTopicLikeCard({ type: 'topic' })).toBe(true);
    expect(isTopicLikeCard({ cardType: 'topic' })).toBe(true);
    expect(isTopicLikeCard({ type: 'concept' })).toBe(true);
    expect(isTopicLikeCard({ cardType: 'concept' })).toBe(true);
  });

  it('does not treat item/descriptor as topic-like cards', () => {
    expect(isTopicLikeCard({ type: 'item' })).toBe(false);
    expect(isTopicLikeCard({ cardType: 'descriptor' })).toBe(false);
    expect(isTopicLikeCard(undefined)).toBe(false);
  });
});
