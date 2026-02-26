/**
 * Debug Tools for FSRS Plugin
 *
 * Usage in browser console (F12):
 * 1. Check card type: FSRSDebug.getCardType('block-id')
 * 2. List all cards with types: FSRSDebug.listAllCardTypes()
 * 3. Test Topic filter: FSRSDebug.testTopicFilter()
 */

type CardTypeValue = 'topic' | 'item' | 'undefined (defaults to Item)';

interface CardTypeInfo {
  blockId: string;
  isCard: boolean;
  cardType: CardTypeValue;
}

interface BlockAttributes {
  [key: string]: string | undefined;
}

interface GetBlockResponse {
  data?: BlockAttributes;
}

interface SqlAttributeRow {
  block_id: string;
}

interface SqlResponse {
  data?: SqlAttributeRow[];
}

interface RiffDueCard {
  blockID: string;
}

interface RiffDueCardsResponse {
  data?: {
    cards?: RiffDueCard[];
  };
}

interface FSRSDebugApi {
  getCardType(blockId: string): Promise<CardTypeInfo | null>;
  listAllCardTypes(): Promise<CardTypeInfo[] | null>;
  testTopicFilter(): Promise<CardTypeInfo[] | null>;
  setCardType(blockId: string, cardType: 'topic' | 'item'): Promise<unknown | null>;
}

declare global {
  interface Window {
    FSRSDebug?: FSRSDebugApi;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readJson<T>(value: unknown): T | null {
  return isRecord(value) ? (value as T) : null;
}

function toCardTypeValue(value: unknown): CardTypeValue {
  if (value === 'topic' || value === 'item') {
    return value;
  }
  return 'undefined (defaults to Item)';
}

const fsrsDebug: FSRSDebugApi = {
  /**
   * Get card type for a specific block
   */
  async getCardType(blockId: string): Promise<CardTypeInfo | null> {
    try {
      const response = await fetch('/api/attr/getBlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: blockId }),
      });
      const rawData = await response.json();
      const data = readJson<GetBlockResponse>(rawData);
      const attrs = data?.data ?? {};

      const cardType = toCardTypeValue(attrs['custom-fsrs-card-type']);
      const isCard = attrs['custom-fsrs-card-id'];

      console.log(`Block: ${blockId}`);
      console.log(`  Is Card: ${isCard ? 'Yes' : 'No'}`);
      console.log(`  Card Type: ${cardType}`);
      console.log('  All Attributes:', attrs);

      return { blockId, isCard: !!isCard, cardType };
    } catch (error) {
      console.error('Error:', error);
      return null;
    }
  },

  /**
   * List all cards with their types
   */
  async listAllCardTypes(): Promise<CardTypeInfo[] | null> {
    try {
      const response = await fetch('/api/query/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stmt: `
            SELECT block_id, value
            FROM attributes
            WHERE name = 'custom-fsrs-card-id'
            LIMIT 50
          `,
        }),
      });

      const rawData = await response.json();
      const data = readJson<SqlResponse>(rawData);
      const blockIds = (data?.data ?? []).map(row => row.block_id);

      console.log(`Found ${blockIds.length} cards. Checking types...`);

      const results = await Promise.all(blockIds.map(id => fsrsDebug.getCardType(id)));
      const validResults = results.filter((result): result is CardTypeInfo => result !== null);

      const summary = {
        total: validResults.length,
        topic: validResults.filter(result => result.cardType === 'topic').length,
        item: validResults.filter(result => result.cardType === 'item').length,
        undefined: validResults.filter(result => result.cardType === 'undefined (defaults to Item)').length,
      };

      console.table(validResults);
      console.log('Summary:', summary);

      return validResults;
    } catch (error) {
      console.error('Error:', error);
      return null;
    }
  },

  /**
   * Test Topic filter with current Riff cards
   */
  async testTopicFilter(): Promise<CardTypeInfo[] | null> {
    try {
      const response = await fetch('/api/riff/getRiffDueCards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deck: '20230218211946-2kw8jgx', // BUILTIN_DECK_ID
        }),
      });
      const rawData = await response.json();
      const data = readJson<RiffDueCardsResponse>(rawData);
      const cards = data?.data?.cards ?? [];

      if (cards.length === 0) {
        console.log('No Riff cards found');
        return [];
      }

      console.log(`Total Riff cards: ${cards.length}`);

      const sample = cards.slice(0, 10);
      const results = await Promise.all(sample.map(card => fsrsDebug.getCardType(card.blockID)));
      const validResults = results.filter((result): result is CardTypeInfo => result !== null);

      console.table(validResults);

      const topicCount = validResults.filter(result => result.cardType === 'topic').length;
      const itemCount = validResults.filter(result => result.cardType === 'item').length;

      console.log('Sample (first 10 cards):');
      console.log(`  Topic: ${topicCount}`);
      console.log(`  Item: ${itemCount}`);
      console.log(`  Undefined: ${validResults.length - topicCount - itemCount}`);

      return validResults;
    } catch (error) {
      console.error('Error:', error);
      return null;
    }
  },

  /**
   * Manually set card type
   */
  async setCardType(blockId: string, cardType: 'topic' | 'item'): Promise<unknown | null> {
    try {
      const response = await fetch('/api/attr/putBlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: blockId,
          attrs: {
            'custom-fsrs-card-type': cardType,
          },
        }),
      });
      const data = await response.json();

      console.log(`Set ${blockId} to ${cardType}:`, data);

      await fsrsDebug.getCardType(blockId);
      return data;
    } catch (error) {
      console.error('Error:', error);
      return null;
    }
  },
};

window.FSRSDebug = fsrsDebug;

console.log(`
🔧 FSRS Debug Tools Loaded!

Usage:
  FSRSDebug.getCardType('block-id')           - Check single card type
  FSRSDebug.listAllCardTypes()                 - List all cards with types
  FSRSDebug.testTopicFilter()                  - Test Topic filter on Riff cards
  FSRSDebug.setCardType('block-id', 'topic')  - Manually set card type

Example:
  FSRSDebug.testTopicFilter()
`);
