import {test, equal, done} from './harness.js';
import {percent, duration, tokens, cost, ago, tone} from '../extension/lib/format.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

test('percent rounds and puts a space before the unit', () => {
    equal(percent(63.6), '64 %');
    equal(percent(0), '0 %');
    equal(percent(null), '–');
});

test('duration uses the two largest units', () => {
    equal(duration(2 * HOUR + 10 * MIN), '2 h 10 min');
    equal(duration(45 * MIN), '45 min');
    equal(duration(3 * HOUR), '3 h');
    equal(duration(52 * HOUR), '2 d 4 h');
    equal(duration(20 * 1000), '1 min');
    equal(duration(-5), '0 min');
});

test('tokens shortens large counts', () => {
    equal(tokens(950), '950');
    equal(tokens(12400), '12.4 k');
    equal(tokens(12_400_000), '12.4 M');
    equal(tokens(1_250_000_000), '1.3 B');
    equal(tokens(999_950), '1.0 M');
});

test('cost shows two decimals, or a dash when unknown', () => {
    equal(cost(4.2), '$4.20');
    equal(cost(0), '$0.00');
    equal(cost(null), '–');
});

test('ago describes the age of a value', () => {
    equal(ago(10 * 1000), 'just now');
    equal(ago(3 * MIN), '3 min ago');
    equal(ago(2 * HOUR + 5 * MIN), '2 h ago');
});

test('tone follows the warning thresholds', () => {
    equal(tone(30), 'primary');
    equal(tone(75), 'warn');
    equal(tone(89.9), 'warn');
    equal(tone(90), 'bad');
    equal(tone(null), 'primary');
});

done('format');
