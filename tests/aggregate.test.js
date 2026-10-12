import {test, equal, done} from './harness.js';
import {createAggregator, dayKey} from '../extension/lib/aggregate.js';

// Noon timestamps keep the local-day bucketing independent of the time zone.
const NOW = new Date(2026, 9, 12, 12, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

function line(overrides = {}, usage = {}) {
    return JSON.stringify({
        type: 'assistant',
        timestamp: new Date(NOW).toISOString(),
        requestId: 'req_1',
        message: {
            id: 'msg_1',
            model: 'claude-opus-5-5',
            usage: {input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 100,
                cache_creation_input_tokens: 50, ...usage},
        },
        ...overrides,
    });
}

test('returns one bucket per day, oldest first, ending today', () => {
    const result = createAggregator({now: NOW, days: 7}).result();
    equal(result.length, 7);
    equal(result[6].date, dayKey(NOW));
    equal(result[0].date, dayKey(NOW - 6 * DAY));
    equal(result[6].models, {});
});

test('sums usage per day and model', () => {
    const agg = createAggregator({now: NOW, days: 7});
    agg.addLine(line());
    agg.addLine(line({requestId: 'req_2', timestamp: new Date(NOW - DAY).toISOString()}));
    const result = agg.result();
    equal(result[6].models['claude-opus-5-5'],
        {input: 10, output: 20, cacheRead: 100, cacheWrite5m: 50, cacheWrite1h: 0});
    equal(result[5].models['claude-opus-5-5'].output, 20);
});

test('splits cache writes by lifetime when the log says so', () => {
    const agg = createAggregator({now: NOW, days: 7});
    agg.addLine(line({}, {cache_creation: {ephemeral_5m_input_tokens: 20, ephemeral_1h_input_tokens: 30}}));
    const model = agg.result()[6].models['claude-opus-5-5'];
    equal([model.cacheWrite5m, model.cacheWrite1h], [20, 30]);
});

test('counts a message once and keeps its most complete usage', () => {
    const agg = createAggregator({now: NOW, days: 7});
    agg.addLine(line({}, {output_tokens: 5}));
    agg.addLine(line({}, {output_tokens: 20}));
    agg.addLine(line({}, {output_tokens: 20}));
    equal(agg.result()[6].models['claude-opus-5-5'].output, 20);
});

test('ignores other lines, synthetic messages and days outside the window', () => {
    const agg = createAggregator({now: NOW, days: 7});
    agg.addLine('not json');
    agg.addLine(JSON.stringify({type: 'user', message: {}}));
    agg.addLine(line({requestId: 'req_3', message: {id: 'm3', model: '<synthetic>', usage: {input_tokens: 9}}}));
    agg.addLine(line({requestId: 'req_4', timestamp: new Date(NOW - 8 * DAY).toISOString()}));
    equal(agg.result().every(day => Object.keys(day.models).length === 0), true);
});

done('aggregate');
