import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/types/result';
import { XiuyuanRepository } from '../XiuyuanRepository';
import { Xiuyuan } from '../../domain/Xiuyuan';
import { BlockId } from '../../domain/BlockId';
import { TemplateId } from '../../domain/TemplateId';
import { CardFace } from '../../domain/CardFace';

const { setBlockAttrsMock } = vi.hoisted(() => ({
  setBlockAttrsMock: vi.fn(),
}));

vi.mock('@/core/siyuan/api', () => ({
  setBlockAttrs: setBlockAttrsMock,
}));

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

function createStorageMock() {
  return {
    getXiuYuan: vi.fn(() => undefined),
    upsertXiuYuan: vi.fn(),
    getAllCards: vi.fn(() => []),
    getCardsByXiuyuanId: vi.fn(() => []),
    deleteCard: vi.fn(async () => ok(undefined)),
    getCard: vi.fn(() => undefined),
    updateCard: vi.fn(async () => ok(undefined)),
    createCard: vi.fn(async () => ok(undefined)),
    save: vi.fn(async () => ok(undefined)),
    getAllXiuYuans: vi.fn(() => []),
    deleteXiuYuan: vi.fn(async () => ok(undefined)),
    getCardDTO: vi.fn(),
  };
}

function createManagedRiffXiuyuan(meta: Record<string, unknown> = {}): Xiuyuan {
  return must(
    Xiuyuan.create({
      blockIDs: [must(BlockId.create('20260102000001-riff001'))],
      templateID: must(TemplateId.create('builtin-riff-sync')),
      faces: [
        must(
          CardFace.create({
            question: 'What is Riff sync?',
            answer: 'Managed by incremental sync',
          })
        ),
      ],
      meta: {
        source: 'riff-sync',
        ...meta,
      },
    })
  );
}

describe('XiuyuanRepository managed riff binding attrs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setBlockAttrsMock.mockResolvedValue(undefined);
  });

  it('does not persist custom-xiuyuan-id for managed riff xiuyuans on save', async () => {
    const repository = new XiuyuanRepository(createStorageMock() as any);
    const xiuyuan = createManagedRiffXiuyuan();

    const result = await repository.save(xiuyuan);

    expect(result.ok).toBe(true);
    expect(setBlockAttrsMock).not.toHaveBeenCalled();
  });

  it('still persists card type attrs for managed riff xiuyuans without writing custom-xiuyuan-id', async () => {
    const repository = new XiuyuanRepository(createStorageMock() as any);
    const xiuyuan = createManagedRiffXiuyuan({ cardType: 'topic' });

    const result = await repository.save(xiuyuan);

    expect(result.ok).toBe(true);
    expect(setBlockAttrsMock).toHaveBeenCalledWith(
      '20260102000001-riff001',
      { 'custom-fsrs-card-type': 'topic' }
    );
  });

  it('does not clear custom-xiuyuan-id for managed riff xiuyuans on delete', async () => {
    const storageMock = createStorageMock();
    const repository = new XiuyuanRepository(storageMock as any);
    const xiuyuan = createManagedRiffXiuyuan();

    const result = await repository.delete(xiuyuan);

    expect(result.ok).toBe(true);
    expect(storageMock.deleteXiuYuan).toHaveBeenCalledWith(xiuyuan.getId().getValue());
    expect(setBlockAttrsMock).not.toHaveBeenCalled();
  });
});
