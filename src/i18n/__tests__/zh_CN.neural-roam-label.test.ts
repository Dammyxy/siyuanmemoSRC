import { describe, expect, it } from 'vitest';
import zhCN from '../zh_CN.json';

describe('zh_CN neural roam labels', () => {
  it('uses english card type names in chinese UI copy', () => {
    expect(zhCN.cardTypeTopic).toBe('Topic');
    expect(zhCN.cardTypeItem).toBe('Item');
    expect(zhCN.cardTypeConcept).toBe('Concept');
    expect(zhCN.cardTypeDescriptor).toBe('Descriptor');
    expect(zhCN.cardTypeTopicOnly).toBe('仅 Topic');
    expect(zhCN.cardTypeItemOnly).toBe('仅 Item');
    expect(zhCN.cardTypeConceptOnly).toBe('仅 Concept');
    expect(zhCN.cardTypeDescriptorOnly).toBe('仅 Descriptor');
  });

  it('renames route log and activation trace surfaces', () => {
    expect(zhCN.roamHistory).toBe('航线日志');
    expect(zhCN.viewHistory).toBe('查看航线日志');
    expect(zhCN.neuralHistoryMenu).toBe('查看航线日志');
    expect(zhCN.activationTrace).toBe('激活链路');
    expect(zhCN.activationTraceEmpty).toBe('暂无可展示的激活链路。');
  });

  it('emphasizes concept-card mode naming for orbit centers and activation sources', () => {
    expect(zhCN.orbitCenters).toBe('概念卡：轨道中心');
    expect(zhCN.activationSources).toBe('概念卡：激活源');
    expect(zhCN.currentOrbitCenter).toBe('当前概念卡：轨道中心');
    expect(zhCN.currentPrimaryActivationSource).toBe('当前主概念卡：激活源');
    expect(zhCN.traceBadgeCurrentOrbitCenter).toBe('当前概念卡：轨道中心');
    expect(zhCN.traceBadgePrimarySource).toBe('主概念卡：激活源');
  });

  it('keeps short engine labels and provides full mode labels', () => {
    expect(zhCN.engineOrbit).toBe('Orbit / 轨道');
    expect(zhCN.engineHyperspace).toBe('Hyperspace Expedition / 超空间远征');
    expect(zhCN.engineOrbitFull).toBe('Orbit / 轨道环绕模式');
    expect(zhCN.engineHyperspaceFull).toBe('Hyperspace Expedition / 超空间远征模式');
  });
});
