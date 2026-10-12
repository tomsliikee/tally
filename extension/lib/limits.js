// Gets the account's plan limits from Claude Code itself, in two ways:
//
// - a probe: one minimal "claude -p" call, whose output carries the limits;
// - the status line: record-limits.sh writes them to a file after every
//   answer of a Claude Code session in a terminal.
//
// The extension never reads the sign-in and makes no network request of its own.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {parseProbe, parseStatusline} from './parse.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

const PROBE_TIMEOUT_SECONDS = 60;
// Everything that would add tokens is switched off: a probe costs about 700
// input tokens on the smallest model and leaves no session log behind.
const PROBE_ARGUMENTS = [
    '-p', 'ok',
    '--model', 'haiku',
    '--system-prompt', 'Reply with the single word ok.',
    '--tools', '',
    '--setting-sources', '',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--output-format', 'stream-json',
    '--verbose',
];

const cacheDir = () => GLib.build_filenamev([GLib.get_user_cache_dir(), 'tally']);
const cacheFile = name => Gio.File.new_for_path(GLib.build_filenamev([cacheDir(), name]));

async function readJson(file, cancellable) {
    try {
        const [bytes] = await file.load_contents_async(cancellable);
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        return null;
    }
}

export class LimitsSource {
    // onStatusline is called whenever the status line has recorded new limits.
    constructor({onStatusline}) {
        this._cancellable = new Gio.Cancellable();
        this._probe = null;
        GLib.mkdir_with_parents(cacheDir(), 0o700);
        this._monitor = cacheFile('statusline.json').monitor_file(Gio.FileMonitorFlags.WATCH_MOVES, null);
        this._monitorId = this._monitor.connect('changed', () => onStatusline());
    }

    // Resolves to {limits} or to {problem: 'no-claude' | 'failed'}.
    async probe() {
        if (this._probe)
            return {problem: 'failed'};
        // The shell's PATH often lacks ~/.local/bin, where Claude Code installs itself.
        const fallback = GLib.build_filenamev([GLib.get_home_dir(), '.local', 'bin', 'claude']);
        const program = GLib.find_program_in_path('claude') ??
            (GLib.file_test(fallback, GLib.FileTest.IS_EXECUTABLE) ? fallback : null);
        if (!program)
            return {problem: 'no-claude'};

        let timeout = 0;
        try {
            const launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
            });
            // An empty directory, so no project instructions are picked up.
            launcher.set_cwd(cacheDir());
            this._probe = launcher.spawnv([program, ...PROBE_ARGUMENTS]);
            const probe = this._probe;
            timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, PROBE_TIMEOUT_SECONDS, () => {
                timeout = 0;
                probe.force_exit();
                return GLib.SOURCE_REMOVE;
            });
            const [stdout] = await probe.communicate_utf8_async(null, this._cancellable);
            const limits = parseProbe(stdout ?? '');
            return limits ? {limits} : {problem: 'failed'};
        } catch {
            return {problem: 'failed'};
        } finally {
            if (timeout)
                GLib.source_remove(timeout);
            this._probe = null;
        }
    }

    // Resolves to {at, limits} or null.
    async readStatusline() {
        return parseStatusline(await readJson(cacheFile('statusline.json'), this._cancellable));
    }

    // The last probe, kept so a restart shows a value at once.
    async loadLast() {
        const saved = await readJson(cacheFile('limits.json'), this._cancellable);
        // Written by this code, but a file on disk can still be anything.
        const valid = w => w === null || (typeof w?.percent === 'number' &&
            (w.resetsAt === null || typeof w.resetsAt === 'number'));
        if (typeof saved?.at !== 'number' || !valid(saved.limits?.session) || !valid(saved.limits?.week))
            return null;
        return {at: saved.at, limits: {session: saved.limits.session, week: saved.limits.week}};
    }

    async saveLast(limits, at) {
        try {
            const bytes = new GLib.Bytes(new TextEncoder().encode(JSON.stringify({at, limits})));
            await cacheFile('limits.json').replace_contents_bytes_async(
                bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, this._cancellable);
        } catch {
            // The cache is a convenience; failing to write it changes nothing shown now.
        }
    }

    destroy() {
        this._cancellable.cancel();
        this._monitor.disconnect(this._monitorId);
        this._monitor.cancel();
        this._probe?.force_exit();
    }
}
