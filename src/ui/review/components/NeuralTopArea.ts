import { defineComponent, h, inject } from 'vue';
import { NEURAL_TOP_AREA_CONTEXT_KEY } from './contexts';

export const NeuralTopArea = defineComponent({
  name: 'NeuralTopArea',
  setup() {
    const ctx = inject(NEURAL_TOP_AREA_CONTEXT_KEY);
    return () => {
      if (!ctx) return null;
      if (!ctx.isNeuralPractice.value) return null;
      if (ctx.isTopicMode.value) return null;

      const reason = ctx.neuralReasonLabel.value || '';
      const from = ctx.neuralFromShort.value || '';

      if (!reason && !from) return null;
      return h('div', { class: 'fsrs-neural-header' }, [
        reason ? h('span', { class: 'fsrs-neural-header__reason' }, reason) : null,
        from ? h('span', { class: 'fsrs-neural-header__from' }, from) : null,
      ]);
    };
  },
});

