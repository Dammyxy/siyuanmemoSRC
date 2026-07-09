import { describe, expect, it } from 'vitest';
import {
  attachNativeRiffImportReceiptToMeta,
  buildNativeRiffImportReceipt,
  readNativeRiffImportReceipt,
} from '@/core/card/semantics';

describe('Native Riff import receipt', () => {
  it('builds and reads normalized immutable provenance metadata', () => {
    const receipt = buildNativeRiffImportReceipt({
      nativeCardId: ' 20260610192850-rzrmc29 ',
      deckId: ' deck-1 ',
      importedAt: 1_788_537_600_000,
    });
    const meta = attachNativeRiffImportReceiptToMeta({
      ownership: 'local-owned',
    }, receipt);

    expect(receipt).toEqual({
      version: 1,
      nativeCardId: '20260610192850-rzrmc29',
      deckId: 'deck-1',
      importedAt: 1_788_537_600_000,
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(readNativeRiffImportReceipt({ meta })).toEqual(receipt);
  });

  it('preserves the first valid receipt when metadata is attached again', () => {
    const firstReceipt = buildNativeRiffImportReceipt({
      nativeCardId: 'riff-first',
      deckId: 'deck-1',
      importedAt: 100,
    });
    const replacementReceipt = buildNativeRiffImportReceipt({
      nativeCardId: 'riff-replacement',
      deckId: 'deck-2',
      importedAt: 200,
    });

    const meta = attachNativeRiffImportReceiptToMeta(
      attachNativeRiffImportReceiptToMeta({}, firstReceipt),
      replacementReceipt,
    );

    expect(readNativeRiffImportReceipt({ meta })).toEqual(firstReceipt);
  });
});
