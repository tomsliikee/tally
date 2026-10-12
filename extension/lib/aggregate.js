// Sums the token usage in Claude Code session logs into one bucket per local day.

function pad(n) {
    return String(n).padStart(2, '0');
}

export function dayKey(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function count(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readUsage(usage) {
    const split = usage.cache_creation;
    const hasSplit = typeof split === 'object' && split !== null;
    return {
        input: count(usage.input_tokens),
        output: count(usage.output_tokens),
        cacheRead: count(usage.cache_read_input_tokens),
        // Older logs give only the total; the 5-minute lifetime is the default.
        cacheWrite5m: hasSplit ? count(split.ephemeral_5m_input_tokens) : count(usage.cache_creation_input_tokens),
        cacheWrite1h: hasSplit ? count(split.ephemeral_1h_input_tokens) : 0,
    };
}

export function createAggregator({now, days}) {
    const dates = [];
    const today = new Date(now);
    for (let i = days - 1; i >= 0; i--) {
        // Calendar arithmetic, so a daylight-saving change cannot skip or repeat a day.
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i, 12);
        dates.push(dayKey(d.getTime()));
    }
    const wanted = new Set(dates);
    // A message is logged once per content block, and while it streams its
    // output count is still growing, so each one is kept once at its largest.
    const messages = new Map();

    function addLine(text) {
        let entry;
        try {
            entry = JSON.parse(text);
        } catch {
            return;
        }
        const message = entry?.message;
        if (entry?.type !== 'assistant' || typeof message?.usage !== 'object' || message.usage === null)
            return;
        if (typeof message.model !== 'string' || message.model.startsWith('<'))
            return;
        const time = Date.parse(entry.timestamp);
        if (Number.isNaN(time))
            return;
        const date = dayKey(time);
        if (!wanted.has(date))
            return;

        const usage = readUsage(message.usage);
        const key = `${message.id}:${entry.requestId}`;
        const known = messages.get(key);
        if (!known || usage.output > known.usage.output)
            messages.set(key, {date, model: message.model, usage});
    }

    function result() {
        const byDate = new Map(dates.map(date => [date, {date, models: {}}]));
        for (const {date, model, usage} of messages.values()) {
            const models = byDate.get(date).models;
            const sum = models[model] ??= {input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0};
            for (const field of Object.keys(sum))
                sum[field] += usage[field];
        }
        return [...byDate.values()];
    }

    return {addLine, result};
}
