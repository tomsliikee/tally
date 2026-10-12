// Turns what Claude Code reports about the plan limits into values the rest
// of the extension can trust. Both sources end up in the same shape:
// {session, week}, each {percent, resetsAt in ms} or null.

import {styles} from './tokens.js';

function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function window(percent, resetsAtSeconds) {
    if (!isNumber(percent))
        return null;
    return {
        percent: Math.max(0, percent),
        resetsAt: isNumber(resetsAtSeconds) ? resetsAtSeconds * 1000 : null,
    };
}

function hasWindow(limits) {
    return limits.session !== null || limits.week !== null;
}

// In a probe the share is 0–1; the status line gives 0–100.
function probeWindow(raw) {
    if (!isRecord(raw) || !isNumber(raw.utilization))
        return null;
    return window(raw.utilization * 100, raw.resetsAt);
}

function probeLimits(info) {
    if (!isRecord(info))
        return null;
    const windows = isRecord(info.unifiedWindows) ? info.unifiedWindows : {};
    const limits = {
        session: probeWindow(windows.five_hour),
        week: probeWindow(windows.seven_day),
    };
    // Older versions name only the limit that is closest to its end.
    if (!hasWindow(limits)) {
        if (info.rateLimitType === 'five_hour')
            limits.session = probeWindow(info);
        else if (info.rateLimitType === 'seven_day')
            limits.week = probeWindow(info);
    }
    return hasWindow(limits) ? limits : null;
}

// output is what "claude -p --output-format stream-json" printed: one JSON
// object per line, one of them a rate_limit_event.
export function parseProbe(output) {
    let limits = null;
    for (const line of output.split('\n')) {
        if (!line.includes('rate_limit_event'))
            continue;
        try {
            const event = JSON.parse(line);
            if (event?.type === 'rate_limit_event')
                limits = probeLimits(event.rate_limit_info) ?? limits;
        } catch {
            // Not every line has to be JSON.
        }
    }
    return limits;
}

// record is what record-limits.sh wrote from the status line's input.
export function parseStatusline(record) {
    if (!isRecord(record) || !isNumber(record.at) || !isRecord(record.rate_limits))
        return null;
    const {five_hour: session, seven_day: week} = record.rate_limits;
    const limits = {
        session: isRecord(session) ? window(session.used_percentage, session.resets_at) : null,
        week: isRecord(week) ? window(week.used_percentage, week.resets_at) : null,
    };
    return hasWindow(limits) ? {at: record.at, limits} : null;
}

// A window whose reset has passed started again from nothing, whatever the
// last report said.
export function rollOver(limits, now) {
    const roll = w => w && w.resetsAt !== null && w.resetsAt <= now ? {percent: 0, resetsAt: null} : w;
    return {session: roll(limits.session), week: roll(limits.week)};
}

// How often a probe runs, in minutes; 0 means only when the menu opens.
export const PROBE_CHOICES = [5, 15, 30, 60, 0];
const DEFAULT_PROBE_MINUTES = 15;

export function parseSettings(json) {
    const {probeMinutes, style} = isRecord(json) ? json : {};
    return {
        probeMinutes: PROBE_CHOICES.includes(probeMinutes) ? probeMinutes : DEFAULT_PROBE_MINUTES,
        // The first style is the design system's default.
        style: styles.includes(style) ? style : styles[0],
    };
}
