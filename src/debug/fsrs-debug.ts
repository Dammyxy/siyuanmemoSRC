/**
 * Debug Tools for FSRS Plugin
 *
 * Usage in browser console (F12):
 * 1. Check card type: FSRSDebug.getCardType('block-id')
 * 2. List all cards with types: FSRSDebug.listAllCardTypes()
 * 3. Test Topic filter: FSRSDebug.testTopicFilter()
 */

(window as any).FSRSDebug = {
  /**
   * Get card type for a specific block
   */
  async getCardType(blockId: string) {
    try {
      const response = await fetch('/api/attr/getBlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: blockId })
      });
      const data = await response.json();

      const cardType = data.data?.['custom-fsrs-card-type'];
      const isCard = data.data?.['custom-fsrs-card-id'];

      console.log(`Block: ${blockId}`);
      console.log(`  Is Card: ${isCard ? 'Yes' : 'No'}`);
      console.log(`  Card Type: ${cardType || 'undefined (defaults to Item)'}`);
      console.log(`  All Attributes:`, data.data);

      return { blockId, isCard: !!isCard, cardType: cardType || 'item' };
    } catch (error) {
      console.error('Error:', error);
      return null;
    }
  },

  /**
   * List all cards with their types
   */
  async listAllCardTypes() {
    try {
      // Query all blocks with custom-fsrs-card-id attribute
      const response = await fetch('/api/query/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stmt: `
            SELECT block_id, value
            FROM attributes
            WHERE name = 'custom-fsrs-card-id'
            LIMIT 50
          `
        })
      });
      const data = await response.json();

      const blockIds = data.data.map((row: any) => row.block_id);

      console.log(`Found ${blockIds.length} cards. Checking types...`);

      const results = await Promise.all(
        blockIds.map((id: string) => this.getCardType(id))
      );

      const summary = {
        total: results.length,
        topic: results.filter((r: any) => r?.cardType === 'topic').length,
        item: results.filter((r: any) => r?.cardType === 'item').length,
        undefined: results.filter((r: any) => r?.cardType === 'undefined (defaults to Item)').length,
      };

      console.table(results);
      console.log('Summary:', summary);

      return results;
    } catch (error) {
      console.error('Error:', error);
      return null;
    }
  },

  /**
   * Test Topic filter with current Riff cards
   */
  async testTopicFilter() {
    try {
      // Get Riff due cards
      const response = await fetch('/api/riff/getRiffDueCards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deck: '20230218211946-2kw8jgx' // BUILTIN_DECK_ID
        })
      });
      const data = await response.json();

      if (!data.data || !data.data.cards) {
        console.log('No Riff cards found');
        return;
      }

      const cards = data.data.cards;
      console.log(`Total Riff cards: ${cards.length}`);

      // Check types for first 10 cards
      const sample = cards.slice(0, 10);
      const results = await Promise.all(
        sample.map((card: any) => this.getCardType(card.blockID))
      );

      console.table(results);

      const topicCount = results.filter((r: any) => r?.cardType === 'topic').length;
      const itemCount = results.filter((r: any) => r?.cardType === 'item').length;

      console.log(`Sample (first 10 cards):`);
      console.log(`  Topic: ${topicCount}`);
      console.log(`  Item: ${itemCount}`);
      console.log(`  Undefined: ${results.length - topicCount - itemCount}`);

      return results;
    } catch (error) {
      console.error('Error:', error);
      return null;
    }
  },

  /**
   * Manually set card type
   */
  async setCardType(blockId: string, cardType: 'topic' | 'item') {
    try {
      const response = await fetch('/api/attr/putBlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: blockId,
          attrs: {
            'custom-fsrs-card-type': cardType
          }
        })
      });
      const data = await response.json();

      console.log(`Set ${blockId} to ${cardType}:`, data);

      // Verify
      await this.getCardType(blockId);

      return data;
    } catch (error) {
      console.error('Error:', error);
      return null;
    }
  }
};

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
