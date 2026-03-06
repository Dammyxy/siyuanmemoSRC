import { describe, expect, it } from 'vitest';
import type { PluginSettings } from '../settings';
import {
  ACTIVE_FSRS_VERSION,
  DEFAULT_FSRS_WEIGHTS,
  DEFAULT_SETTINGS,
  FSRS_WEIGHT_COUNT,
  LEGACY_FSRS_V5,
  normalizePluginSettings,
} from '../settings';

function cloneSettings(): PluginSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as PluginSettings;
}

describe('settings normalization', () => {
  it('fills FSRS weights from 19 to 21 with ts-fsrs defaults', () => {
    const legacy = cloneSettings();
    legacy.fsrs.weights = legacy.fsrs.weights.slice(0, FSRS_WEIGHT_COUNT - 2);

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.fsrs.weights).toHaveLength(FSRS_WEIGHT_COUNT);
    expect(normalized.settings.fsrs.weights.slice(0, FSRS_WEIGHT_COUNT - 2)).toEqual(
      legacy.fsrs.weights
    );
    expect(normalized.settings.fsrs.weights.slice(FSRS_WEIGHT_COUNT - 2)).toEqual(
      DEFAULT_FSRS_WEIGHTS.slice(FSRS_WEIGHT_COUNT - 2)
    );
  });

  it('keeps already normalized 21-weight settings unchanged', () => {
    const current = cloneSettings();

    const normalized = normalizePluginSettings(current);

    expect(normalized.changed).toBe(false);
    expect(normalized.settings.fsrs.weights).toHaveLength(FSRS_WEIGHT_COUNT);
    expect(normalized.settings.fsrs.weights).toEqual(current.fsrs.weights);
  });

  it('migrates scheduler aliases from fsrs-v5 to fsrs-v6', () => {
    const legacy = cloneSettings();
    if (!legacy.scheduler) {
      throw new Error('DEFAULT_SETTINGS.scheduler is required for this test');
    }
    legacy.scheduler.defaultScheduler = LEGACY_FSRS_V5 as typeof legacy.scheduler.defaultScheduler;
    legacy.scheduler.itemScheduler = LEGACY_FSRS_V5 as typeof legacy.scheduler.itemScheduler;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.scheduler?.defaultScheduler).toBe(ACTIVE_FSRS_VERSION);
    expect(normalized.settings.scheduler?.itemScheduler).toBe(ACTIVE_FSRS_VERSION);
  });

  it('fills quickCard.flashcard defaults when missing', () => {
    const legacy = cloneSettings();
    delete (legacy.quickCard as Partial<typeof legacy.quickCard>).flashcard;
    delete (legacy.quickCard as Partial<typeof legacy.quickCard>).flashcardSeededFromSiyuan;

    const normalized = normalizePluginSettings(legacy);

    expect(normalized.changed).toBe(true);
    expect(normalized.settings.quickCard.flashcard).toEqual(DEFAULT_SETTINGS.quickCard.flashcard);
    expect(normalized.settings.quickCard.flashcardSeededFromSiyuan).toBe(false);
  });

  it('is idempotent after first normalization', () => {
    const legacy = cloneSettings();
    legacy.fsrs.weights = legacy.fsrs.weights.slice(0, FSRS_WEIGHT_COUNT - 2);
    if (legacy.scheduler) {
      legacy.scheduler.defaultScheduler = LEGACY_FSRS_V5 as typeof legacy.scheduler.defaultScheduler;
      legacy.scheduler.itemScheduler = LEGACY_FSRS_V5 as typeof legacy.scheduler.itemScheduler;
    }
    delete (legacy.quickCard as Partial<typeof legacy.quickCard>).flashcard;
    delete (legacy.quickCard as Partial<typeof legacy.quickCard>).flashcardSeededFromSiyuan;

    const firstPass = normalizePluginSettings(legacy);
    const secondPass = normalizePluginSettings(firstPass.settings);

    expect(firstPass.changed).toBe(true);
    expect(secondPass.changed).toBe(false);
    expect(secondPass.settings).toEqual(firstPass.settings);
  });
});
