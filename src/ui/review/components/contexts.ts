import type { ComputedRef, InjectionKey, Ref } from 'vue';

export interface DrillBreadcrumbUIContext {
  t: (key: string, fallback: string) => string;
  totalCards: ComputedRef<number>;
  drillTotal: ComputedRef<number>;
  breadcrumbs: Ref<any[]>;
  breadcrumbContextId: Ref<string>;
  breadcrumbTransition: {
    active: boolean;
    fading: boolean;
    html: string;
    scrollTop: number;
    token: number;
  };
  breadcrumbListRef: Ref<HTMLElement | null>;
  breadcrumbContentRef: Ref<HTMLElement | null>;
  isBreadcrumbLocked: Ref<boolean>;
  toggleBreadcrumbLock: () => void;
  isBreadcrumbContext: ComputedRef<boolean>;
  exitBreadcrumbContext: () => void;
  handleBreadcrumbClick: (id: string) => void;
}

export const DRILL_BREADCRUMB_UI_CONTEXT_KEY: InjectionKey<DrillBreadcrumbUIContext> =
  Symbol('fsrs:drill-breadcrumb-ui');

export interface NeuralTopAreaContext {
  t: (key: string, fallback: string) => string;
  isTopicMode: ComputedRef<boolean>;
  isNeuralPractice: ComputedRef<boolean>;
  neuralContext: ComputedRef<any>;
  neuralReasonLabel: ComputedRef<string>;
  neuralFromShort: ComputedRef<string>;
  currentLocale: ComputedRef<any>;
}

export const NEURAL_TOP_AREA_CONTEXT_KEY: InjectionKey<NeuralTopAreaContext> =
  Symbol('fsrs:neural-top-area');

