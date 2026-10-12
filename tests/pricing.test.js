import {test, equal, done} from './harness.js';
import {costOf, dayCost, totalTokens} from '../extension/lib/pricing.js';

const M = 1_000_000;
const none = {input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0};

test('prices input and output at the list rate', () => {
    equal(costOf('claude-opus-5-5', {...none, input: M, output: M}), 24);
    equal(costOf('claude-sonnet-5-5', {...none, input: M, output: M}), 12);
});

test('cache writes cost 1.25x and 2x of input', () => {
    equal(costOf('claude-opus-5-5', {...none, cacheWrite5m: M}), 5);
    equal(costOf('claude-opus-5-5', {...none, cacheWrite1h: M}), 8);
});

test('cache reads use the rate of the model', () => {
    equal(costOf('claude-opus-5-5', {...none, cacheRead: M}), 0.2);
    equal(costOf('claude-fable-5-1', {...none, cacheRead: M}), 0.25);
    equal(costOf('claude-sonnet-5-5', {...none, cacheRead: M}), 0.2);
});

test('a dated model id matches its family, the longest name first', () => {
    equal(costOf('claude-haiku-4-5-20251001', {...none, input: M}), 1);
    equal(costOf('claude-opus-5-5', {...none, input: M}), 4);
    equal(costOf('claude-opus-5', {...none, input: M}), 5);
});

test('an unknown model has no price', () => {
    equal(costOf('some-new-model', {...none, input: M}), null);
});

test('a day is unpriced as soon as one of its models is', () => {
    equal(dayCost({'claude-opus-5-5': {...none, input: M}}), 4);
    equal(dayCost({'claude-opus-5-5': {...none, input: M}, 'x': {...none, input: M}}), null);
    equal(dayCost({}), 0);
});

test('total tokens include the cache', () => {
    equal(totalTokens({a: {input: 1, output: 2, cacheRead: 3, cacheWrite5m: 4, cacheWrite1h: 5}}), 15);
});

done('pricing');
