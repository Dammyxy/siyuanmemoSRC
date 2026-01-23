import { defineComponent, h, inject } from 'vue';
import { DRILL_BREADCRUMB_UI_CONTEXT_KEY } from './contexts';

export const DrillBreadcrumbTopArea = defineComponent({
  name: 'DrillBreadcrumbTopArea',
  setup() {
    const ctx = inject(DRILL_BREADCRUMB_UI_CONTEXT_KEY);
    return () => {
      if (!ctx) return null;
      if (ctx.totalCards.value <= 0) return null;

      const locked = Boolean(ctx.isBreadcrumbLocked.value);
      const statusText = locked
        ? ctx.t('breadcrumbLocked', '已锁定')
        : ctx.t('breadcrumbUnlocked', '未锁定');
      const statusIcon = locked ? '#iconLock' : '#iconUnlock';

      const items = (ctx.breadcrumbs.value || []).map((item: any, idx: number) => {
        const id = String(item?.id || '');
        const name = String(item?.name || item?.content || '...');
        const isPlaceholder = !id;
        const className = [
          'fsrs-breadcrumb-item',
          isPlaceholder ? 'fsrs-breadcrumb-item--placeholder' : '',
        ].filter(Boolean).join(' ');
        return h(
          'div',
          {
            key: `${id || 'placeholder'}-${idx}`,
            class: className,
            style: { paddingLeft: `${idx * 16 + 8}px` },
            onClick: isPlaceholder ? undefined : () => ctx.handleBreadcrumbClick(id),
          },
          [
            h('span', { class: 'fsrs-breadcrumb-text' }, name),
          ],
        );
      });

      return h('div', { class: 'fsrs-drill-breadcrumb' }, [
        h('div', { class: 'fsrs-breadcrumb-header' }, [
          h('div', { class: 'fsrs-breadcrumb-header__left' }, [
            h('span', { class: 'fsrs-breadcrumb-header__title' }, ctx.t('breadcrumbPath', '路径')),
            h(
              'span',
              {
                class: [
                  'fsrs-breadcrumb-header__status',
                  locked ? 'fsrs-breadcrumb-header__status--locked' : '',
                ].filter(Boolean).join(' '),
                onClick: () => ctx.toggleBreadcrumbLock(),
              },
              [
                h('svg', { class: 'fsrs-breadcrumb-header__status-icon' }, [
                  h('use', { 'xlink:href': statusIcon }),
                ]),
                h('span', null, statusText),
              ],
            ),
          ]),
          h('div', { class: 'fsrs-breadcrumb-header__actions' }, [
            ctx.isBreadcrumbContext.value
              ? h(
                'button',
                {
                  class: 'b3-button b3-button--outline',
                  onClick: () => ctx.exitBreadcrumbContext(),
                },
                ctx.t('backToPractice', '返回练习'),
              )
              : null,
          ]),
        ]),
        h(
          'div',
          { class: 'fsrs-breadcrumb-list', ref: ctx.breadcrumbListRef },
          [
            h('div', { ref: ctx.breadcrumbContentRef }, items),
            ctx.breadcrumbTransition.active
              ? h(
                'div',
                {
                  class: [
                    'fsrs-breadcrumb-transition',
                    ctx.breadcrumbTransition.fading ? 'is-fading' : '',
                  ].filter(Boolean).join(' '),
                },
                [
                  h(
                    'div',
                    {
                      class: 'fsrs-breadcrumb-transition__content',
                      style: { transform: `translate3d(0, ${-ctx.breadcrumbTransition.scrollTop}px, 0)` },
                      innerHTML: ctx.breadcrumbTransition.html,
                    } as any,
                  ),
                ],
              )
              : null,
          ],
        ),
      ]);
    };
  },
});

