// API list prices in USD per million tokens, checked on 2026-10-12.
// They only feed an estimate: a subscription is not billed per token.

const CACHE_WRITE_5M = 1.25;
const CACHE_WRITE_1H = 2;
const CACHE_READ = 0.1;

// [id prefix, input, output, cache read as a share of input]
const PRICES = [
    ['claude-fable-5-1', 10, 50, 0.025],
    ['claude-mythos-5-1', 10, 50, 0.025],
    ['claude-fable-5', 10, 50, CACHE_READ],
    ['claude-mythos-5', 10, 50, CACHE_READ],
    ['claude-opus-5-5', 4, 20, 0.05],
    ['claude-opus-5', 5, 25, CACHE_READ],
    ['claude-opus-4-8', 5, 25, CACHE_READ],
    ['claude-opus-4-7', 5, 25, CACHE_READ],
    ['claude-opus-4-6', 5, 25, CACHE_READ],
    ['claude-sonnet-5-5', 2, 10, CACHE_READ],
    ['claude-sonnet-5', 2, 10, CACHE_READ],
    ['claude-sonnet-4-6', 3, 15, CACHE_READ],
    // Haiku 5.5 costs more beyond 100k prompt tokens; the logs do not say
    // which requests crossed that line, so the base rate is used.
    ['claude-haiku-5-5', 0.1, 0.5, CACHE_READ],
    ['claude-haiku-4-5', 1, 5, CACHE_READ],
// Longest prefix first, so "claude-opus-5-5" is not priced as "claude-opus-5".
].sort((a, b) => b[0].length - a[0].length);

const PER_TOKEN = 1 / 1_000_000;

export function costOf(model, usage) {
    const price = PRICES.find(([prefix]) => model.startsWith(prefix));
    if (!price)
        return null;
    const [, input, output, cacheRead] = price;
    const usd = usage.input * input +
        usage.output * output +
        usage.cacheWrite5m * input * CACHE_WRITE_5M +
        usage.cacheWrite1h * input * CACHE_WRITE_1H +
        usage.cacheRead * input * cacheRead;
    // Rounded to a micro-dollar to keep float noise out of the sums.
    return Math.round(usd * PER_TOKEN * 1e6) / 1e6;
}

export function dayCost(models) {
    let sum = 0;
    for (const [model, usage] of Object.entries(models)) {
        const usd = costOf(model, usage);
        if (usd === null)
            return null;
        sum += usd;
    }
    return Math.round(sum * 1e6) / 1e6;
}

export function totalTokens(models) {
    let sum = 0;
    for (const usage of Object.values(models))
        sum += usage.input + usage.output + usage.cacheRead + usage.cacheWrite5m + usage.cacheWrite1h;
    return sum;
}
