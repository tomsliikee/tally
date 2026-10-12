// Sums the token usage of this machine's Claude Code sessions and prints it
// as JSON. Run as its own process (gjs -m scan.js), because parsing large
// logs inside GNOME Shell would stall the compositor.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {createAggregator} from './lib/aggregate.js';
import {dayCost, totalTokens} from './lib/pricing.js';

const DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const ATTRIBUTES = 'standard::name,standard::type,time::modified';

function* logFiles(dir, modifiedAfter) {
    let children;
    try {
        children = dir.enumerate_children(ATTRIBUTES, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    } catch {
        return;
    }
    let info;
    while ((info = children.next_file(null)) !== null) {
        const child = dir.get_child(info.get_name());
        if (info.get_file_type() === Gio.FileType.DIRECTORY)
            yield* logFiles(child, modifiedAfter);
        else if (info.get_name().endsWith('.jsonl') &&
            info.get_attribute_uint64('time::modified') * 1000 >= modifiedAfter)
            yield child;
    }
}

function readLines(file, onLine) {
    const decoder = new TextDecoder();
    let stream;
    try {
        stream = new Gio.DataInputStream({base_stream: file.read(null)});
    } catch {
        return;
    }
    try {
        let bytes;
        while ((bytes = stream.read_line(null)[0]) !== null) {
            const line = decoder.decode(bytes);
            // Most lines are tool output; only those with usage are worth parsing.
            if (line.includes('"usage"'))
                onLine(line);
        }
    } catch {
        // A log that is being written may end in a partial line.
    } finally {
        stream.close(null);
    }
}

const now = Date.now();
const aggregator = createAggregator({now, days: DAYS});
const root = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_home_dir(), '.claude', 'projects']));
// One extra day, as a session started before the window may still be written to.
for (const file of logFiles(root, now - (DAYS + 1) * DAY_MS))
    readLines(file, aggregator.addLine);

const days = aggregator.result().map(({date, models}) => ({
    date,
    tokens: totalTokens(models),
    cost: dayCost(models),
}));
print(JSON.stringify({scannedAt: now, days}));
