import { describe, expect, it } from 'vitest';
import {
  collectBackendMigrationRuntimeEnv,
  resolveBackendMigrationRuntimePolicy,
} from '@/application/backendMigration/runtimePolicy';

describe('backend migration runtime policy', () => {
  it('uses release defaults when env omits every migration flag', () => {
    const env = collectBackendMigrationRuntimeEnv({}, {});
    const policy = resolveBackendMigrationRuntimePolicy(env);

    expect(policy.flags.backendWorker).toBe(true);
    expect(policy.flags.writerLeaseGuard).toBe(true);
    expect(policy.flags.autoCardDecisionRelay).toBe(true);
    expect(policy.flags.kernelTransactionIngest).toBe(true);
    expect(policy.flags.privateApi).toBe(true);
    expect(policy.flags.aiBackendRuntime).toBe(true);
    expect(policy.capabilities.reviewFeedbackWriteEnabled).toBe(true);
    expect(policy.capabilities.autoCardExecuteWriteEnabled).toBe(true);
    expect(policy.capabilities.autoCardDecisionBackendEnabled).toBe(true);
    expect(policy.capabilities.kernelTransactionIngestEnabled).toBe(true);
    expect(policy.capabilities.privateApiReadEnabled).toBe(true);
    expect(policy.capabilities.privateApiMutationEnabled).toBe(true);
    expect(policy.capabilities.aiBackendSessionEnabled).toBe(true);
  });

  it('resolves all-on defaults even when called with raw empty env', () => {
    const policy = resolveBackendMigrationRuntimePolicy({});

    expect(policy.flags.backendWorker).toBe(true);
    expect(policy.flags.writerLeaseGuard).toBe(true);
    expect(policy.flags.autoCardDecisionRelay).toBe(true);
    expect(policy.flags.kernelTransactionIngest).toBe(true);
    expect(policy.flags.privateApi).toBe(true);
    expect(policy.flags.aiBackendRuntime).toBe(true);
  });

  it('resolves all-on release defaults from .env.example values', () => {
    const policy = resolveBackendMigrationRuntimePolicy({
      VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER: 'true',
      VITE_SIYUANMEMO_ENABLE_KERNEL_WRITER_LEASE_GUARD: 'true',
      VITE_SIYUANMEMO_ENABLE_AUTOCARD_DECISION_RELAY: 'true',
      VITE_SIYUANMEMO_ENABLE_KERNEL_TRANSACTION_INGEST: 'true',
      VITE_SIYUANMEMO_ENABLE_PRIVATE_API: 'true',
      VITE_SIYUANMEMO_ENABLE_AI_BACKEND_RUNTIME: 'true',
    });
    expect(policy.flags.backendWorker).toBe(true);
    expect(policy.flags.writerLeaseGuard).toBe(true);
    expect(policy.capabilities.reviewFeedbackWriteEnabled).toBe(true);
    expect(policy.capabilities.autoCardExecuteWriteEnabled).toBe(true);
    expect(policy.capabilities.autoCardDecisionBackendEnabled).toBe(true);
    expect(policy.capabilities.kernelTransactionIngestEnabled).toBe(true);
    expect(policy.capabilities.privateApiReadEnabled).toBe(true);
    expect(policy.capabilities.privateApiMutationEnabled).toBe(true);
    expect(policy.capabilities.aiBackendSessionEnabled).toBe(true);
  });

  it('collects all-on release defaults when env omits migration flags', () => {
    const env = collectBackendMigrationRuntimeEnv({
      VITE_SIYUAN_WORKSPACE_PATH: 'H:/SiYuanXY',
    }, {});
    const policy = resolveBackendMigrationRuntimePolicy(env);

    expect(policy.flags.backendWorker).toBe(true);
    expect(policy.flags.writerLeaseGuard).toBe(true);
    expect(policy.flags.autoCardDecisionRelay).toBe(true);
    expect(policy.flags.kernelTransactionIngest).toBe(true);
    expect(policy.flags.privateApi).toBe(true);
    expect(policy.flags.aiBackendRuntime).toBe(true);
    expect(policy.capabilities.reviewFeedbackWriteEnabled).toBe(true);
  });

  it('fails closed for backend-only mode', () => {
    const policy = resolveBackendMigrationRuntimePolicy({
      VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER: 'true',
      VITE_SIYUANMEMO_ENABLE_KERNEL_WRITER_LEASE_GUARD: 'false',
      VITE_SIYUANMEMO_ENABLE_AUTOCARD_DECISION_RELAY: 'true',
      VITE_SIYUANMEMO_ENABLE_KERNEL_TRANSACTION_INGEST: 'true',
    });
    expect(policy.flags.backendWorker).toBe(true);
    expect(policy.flags.writerLeaseGuard).toBe(false);
    expect(policy.capabilities.reviewFeedbackWriteEnabled).toBe(false);
    expect(policy.capabilities.autoCardExecuteWriteEnabled).toBe(false);
    expect(policy.capabilities.autoCardDecisionBackendEnabled).toBe(false);
    expect(policy.capabilities.kernelTransactionIngestEnabled).toBe(false);
  });

  it('keeps explicit flag-off env values above release defaults', () => {
    const env = collectBackendMigrationRuntimeEnv({
      VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER: 'false',
      VITE_SIYUANMEMO_ENABLE_KERNEL_WRITER_LEASE_GUARD: 'false',
      VITE_SIYUANMEMO_ENABLE_AUTOCARD_DECISION_RELAY: 'false',
    }, {});
    const policy = resolveBackendMigrationRuntimePolicy(env);

    expect(policy.flags.backendWorker).toBe(false);
    expect(policy.flags.writerLeaseGuard).toBe(false);
    expect(policy.flags.autoCardDecisionRelay).toBe(false);
    expect(policy.capabilities.reviewFeedbackWriteEnabled).toBe(false);
  });

  it('fails closed for writer-only mode', () => {
    const policy = resolveBackendMigrationRuntimePolicy({
      VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER: 'false',
      VITE_SIYUANMEMO_ENABLE_KERNEL_WRITER_LEASE_GUARD: 'true',
      VITE_SIYUANMEMO_ENABLE_AUTOCARD_DECISION_RELAY: 'true',
      VITE_SIYUANMEMO_ENABLE_KERNEL_TRANSACTION_INGEST: 'true',
    });
    expect(policy.flags.backendWorker).toBe(false);
    expect(policy.flags.writerLeaseGuard).toBe(true);
    expect(policy.capabilities.writerRelayRuntimeEnabled).toBe(false);
    expect(policy.capabilities.reviewFeedbackWriteEnabled).toBe(false);
    expect(policy.capabilities.autoCardExecuteWriteEnabled).toBe(false);
    expect(policy.capabilities.kernelTransactionIngestEnabled).toBe(false);
  });

  it('enables backend write capabilities only in backend+writer mode', () => {
    const policy = resolveBackendMigrationRuntimePolicy({
      VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER: 'true',
      VITE_SIYUANMEMO_ENABLE_KERNEL_WRITER_LEASE_GUARD: 'true',
      VITE_SIYUANMEMO_ENABLE_AUTOCARD_DECISION_RELAY: 'true',
      VITE_SIYUANMEMO_ENABLE_KERNEL_TRANSACTION_INGEST: 'true',
      VITE_SIYUANMEMO_ENABLE_PRIVATE_API: 'true',
    });
    expect(policy.capabilities.writerRelayRuntimeEnabled).toBe(true);
    expect(policy.capabilities.reviewFeedbackWriteEnabled).toBe(true);
    expect(policy.capabilities.autoCardExecuteWriteEnabled).toBe(true);
    expect(policy.capabilities.autoCardDecisionBackendEnabled).toBe(true);
    expect(policy.capabilities.kernelTransactionIngestEnabled).toBe(true);
    expect(policy.capabilities.privateApiMutationEnabled).toBe(true);
  });

  it('uses local backend-worker ownership on mobile surfaces without kernel writer relay', () => {
    const policy = resolveBackendMigrationRuntimePolicy({
      VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER: 'true',
      VITE_SIYUANMEMO_ENABLE_KERNEL_WRITER_LEASE_GUARD: 'true',
      VITE_SIYUANMEMO_ENABLE_AUTOCARD_DECISION_RELAY: 'true',
      VITE_SIYUANMEMO_ENABLE_KERNEL_TRANSACTION_INGEST: 'true',
      VITE_SIYUANMEMO_ENABLE_PRIVATE_API: 'true',
    }, {
      backendContainer: 'android',
      frontendKind: 'mobile',
      isMobile: true,
    });

    expect(policy.capabilities.backendWorkerAvailable).toBe(true);
    expect(policy.capabilities.writerRelayRuntimeEnabled).toBe(false);
    expect(policy.capabilities.writerRelayRequiredForBackendWrites).toBe(false);
    expect(policy.capabilities.reviewFeedbackWriteEnabled).toBe(true);
    expect(policy.capabilities.autoCardExecuteWriteEnabled).toBe(true);
    expect(policy.capabilities.autoCardDecisionBackendEnabled).toBe(true);
    expect(policy.capabilities.kernelTransactionIngestEnabled).toBe(false);
    expect(policy.capabilities.privateApiMutationEnabled).toBe(false);
    expect(policy.behavior.reviewWrites.owner).toBe('backend-worker');
    expect(policy.behavior.autoCardWrites.owner).toBe('backend-worker');
  });

  it('treats Android WebView app surfaces as mobile even when SiYuan reports desktop/std', () => {
    const policy = resolveBackendMigrationRuntimePolicy({
      VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER: 'true',
      VITE_SIYUANMEMO_ENABLE_KERNEL_WRITER_LEASE_GUARD: 'true',
      VITE_SIYUANMEMO_ENABLE_AUTOCARD_DECISION_RELAY: 'true',
      VITE_SIYUANMEMO_ENABLE_KERNEL_TRANSACTION_INGEST: 'true',
      VITE_SIYUANMEMO_ENABLE_PRIVATE_API: 'true',
    }, {
      backendContainer: 'std',
      frontendKind: 'desktop',
      isMobile: false,
      locationHref: 'http://127.0.0.1:56588/stage/build/app/?v=3.6.9',
      userAgent: 'Mozilla/5.0 (Linux; Android 10; ALP-AL00) AppleWebKit/537.36 Mobile Safari/537.36',
    });

    expect(policy.capabilities.writerRelayRuntimeEnabled).toBe(false);
    expect(policy.capabilities.writerRelayRequiredForBackendWrites).toBe(false);
    expect(policy.capabilities.reviewFeedbackWriteEnabled).toBe(true);
    expect(policy.behavior.reviewWrites.owner).toBe('backend-worker');
  });

  it('keeps private API and AI backend disabled when explicitly turned off', () => {
    const policy = resolveBackendMigrationRuntimePolicy({
      VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER: 'true',
      VITE_SIYUANMEMO_ENABLE_KERNEL_WRITER_LEASE_GUARD: 'true',
      VITE_SIYUANMEMO_ENABLE_PRIVATE_API: 'false',
      VITE_SIYUANMEMO_ENABLE_AI_BACKEND_RUNTIME: 'false',
    });
    expect(policy.capabilities.privateApiReadEnabled).toBe(false);
    expect(policy.capabilities.privateApiMutationEnabled).toBe(false);
    expect(policy.capabilities.aiBackendSessionEnabled).toBe(false);
  });

  it('collects Vite env values before process fallback values', () => {
    const env = collectBackendMigrationRuntimeEnv({
      VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER: 'true',
      VITE_SIYUANMEMO_ENABLE_KERNEL_WRITER_LEASE_GUARD: 'true',
      VITE_SIYUANMEMO_ENABLE_AUTOCARD_DECISION_RELAY: 'true',
      VITE_SIYUANMEMO_ENABLE_PRIVATE_API: 'false',
    }, {
      VITE_SIYUANMEMO_ENABLE_SRS_BACKEND_WORKER: 'false',
      VITE_SIYUANMEMO_ENABLE_KERNEL_WRITER_LEASE_GUARD: 'false',
      VITE_SIYUANMEMO_ENABLE_AUTOCARD_DECISION_RELAY: 'false',
      VITE_SIYUANMEMO_ENABLE_PRIVATE_API: 'true',
      VITE_SIYUANMEMO_ENABLE_AI_BACKEND_RUNTIME: 'true',
    });
    const policy = resolveBackendMigrationRuntimePolicy(env);

    expect(policy.capabilities.reviewFeedbackWriteEnabled).toBe(true);
    expect(policy.capabilities.autoCardDecisionBackendEnabled).toBe(true);
    expect(policy.capabilities.privateApiReadEnabled).toBe(false);
    expect(policy.capabilities.aiBackendSessionEnabled).toBe(true);
  });
});
