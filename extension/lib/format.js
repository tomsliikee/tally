// Text for numbers. Units are set off with a space, as the design system asks.

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const WARN_AT = 75;
const BAD_AT = 90;

export function percent(value) {
    if (value === null || value === undefined)
        return '–';
    return `${Math.round(value)} %`;
}

export function duration(ms) {
    if (ms <= 0)
        return '0 min';
    // Round up, so a reset that is seconds away never reads as already done.
    const minutes = Math.ceil(ms / MIN);
    const d = Math.floor(minutes / (24 * 60));
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    if (d > 0)
        return h > 0 ? `${d} d ${h} h` : `${d} d`;
    if (h > 0)
        return m > 0 ? `${h} h ${m} min` : `${h} h`;
    return `${m} min`;
}

export function tokens(count) {
    const steps = [[1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
    for (const [size, unit] of steps) {
        // 999 950 would otherwise print as "1000.0 k".
        if (count >= size * 0.99995)
            return `${(count / size).toFixed(1)} ${unit}`;
    }
    return `${Math.round(count)}`;
}

export function cost(usd) {
    if (usd === null || usd === undefined)
        return '–';
    return `$${usd.toFixed(2)}`;
}

export function ago(ms) {
    if (ms < MIN)
        return 'just now';
    if (ms < HOUR)
        return `${Math.floor(ms / MIN)} min ago`;
    if (ms < DAY)
        return `${Math.floor(ms / HOUR)} h ago`;
    return `${Math.floor(ms / DAY)} d ago`;
}

export function tone(value) {
    if (value === null || value === undefined)
        return 'primary';
    if (value >= BAD_AT)
        return 'bad';
    if (value >= WARN_AT)
        return 'warn';
    return 'primary';
}
