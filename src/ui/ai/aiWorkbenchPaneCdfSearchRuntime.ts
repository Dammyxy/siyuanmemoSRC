import { ref } from 'vue';
import type { AIWorkbenchConceptDocumentSearchResult } from '@/types/ai';

export function createAiWorkbenchPaneCdfSearchRuntime() {
  const openKeys = ref<string[]>([]);
  const queryByKey = ref<Record<string, string>>({});
  const busyKeys = ref<string[]>([]);
  const errors = ref<Record<string, string>>({});
  const resultsByKey = ref<Record<string, AIWorkbenchConceptDocumentSearchResult[]>>({});
  const conceptDocumentBusyKeys = ref<string[]>([]);
  const conceptDocumentErrors = ref<Record<string, string>>({});

  function key(messageId: string, anchorId: string): string {
    return `${messageId}::${anchorId}`;
  }

  function isOpen(messageId: string, anchorId: string): boolean {
    return openKeys.value.includes(key(messageId, anchorId));
  }

  function isBusy(messageId: string, anchorId: string): boolean {
    return busyKeys.value.includes(key(messageId, anchorId));
  }

  function isConceptDocumentBusy(messageId: string, anchorId: string): boolean {
    return conceptDocumentBusyKeys.value.includes(key(messageId, anchorId));
  }

  function query(messageId: string, anchorId: string): string {
    return queryByKey.value[key(messageId, anchorId)] || '';
  }

  function error(messageId: string, anchorId: string): string {
    return errors.value[key(messageId, anchorId)] || '';
  }

  function conceptDocumentError(messageId: string, anchorId: string): string {
    return conceptDocumentErrors.value[key(messageId, anchorId)] || '';
  }

  function results(messageId: string, anchorId: string): AIWorkbenchConceptDocumentSearchResult[] {
    return resultsByKey.value[key(messageId, anchorId)] || [];
  }

  function setQuery(messageId: string, anchorId: string, value: string): void {
    queryByKey.value = {
      ...queryByKey.value,
      [key(messageId, anchorId)]: value,
    };
  }

  return {
    openKeys,
    queryByKey,
    busyKeys,
    errors,
    resultsByKey,
    conceptDocumentBusyKeys,
    conceptDocumentErrors,
    key,
    isOpen,
    isBusy,
    isConceptDocumentBusy,
    query,
    error,
    conceptDocumentError,
    results,
    setQuery,
  };
}
