// Holds what the extension knows and decides when to ask again.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {LimitsSource} from './limits.js';
import {LocalSource} from './local.js';
import {PROBE_CHOICES, parseSettings, rollOver} from './parse.js';
import {loadSettings, saveSettings, watchSettings} from './settings.js';

// The local scan is free; it also makes windows past their reset fall to zero.
const TICK_SECONDS = 5 * 60;
const MINUTE_MS = 60 * 1000;
// The tick is not exact, so a probe that is almost due runs with it.
const TICK_SLACK_MS = 30 * 1000;
// Opening the menu asks again, but not more often than this.
const MENU_PROBE_GAP_MS = 5 * 60 * 1000;
const MENU_SCAN_GAP_MS = 30 * 1000;

export class Controller {
    constructor({scanPath, onChange, idle}) {
        this._onChange = onChange;
        // Anything with isIdle(); see idle.js.
        this._idle = idle;
        this._limitsSource = new LimitsSource({onStatusline: () => this._readStatusline()});
        this._localSource = new LocalSource(scanPath);
        this._lastProbe = 0;
        this._lastScan = 0;
        this._probing = false;
        this._timer = 0;
        this._destroyed = false;
        this._cancellable = new Gio.Cancellable();
        this._probeMinutes = parseSettings(null).probeMinutes;
        this._style = parseSettings(null).style;
        // What was reported, before windows past their reset are emptied.
        this._reported = null;
        this.state = {limits: null, limitsAt: null, problem: null, days: null, probing: false,
            probeMinutes: this._probeMinutes, style: this._style};
    }

    async start() {
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, TICK_SECONDS, () => {
            this._tick();
            return GLib.SOURCE_CONTINUE;
        });
        const settings = await loadSettings(this._cancellable);
        if (this._destroyed)
            return;
        this._probeMinutes = settings.probeMinutes;
        this._style = settings.style;
        this._stopWatching = watchSettings(() => this._settingsEdited());
        const saved = await this._limitsSource.loadLast();
        if (this._destroyed)
            return;
        if (saved) {
            this._accept(saved.limits, saved.at);
            // A restart of the shell is no reason to ask sooner.
            this._lastProbe = saved.at;
        }
        await this._readStatusline();
        if (this._destroyed)
            return;
        this._refresh(this._timedProbeGap(), 0);
    }

    // Nothing is asked for while nobody is at the device: a probe costs
    // tokens, and there is no one to read the result.
    _tick() {
        if (this._idle.isIdle())
            return;
        this._refresh(this._timedProbeGap(), 0);
    }

    // Called at the first input after the device was idle.
    resume() {
        this._refresh(this._timedProbeGap(), 0);
    }

    // A probe is a real request to Claude, so the user sets how often one
    // runs on its own. Infinity: never, only when the menu opens.
    _timedProbeGap() {
        return this._probeMinutes === 0 ? Infinity : this._probeMinutes * MINUTE_MS - TICK_SLACK_MS;
    }

    setProbeMinutes(minutes) {
        if (!PROBE_CHOICES.includes(minutes) || minutes === this._probeMinutes)
            return;
        this._probeMinutes = minutes;
        this._saveSettings();
    }

    setStyle(style) {
        if (style === this._style)
            return;
        // Read back through the parser, so an unknown name cannot be stored.
        this._style = parseSettings({style}).style;
        this._saveSettings();
    }

    // The file changed from outside; Tally's own saves read back the same.
    async _settingsEdited() {
        const settings = await loadSettings(this._cancellable);
        if (this._destroyed)
            return;
        if (settings.style === this._style && settings.probeMinutes === this._probeMinutes)
            return;
        this._style = settings.style;
        this._probeMinutes = settings.probeMinutes;
        this._emit({});
    }

    _saveSettings() {
        saveSettings({probeMinutes: this._probeMinutes, style: this._style}, this._cancellable);
        this._emit({});
    }

    // Called when the menu opens.
    refresh() {
        this._refresh(MENU_PROBE_GAP_MS, MENU_SCAN_GAP_MS);
    }

    // Called from the menu's button. The limits can change without a window
    // ending, so the user can ask at once, whatever the gaps say.
    probeNow() {
        if (this._destroyed || this._probing)
            return;
        this._lastProbe = Date.now();
        this._probe();
    }

    _refresh(probeGap, scanGap) {
        if (this._destroyed)
            return;
        const now = Date.now();
        if (now - this._lastProbe >= probeGap) {
            this._lastProbe = now;
            this._probe();
        }
        if (now - this._lastScan >= scanGap) {
            this._lastScan = now;
            this._scan();
        }
        this._emit({});
    }

    async _probe() {
        if (this._probing)
            return;
        this._probing = true;
        this._emit({});
        const result = await this._limitsSource.probe();
        if (this._destroyed)
            return;
        this._probing = false;
        if (result.limits) {
            const at = Date.now();
            this._accept(result.limits, at);
            this._emit({problem: null});
            this._limitsSource.saveLast(result.limits, at);
        } else {
            // The last known limits stay; the views show them as out of date.
            this._emit({problem: result.problem});
        }
    }

    async _readStatusline() {
        const record = await this._limitsSource.readStatusline();
        if (this._destroyed || !record)
            return;
        if (this._accept(record.limits, record.at)) {
            // A terminal session is reporting, so a probe can wait.
            this._lastProbe = Math.max(this._lastProbe, record.at);
            this._emit({problem: null});
        }
    }

    // Takes a report if it is newer than what is known. A source that left a
    // window out keeps the one already known.
    _accept(limits, at) {
        if (this._reported && at <= this._reported.at)
            return false;
        const known = this._reported?.limits;
        this._reported = {
            at,
            limits: {
                session: limits.session ?? known?.session ?? null,
                week: limits.week ?? known?.week ?? null,
            },
        };
        return true;
    }

    async _scan() {
        const days = await this._localSource.fetch();
        if (this._destroyed || !days)
            return;
        this._emit({days});
    }

    _emit(change) {
        const reported = this._reported;
        this.state = {
            ...this.state,
            ...change,
            probeMinutes: this._probeMinutes,
            style: this._style,
            probing: this._probing,
            limits: reported ? rollOver(reported.limits, Date.now()) : null,
            limitsAt: reported ? reported.at : null,
        };
        this._onChange(this.state);
    }

    destroy() {
        this._destroyed = true;
        this._stopWatching?.();
        this._cancellable.cancel();
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = 0;
        this._limitsSource.destroy();
        this._localSource.destroy();
    }
}
