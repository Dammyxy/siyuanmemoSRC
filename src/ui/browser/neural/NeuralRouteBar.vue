<template>
  <div class="neural-route-bar">
    <div class="neural-route-bar__selector">
      <span class="neural-route-bar__label">{{ t('route', '航线') }}</span>
      <select
        class="b3-select neural-route-bar__select"
        :value="activeRoute?.id || ''"
        :disabled="busy || routes.length === 0"
        :aria-label="t('switchNeuralRoamRouteAriaLabel', '切换航线：{name}').replace('{name}', activeRoute?.name || '-')"
        @change="handleSelect"
      >
        <option
          v-for="route in routes"
          :key="route.id"
          :value="route.id"
        >
          {{ route.name }} · {{ formatRouteDetail(route) }}
        </option>
      </select>
    </div>

    <div class="neural-route-bar__actions">
      <button
        type="button"
        class="b3-button b3-button--outline neural-route-bar__button"
        :disabled="busy"
        :title="t('createRoute', '新建航线')"
        :aria-label="t('createRoute', '新建航线')"
        @click="$emit('create-route')"
      >
        <svg><use xlink:href="#iconAdd"></use></svg>
      </button>
      <button
        type="button"
        class="b3-button b3-button--outline neural-route-bar__button"
        :disabled="busy || !activeRoute"
        :title="t('renameRoute', '重命名航线')"
        :aria-label="t('renameRoute', '重命名航线')"
        @click="$emit('rename-route', activeRoute?.id || null)"
      >
        <svg><use xlink:href="#iconEdit"></use></svg>
      </button>
      <button
        v-if="activeRoute?.temporary"
        type="button"
        class="b3-button b3-button--outline neural-route-bar__button"
        :disabled="busy"
        :title="t('saveAsRoute', '保存为航线')"
        :aria-label="t('saveAsRoute', '保存为航线')"
        @click="$emit('save-temporary-route', activeRoute.id)"
      >
        <svg><use xlink:href="#iconSave"></use></svg>
      </button>
      <button
        type="button"
        class="b3-button b3-button--outline neural-route-bar__button"
        :disabled="busy || !canDeleteActiveRoute"
        :title="t('deleteRoute', '删除航线')"
        :aria-label="t('deleteRoute', '删除航线')"
        @click="$emit('delete-route', activeRoute?.id || null)"
      >
        <svg><use xlink:href="#iconTrashcan"></use></svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { NeuralRoamRouteListItem } from '@/core/queue/neural/routes';
import { DEFAULT_NEURAL_ROAM_ROUTE_ID } from '@/core/queue/neural/routes';

const props = defineProps<{
  i18n?: Record<string, string>;
  routes: NeuralRoamRouteListItem[];
  busy?: boolean;
}>();

const emit = defineEmits<{
  (e: 'switch-route', routeId: string): void;
  (e: 'create-route'): void;
  (e: 'rename-route', routeId: string | null): void;
  (e: 'delete-route', routeId: string | null): void;
  (e: 'save-temporary-route', routeId: string): void;
}>();

function t(key: string, fallback: string): string {
  return props.i18n?.[key] || fallback;
}

const activeRoute = computed(() =>
  props.routes.find((route) => route.isActive)
  ?? props.routes[0]
  ?? null
);

const canDeleteActiveRoute = computed(() =>
  Boolean(activeRoute.value && activeRoute.value.id !== DEFAULT_NEURAL_ROAM_ROUTE_ID)
);

function formatRouteDetail(route: NeuralRoamRouteListItem): string {
  return [
    `${t('routeConceptCount', '概念')} ${Math.max(0, Number(route.stats?.seedCount) || 0)}`,
    `${t('routeStationCount', '空间站')} ${Math.max(0, Number(route.stats?.anchorCount) || 0)}`,
    `${t('routeHistoryCount', '日志')} ${Math.max(0, Number(route.stats?.historyCount) || 0)}`,
  ].join(' · ');
}

function handleSelect(event: Event): void {
  const routeId = String((event.target as HTMLSelectElement | null)?.value || '').trim();
  if (!routeId || routeId === activeRoute.value?.id) {
    return;
  }
  emit('switch-route', routeId);
}
</script>
