import {test, equal, done} from './harness.js';
import {PROBE_CHOICES, parseProbe, parseSettings, parseStatusline, rollOver} from '../extension/lib/parse.js';

const RESET_S = 1791818400;
const RESET_MS = RESET_S * 1000;

function event(info) {
    return JSON.stringify({type: 'rate_limit_event', rate_limit_info: info});
}

test('a probe yields both windows from the rate limit event', () => {
    const output = [
        JSON.stringify({type: 'system', subtype: 'init'}),
        event({status: 'allowed', unifiedWindows: {
            five_hour: {utilization: 0.46, resetsAt: RESET_S},
            seven_day: {utilization: 0.76, resetsAt: RESET_S},
        }}),
        JSON.stringify({type: 'result', subtype: 'success'}),
    ].join('\n');
    equal(parseProbe(output), {
        session: {percent: 46, resetsAt: RESET_MS},
        week: {percent: 76, resetsAt: RESET_MS},
    });
});

test('a probe without the windows falls back to the one limit it names', () => {
    const output = event({rateLimitType: 'seven_day', utilization: 0.5, resetsAt: RESET_S});
    equal(parseProbe(output), {session: null, week: {percent: 50, resetsAt: RESET_MS}});
});

test('the last event of a probe wins, and noise is skipped', () => {
    const output = [
        'not json',
        event({unifiedWindows: {five_hour: {utilization: 0.1, resetsAt: RESET_S}}}),
        event({unifiedWindows: {five_hour: {utilization: 0.2, resetsAt: RESET_S}}}),
    ].join('\n');
    equal(parseProbe(output).session.percent, 20);
});

test('a probe without any limit yields null', () => {
    equal(parseProbe(''), null);
    equal(parseProbe(JSON.stringify({type: 'result', is_error: true})), null);
    equal(parseProbe(event({status: 'allowed'})), null);
    equal(parseProbe(event({unifiedWindows: {five_hour: {utilization: 'x'}}})), null);
});

test('the status line record yields its time and both windows', () => {
    const record = {at: 5000, rate_limits: {
        five_hour: {used_percentage: 23.5, resets_at: RESET_S},
        seven_day: {used_percentage: 41.2, resets_at: RESET_S},
    }};
    equal(parseStatusline(record), {at: 5000, limits: {
        session: {percent: 23.5, resetsAt: RESET_MS},
        week: {percent: 41.2, resetsAt: RESET_MS},
    }});
});

test('a status line record with one window keeps the other as null', () => {
    const record = {at: 1, rate_limits: {seven_day: {used_percentage: 3}}};
    equal(parseStatusline(record), {at: 1, limits: {session: null, week: {percent: 3, resetsAt: null}}});
});

test('an unusable status line record yields null', () => {
    equal(parseStatusline(null), null);
    equal(parseStatusline({rate_limits: {}}), null);
    equal(parseStatusline({at: 1, rate_limits: {}}), null);
    equal(parseStatusline({at: 1, rate_limits: {five_hour: {used_percentage: 'x'}}}), null);
});

test('a window past its reset counts as empty', () => {
    const limits = {
        session: {percent: 80, resetsAt: 1000},
        week: {percent: 30, resetsAt: 9000},
    };
    equal(rollOver(limits, 2000), {
        session: {percent: 0, resetsAt: null},
        week: {percent: 30, resetsAt: 9000},
    });
    equal(rollOver({session: null, week: null}, 2000), {session: null, week: null});
});

test('settings keep known values and fall back to 15 minutes and blue', () => {
    equal(PROBE_CHOICES, [5, 15, 30, 60, 0]);
    equal(parseSettings({probeMinutes: 60, style: 'green'}), {probeMinutes: 60, style: 'green'});
    equal(parseSettings({probeMinutes: 0}), {probeMinutes: 0, style: 'blue'});
    equal(parseSettings({probeMinutes: 7, style: 'teal'}), {probeMinutes: 15, style: 'blue'});
    equal(parseSettings({probeMinutes: '5', style: 3}), {probeMinutes: 15, style: 'blue'});
    equal(parseSettings(null), {probeMinutes: 15, style: 'blue'});
});

done('parse');
