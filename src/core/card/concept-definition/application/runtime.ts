/**
 * Concept definition runtime helpers
 *
 * Centralizes global runtime access (window.siyuan / window.Lute)
 * to keep render service and UI component on the same typed path.
 */

export interface ConceptFace {
  questionBlockId?: string;
  answerBlockId?: string;
}

export interface XiuyuanEntityPort {
  getFaces(): ConceptFace[];
}

export interface XiuyuanQueryResult {
  xiuyuan?: XiuyuanEntityPort | null;
}

export interface XiuyuanApplicationServicePort {
  getXiuyuan(query: { xiuyuanId: string }): Promise<XiuyuanQueryResult>;
}

interface PluginContextPort {
  getXiuyuanApplicationService?: () =>
    | XiuyuanApplicationServicePort
    | Promise<XiuyuanApplicationServicePort | undefined>
    | undefined;
}

export interface SiyuanMemoPluginPort {
  name: string;
  getContext?: () => PluginContextPort | Promise<PluginContextPort | undefined> | undefined;
}

export interface LuteRenderer {
  Md2BlockDOM(kramdown: string): string;
}

interface RuntimeWindowPort {
  siyuan?: {
    ws?: {
      app?: unknown;
    };
  };
  Lute?: {
    New?: () => LuteRenderer | undefined;
  };
}

function getRuntimeWindow(): RuntimeWindowPort {
  return window as unknown as RuntimeWindowPort;
}

export function resolveSiyuanApp<TApp = unknown>(): TApp | undefined {
  return getRuntimeWindow().siyuan?.ws?.app as TApp | undefined;
}

export function resolveSiyuanMemoPlugin(): SiyuanMemoPluginPort | undefined {
  const app = resolveSiyuanApp<{ plugins?: SiyuanMemoPluginPort[] }>();
  const plugins = app?.plugins;
  return Array.isArray(plugins)
    ? plugins.find(plugin => plugin.name === 'siyuan-plugin-siyuanmemo')
    : undefined;
}

export function resolveLuteRenderer(): LuteRenderer | undefined {
  return getRuntimeWindow().Lute?.New?.();
}
