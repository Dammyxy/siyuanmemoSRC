const startedAt = Date.now();

function buildHealth() {
  return {
    ok: true,
    plugin: siyuan.plugin.name,
    version: siyuan.plugin.version,
    platform: siyuan.plugin.platform,
    uptimeMs: Date.now() - startedAt,
  };
}

function buildCapabilities() {
  return {
    version: 1,
    methods: ['health', 'version', 'capabilities'],
    storage: 'siyuan.storage',
    rpc: 'json-rpc-2.0',
    writesSiyuanMemoDb: false,
  };
}

siyuan.plugin.lifecycle.onload = async () => {
  await siyuan.logger.info('[SiYuanMemo kernel] loading');

  await siyuan.rpc.bind('health', async () => buildHealth(), 'Return SiYuanMemo kernel companion health.');
  await siyuan.rpc.bind('version', async () => ({
    plugin: siyuan.plugin.name,
    version: siyuan.plugin.version,
    platform: siyuan.plugin.platform,
  }), 'Return SiYuanMemo kernel companion version.');
  await siyuan.rpc.bind('capabilities', async () => buildCapabilities(), 'Return SiYuanMemo kernel companion capabilities.');
};

siyuan.plugin.lifecycle.onrunning = async () => {
  await siyuan.logger.info('[SiYuanMemo kernel] running');
};

siyuan.plugin.lifecycle.onunload = async () => {
  await siyuan.logger.info('[SiYuanMemo kernel] unloading');
};
