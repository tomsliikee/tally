// Runs scan.js as a separate process and returns this machine's usage.

import Gio from 'gi://Gio';

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

function isDay(day) {
    return typeof day?.date === 'string' && typeof day.tokens === 'number' &&
        (day.cost === null || typeof day.cost === 'number');
}

export class LocalSource {
    constructor(scanPath) {
        this._scanPath = scanPath;
        this._cancellable = new Gio.Cancellable();
        this._process = null;
    }

    // Resolves to the list of days, oldest first, or null when the scan failed.
    async fetch() {
        if (this._process)
            return null;
        try {
            this._process = Gio.Subprocess.new(
                ['gjs', '-m', this._scanPath], Gio.SubprocessFlags.STDOUT_PIPE);
            const [stdout] = await this._process.communicate_utf8_async(null, this._cancellable);
            const days = JSON.parse(stdout)?.days;
            return Array.isArray(days) && days.every(isDay) ? days : null;
        } catch {
            return null;
        } finally {
            this._process = null;
        }
    }

    destroy() {
        this._cancellable.cancel();
        this._process?.force_exit();
    }
}
