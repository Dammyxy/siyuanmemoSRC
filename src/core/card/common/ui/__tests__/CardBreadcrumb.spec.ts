import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import CardBreadcrumb from '../CardBreadcrumb.vue';

const items = [
  { id: 'doc-1', name: 'Doc', type: 'NodeDocument' },
  { id: 'heading-1', name: 'Heading', type: 'NodeHeading' },
];

describe('CardBreadcrumb', () => {
  it('renders preview variant with active state and emits select when interactive', async () => {
    const wrapper = mount(CardBreadcrumb, {
      props: {
        items,
        variant: 'preview',
        interactive: true,
        activeId: 'heading-1',
      },
    });

    const renderedItems = wrapper.findAll('.card-breadcrumb__item');
    expect(wrapper.classes()).toContain('card-breadcrumb--preview');
    expect(renderedItems).toHaveLength(2);
    expect(renderedItems[1]?.classes()).toContain('card-breadcrumb__item--active');

    await renderedItems[0]!.trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual([items[0], 0]);
  });

  it('does not emit select when not interactive', async () => {
    const wrapper = mount(CardBreadcrumb, {
      props: {
        items,
      },
    });

    await wrapper.findAll('.card-breadcrumb__item')[0]!.trigger('click');
    expect(wrapper.emitted('select')).toBeUndefined();
  });
});
