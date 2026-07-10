import { describe, expect, it } from 'vitest';

import { createBindOnceCallbackPort } from '../BindOnceCallbackPort';

describe('BindOnceCallbackPort', () => {
  it('fails explicitly when invoked before binding', () => {
    const port = createBindOnceCallbackPort<[number], number>('review-runtime');

    expect(() => port.invoke(3)).toThrow(
      'RUNTIME_ACCESS_UNAVAILABLE: review-runtime callback is not bound',
    );
  });

  it('binds once and rejects replacement', () => {
    const port = createBindOnceCallbackPort<[number], number>('review-runtime');

    port.bind((value) => value + 1);

    expect(port.invoke(3)).toBe(4);
    expect(() => port.bind((value) => value + 2)).toThrow(
      'RUNTIME_ACCESS_ALREADY_BOUND: review-runtime callback is already bound',
    );
  });

  it('becomes unavailable after disposal', () => {
    const port = createBindOnceCallbackPort<[], string>('integration-runtime');
    port.bind(() => 'ready');

    port.dispose();

    expect(port.isBound()).toBe(false);
    expect(() => port.invoke()).toThrow(
      'RUNTIME_ACCESS_DISPOSED: integration-runtime callback port is disposed',
    );
  });
});
