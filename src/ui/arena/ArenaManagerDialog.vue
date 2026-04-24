<template>
  <div class="arena-manager">
    <header class="arena-manager__header">
      <div>
        <strong>{{ t('arenaManagerTitle', 'Arena Manager') }}</strong>
        <p>{{ t('arenaManagerDesc', '统一查看 AI 策略竞技与 SRS 算法竞技，并进行 pin / retire / clone / challenge 管理。') }}</p>
      </div>
      <div class="arena-manager__actions">
        <button class="b3-button b3-button--outline" type="button" :disabled="loading" @click="refresh">
          {{ t('refresh', '刷新') }}
        </button>
      </div>
    </header>

    <div class="arena-manager__domain-switch">
      <button
        class="arena-manager__domain-pill"
        :class="{ 'arena-manager__domain-pill--active': activeDomain === 'ai' }"
        type="button"
        @click="switchDomain('ai')"
      >
        AI Arena
      </button>
      <button
        class="arena-manager__domain-pill"
        :class="{ 'arena-manager__domain-pill--active': activeDomain === 'srs' }"
        type="button"
        @click="switchDomain('srs')"
      >
        SRS Arena
      </button>
    </div>

    <section v-if="activeDomain === 'ai'" class="arena-manager__section">
      <div class="arena-manager__grid">
        <article v-for="pool in model?.ai.pools || []" :key="pool.pool.key" class="arena-manager__card">
          <div class="arena-manager__card-head">
            <div>
              <strong>{{ readableAiPool(pool.pool.key) }}</strong>
              <p>{{ pool.pool.scenarioId }} · {{ pool.pool.targetKind }}</p>
            </div>
            <button class="b3-button b3-button--outline" type="button" :disabled="loading" @click="challenge(pool.pool.key)">
              {{ t('arenaChallenge', '发起挑战') }}
            </button>
          </div>
          <p v-if="pool.challenge?.summary" class="arena-manager__hint">{{ pool.challenge.summary }}</p>
          <ul class="arena-manager__score-list">
            <li v-for="entry in pool.topEntries" :key="entry.contestantId">
              <strong>{{ entry.title }}</strong>
              <span>{{ entry.score.toFixed(2) }} / {{ t('samples', '样本') }} {{ entry.sampleCount }}</span>
            </li>
          </ul>
        </article>
      </div>

      <section class="arena-manager__section">
        <div class="arena-manager__section-head">
          <strong>{{ t('arenaStrategyPacks', '策略包') }}</strong>
          <span>{{ (model?.ai.strategyPacks || []).length }} {{ t('countUnit', '个') }}</span>
        </div>
        <div class="arena-manager__grid">
          <article v-for="pack in model?.ai.strategyPacks || []" :key="pack.id" class="arena-manager__card">
            <div class="arena-manager__card-head">
              <div>
                <strong>{{ pack.title }}</strong>
                <p>{{ pack.id }} · {{ pack.source }} · {{ pack.state }}</p>
              </div>
            </div>
            <p class="arena-manager__meta">{{ pack.eligibleScenarios.join('、') || '-' }}</p>
            <div class="arena-manager__inline-actions">
              <button class="b3-button b3-button--outline" type="button" :disabled="loading || pack.state === 'pinned'" @click="pin(pack.id)">
                {{ t('pin', 'Pin') }}
              </button>
              <button
                v-if="pack.state === 'retired' || pack.state === 'disabled'"
                class="b3-button b3-button--outline"
                type="button"
                :disabled="loading"
                @click="reactivate(pack.id)"
              >
                {{ t('reactivate', '恢复') }}
              </button>
              <button
                v-else
                class="b3-button b3-button--outline"
                type="button"
                :disabled="loading"
                @click="retire(pack.id)"
              >
                {{ t('retire', 'Retire') }}
              </button>
              <button class="b3-button b3-button--outline" type="button" :disabled="loading" @click="clonePack(pack.id)">
                {{ t('clone', '克隆') }}
              </button>
            </div>
          </article>
        </div>
      </section>

      <section class="arena-manager__section">
        <div class="arena-manager__section-head">
          <strong>{{ t('recentTimeline', '近期时间线') }}</strong>
        </div>
        <ul class="arena-manager__timeline">
          <li v-for="match in model?.ai.recentMatches || []" :key="match.id">
            <strong>{{ match.ai?.eventType || 'event' }}</strong>
            <span>{{ match.ai?.packId || '-' }}</span>
            <span>{{ formatTime(match.createdAt) }}</span>
          </li>
        </ul>
      </section>
    </section>

    <section v-else class="arena-manager__section">
      <div class="arena-manager__grid">
        <article v-for="pool in model?.srs.pools || []" :key="pool.pool.key" class="arena-manager__card">
          <div class="arena-manager__card-head">
            <div>
              <strong>{{ readableSrsPool(pool.pool.key) }}</strong>
              <p>{{ pool.pool.targetKind }}</p>
            </div>
          </div>
          <ul class="arena-manager__score-list">
            <li v-for="entry in pool.topEntries" :key="entry.contestantId">
              <strong>{{ entry.title }}</strong>
              <span>{{ entry.score.toFixed(2) }} / {{ t('samples', '样本') }} {{ entry.sampleCount }}</span>
            </li>
          </ul>
        </article>
      </div>

      <section class="arena-manager__section">
        <div class="arena-manager__section-head">
          <strong>{{ t('recentTimeline', '近期时间线') }}</strong>
        </div>
        <ul class="arena-manager__timeline">
          <li v-for="match in model?.srs.recentMatches || []" :key="match.id">
            <strong>{{ match.srs?.cardId || '-' }}</strong>
            <span>{{ match.srs?.leadingContestantId || '-' }}</span>
            <span>{{ formatTime(match.createdAt) }}</span>
          </li>
        </ul>
      </section>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ArenaKernelService } from '@/application/services/ArenaKernelService';
import type { ArenaManagerDomain, ArenaManagerViewModel } from '@/types/arena';

const props = defineProps<{
  service: Pick<
    ArenaKernelService,
    | 'buildManagerView'
    | 'updateManagerState'
    | 'pinStrategyPack'
    | 'retireStrategyPack'
    | 'reactivateStrategyPack'
    | 'cloneStrategyPack'
    | 'generateChallengePack'
  >;
  i18n?: Record<string, string>;
}>();

const loading = ref(false);
const model = ref<ArenaManagerViewModel | null>(null);
const activeDomain = computed(() => model.value?.manager.activeDomain || 'ai');
const t = (key: string, fallback: string) => props.i18n?.[key] || fallback;

function formatTime(value: number): string {
  return new Date(value).toLocaleString();
}

function readableAiPool(poolKey: string): string {
  return poolKey.replace(/^ai::/, '').replace(/::/g, ' / ');
}

function readableSrsPool(poolKey: string): string {
  return poolKey.replace(/^srs::/, 'SRS / ');
}

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    model.value = await props.service.buildManagerView();
  } finally {
    loading.value = false;
  }
}

async function switchDomain(domain: ArenaManagerDomain): Promise<void> {
  await props.service.updateManagerState({ activeDomain: domain });
  await refresh();
}

async function pin(packId: string): Promise<void> {
  await props.service.pinStrategyPack(packId);
  await refresh();
}

async function retire(packId: string): Promise<void> {
  await props.service.retireStrategyPack(packId);
  await refresh();
}

async function reactivate(packId: string): Promise<void> {
  await props.service.reactivateStrategyPack(packId);
  await refresh();
}

async function clonePack(packId: string): Promise<void> {
  const title = window.prompt(t('arenaCloneTitlePrompt', '给新策略包起个名字'), '') || '';
  const promptSuffix = window.prompt(t('arenaClonePromptSuffix', '可选：给克隆包追加一段提示偏好'), '') || '';
  await props.service.cloneStrategyPack(packId, {
    title: title.trim() || undefined,
    promptSuffix: promptSuffix.trim() || undefined,
  });
  await refresh();
}

async function challenge(poolKey: string): Promise<void> {
  await props.service.generateChallengePack(poolKey);
  await refresh();
}

onMounted(() => {
  void refresh();
});
</script>

<style scoped>
.arena-manager{display:grid;gap:14px;height:100%;min-height:0;padding:14px;overflow:auto;background:linear-gradient(180deg,color-mix(in srgb,var(--b3-theme-background) 92%,var(--b3-theme-surface) 8%),var(--b3-theme-background))}
.arena-manager__header,.arena-manager__card,.arena-manager__domain-switch,.arena-manager__section{border:1px solid var(--b3-border-color);border-radius:12px;background:var(--b3-theme-surface)}
.arena-manager__header,.arena-manager__section{padding:14px}
.arena-manager__header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.arena-manager__header p,.arena-manager__card p,.arena-manager__meta,.arena-manager__hint{margin:4px 0 0;color:var(--b3-theme-on-surface-light);font-size:12px;line-height:1.5}
.arena-manager__domain-switch{display:flex;gap:8px;padding:8px}
.arena-manager__domain-pill{border:1px solid var(--b3-border-color);border-radius:999px;background:transparent;padding:7px 12px;font-weight:600;color:var(--b3-theme-on-surface)}
.arena-manager__domain-pill--active{border-color:var(--b3-theme-primary);background:var(--b3-theme-primary-lightest);color:var(--b3-theme-primary)}
.arena-manager__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}
.arena-manager__card{display:grid;gap:10px;padding:12px}
.arena-manager__card-head,.arena-manager__inline-actions,.arena-manager__section-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}
.arena-manager__score-list,.arena-manager__timeline{margin:0;padding-left:18px;display:grid;gap:8px}
.arena-manager__score-list li,.arena-manager__timeline li{display:grid;gap:2px;color:var(--b3-theme-on-surface)}
.arena-manager__inline-actions{justify-content:flex-start}
@media (max-width:720px){.arena-manager__header{flex-direction:column}}
</style>
