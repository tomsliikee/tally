// The menu's content, built from the design system: one loud tile for the
// session, neutral tiles for the rest.

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Format from './format.js';
import {Bars} from './bars.js';
import {Chevron} from './chevron.js';
import {LAYOUT_MS, STATE_MS, WAVE_MS, animate} from './motion.js';
import {PROBE_CHOICES} from './parse.js';
import {Swatch} from './swatch.js';
import {styles} from './tokens.js';
import {Ring} from './ring.js';
import {text} from './text.js';
import {WavyProgress} from './wavy.js';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const PROBLEMS = {
    'no-claude': 'Claude Code was not found on this machine.',
    'failed': 'Claude Code did not report the limits. Check that it is signed in.',
};

function column(styleClass = '') {
    return new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: styleClass, x_expand: true});
}

function resetSentence(window, now) {
    if (!window || window.resetsAt === null)
        return '';
    return `Resets in ${Format.duration(window.resetsAt - now)}`;
}

export class Popup {
    constructor({style, theme}, {onProbeMinutes, onStyle}) {
        // The marks are drawn in a scheme, one style in one theme.
        this._theme = `${style}-${theme}`;
        this._light = theme;
        this._onProbeMinutes = onProbeMinutes;
        this._onStyle = onStyle;
        this._state = {limits: null, limitsAt: null, problem: null, days: null, probeMinutes: null, style: null};
        this._entrance = null;
        this._wave = null;

        this.actor = column('cu-content');
        this._buildSession();
        this._buildWeek();
        this._buildLocal();
        this._footer = text('aside', {muted: true, wrap: true});
        this._footer.add_style_class_name('cu-footer');
        this.actor.add_child(this._footer);
        this._buildOverflow();
        this._buildRefresh();
        this._render(1);
    }

    _buildSession() {
        const tile = column('cu-tile cu-tile-loud');
        this._sessionValue = text('metric-l');
        this._sessionWave = new WavyProgress({theme: this._theme});
        this._sessionReset = text('body-strong');
        const label = text('label', {muted: true});
        label.text = 'of your 5-hour session used';
        tile.add_child(this._sessionValue);
        tile.add_child(label);
        tile.add_child(this._sessionWave);
        tile.add_child(this._sessionReset);
        this.actor.add_child(tile);
    }

    _buildWeek() {
        const tile = column('cu-tile');
        const row = new St.BoxLayout({x_expand: true});
        const numbers = column();
        this._weekValue = text('metric-m');
        const label = text('label', {muted: true});
        label.text = 'of your week used';
        numbers.add_child(this._weekValue);
        numbers.add_child(label);
        this._weekRing = new Ring({size: 36, stroke: 5, theme: this._theme});
        row.add_child(numbers);
        row.add_child(this._weekRing);
        this._weekReset = text('body', {muted: true});
        tile.add_child(row);
        tile.add_child(this._weekReset);
        this.actor.add_child(tile);
    }

    _buildLocal() {
        const header = text('title');
        header.text = 'This machine';
        header.add_style_class_name('cu-section');
        this.actor.add_child(header);

        const tile = column('cu-tile');
        const numbers = new St.BoxLayout({style_class: 'cu-columns', x_expand: true});
        this._tokensValue = text('metric-s');
        this._costValue = text('metric-s');
        for (const [value, caption] of [[this._tokensValue, 'tokens today'], [this._costValue, 'at API list prices']]) {
            const cell = column();
            const label = text('label', {muted: true});
            label.text = caption;
            cell.add_child(value);
            cell.add_child(label);
            numbers.add_child(cell);
        }
        this._bars = new Bars({theme: this._theme});
        this._dayLabels = new St.BoxLayout({x_expand: true});
        this._dayLabels.layout_manager.homogeneous = true;
        this._dayLabelDates = '';
        // Anything the extension computes itself says so.
        const note = text('aside', {muted: true, wrap: true});
        note.text = 'Estimated from the logs on this machine, cache included. Not what you pay.';
        tile.add_child(numbers);
        tile.add_child(this._bars);
        tile.add_child(this._dayLabels);
        tile.add_child(note);
        this.actor.add_child(tile);
    }

    // The setting is not needed day to day, so it waits behind a chevron at
    // the bottom and is closed again whenever the menu opens.
    _buildOverflow() {
        this._overflowOpen = false;
        this._turn = null;
        this._chevron = new Chevron({theme: this._theme});
        this._overflow = new St.Button({
            style_class: 'cu-overflow',
            child: this._chevron,
            can_focus: true,
            x_align: Clutter.ActorAlign.CENTER,
            accessible_name: 'Refresh settings',
        });
        this._overflow.connect('clicked', () => this._setOverflow(!this._overflowOpen));
        this.actor.add_child(this._overflow);
    }

    _setOverflow(open, {animated = true} = {}) {
        this._overflowOpen = open;
        this._turn?.stop();
        this._turn = null;
        const tile = this._refreshTile;
        tile.remove_all_transitions();
        if (!animated) {
            tile.visible = open;
            tile.opacity = 255;
            tile.height = -1;
            this._chevron.setDirection(open ? 1 : -1);
            return;
        }

        const from = open ? -1 : 1;
        this._turn = animate(this._chevron, STATE_MS, progress => {
            this._chevron.setDirection(from + (open ? 2 : -2) * progress);
            if (progress === 1)
                this._turn = null;
        });
        if (open) {
            tile.visible = true;
            tile.height = -1;
            const [, natural] = tile.get_preferred_height(this.actor.width);
            tile.height = 0;
            tile.opacity = 0;
            tile.ease({
                height: natural,
                opacity: 255,
                duration: STATE_MS,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                // Back to its own height, so later text changes still fit.
                onComplete: () => (tile.height = -1),
            });
        } else {
            tile.ease({
                height: 0,
                opacity: 0,
                duration: STATE_MS,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                onComplete: () => {
                    tile.visible = false;
                    tile.height = -1;
                },
            });
        }
    }

    // The design system's ButtonGroup, with one segment more than it
    // recommends: four intervals and "Off".
    _buildRefresh() {
        const tile = column('cu-tile');
        const label = text('label', {muted: true});
        label.text = 'Minutes between requests to Claude Code';
        const group = new St.BoxLayout({style_class: 'cu-segments', x_expand: true});
        group.layout_manager.homogeneous = true;
        this._segments = PROBE_CHOICES.map((minutes, i) => {
            const caption = text('body-strong');
            caption.text = minutes === 0 ? 'Off' : `${minutes}`;
            const position = i === 0 ? 'first' : i === PROBE_CHOICES.length - 1 ? 'last' : 'middle';
            const button = new St.Button({
                style_class: `cu-segment cu-segment-${position}`,
                child: caption,
                can_focus: true,
                x_expand: true,
            });
            button.connect('clicked', () => this._onProbeMinutes(minutes));
            group.add_child(button);
            return {minutes, button};
        });
        const note = text('aside', {muted: true, wrap: true});
        note.text = 'Each request uses about 700 tokens of your plan. Off asks only when this menu opens.';

        const styleLabel = text('label', {muted: true});
        styleLabel.text = 'Colour';
        styleLabel.add_style_class_name('cu-setting');
        const row = new St.BoxLayout({style_class: 'cu-swatches'});
        this._swatches = styles.map(style => {
            const swatch = new Swatch({style, theme: this._light});
            const button = new St.Button({
                style_class: 'cu-swatch',
                child: swatch,
                can_focus: true,
                accessible_name: style,
            });
            button.connect('clicked', () => this._onStyle(style));
            row.add_child(button);
            return {style, swatch};
        });

        tile.add_child(label);
        tile.add_child(group);
        tile.add_child(note);
        tile.add_child(styleLabel);
        tile.add_child(row);
        tile.visible = false;
        // The tile's height is animated, so what does not fit yet is cut off.
        tile.clip_to_allocation = true;
        this._refreshTile = tile;
        this.actor.add_child(tile);
    }

    _syncSegments() {
        for (const {minutes, button} of this._segments) {
            if (minutes === this._state.probeMinutes)
                button.add_style_class_name('cu-segment-selected');
            else
                button.remove_style_class_name('cu-segment-selected');
        }
        for (const {style, swatch} of this._swatches)
            swatch.setSelected(style === this._state.style);
    }

    update(state) {
        this._state = state;
        this._syncDayLabels();
        this._syncSegments();
        if (!this._entrance)
            this._render(1);
    }

    setScheme({style, theme}) {
        this._theme = `${style}-${theme}`;
        this._light = theme;
        for (const mark of [this._sessionWave, this._weekRing, this._bars, this._chevron])
            mark.setTheme(this._theme);
        for (const {swatch} of this._swatches)
            swatch.setTheme(theme);
    }

    // Called when the menu opens: marks grow and numbers count up once.
    play() {
        this._setOverflow(false, {animated: false});
        this._entrance?.stop();
        this._entrance = animate(this.actor, LAYOUT_MS, progress => {
            this._render(progress);
            if (progress === 1)
                this._entrance = null;
        });
        this._syncWave();
    }

    stop() {
        this._entrance?.stop();
        this._entrance = null;
        this._wave?.stop();
        this._wave = null;
        this._turn?.stop();
        this._turn = null;
        this._refreshTile.remove_all_transitions();
    }

    // A limit that is used up turns its progress into a travelling wave.
    _syncWave() {
        const full = (this._state.limits?.session?.percent ?? 0) >= 100;
        if (full && !this._wave) {
            this._wave = animate(this._sessionWave, WAVE_MS,
                progress => this._sessionWave.setPhase(progress), {loop: true});
        } else if (!full && this._wave) {
            this._wave.stop();
            this._wave = null;
            this._sessionWave.setPhase(0);
        }
    }

    _syncDayLabels() {
        const days = this._state.days ?? [];
        const dates = days.map(day => day.date).join('|');
        if (dates === this._dayLabelDates)
            return;
        this._dayLabelDates = dates;
        this._dayLabels.destroy_all_children();
        for (const day of days) {
            const label = text('label', {muted: true, expand: true});
            label.text = WEEKDAYS[new Date(`${day.date}T12:00:00`).getDay()];
            label.x_align = Clutter.ActorAlign.CENTER;
            this._dayLabels.add_child(label);
        }
    }

    // progress (0–1) scales every value, for the entrance.
    _render(progress) {
        const now = Date.now();
        const {limits, limitsAt, problem, days} = this._state;
        const scaled = window => window ? window.percent * progress : null;

        const session = limits?.session ?? null;
        this._sessionValue.text = Format.percent(scaled(session));
        this._sessionWave.set(scaled(session), Format.tone(session?.percent));
        this._sessionReset.text = resetSentence(session, now);
        this._sessionReset.visible = this._sessionReset.text !== '';

        const week = limits?.week ?? null;
        this._weekValue.text = Format.percent(scaled(week));
        this._weekRing.set(scaled(week), Format.tone(week?.percent));
        this._weekReset.text = resetSentence(week, now);
        this._weekReset.visible = this._weekReset.text !== '';

        const today = days?.at(-1) ?? null;
        this._tokensValue.text = today ? Format.tokens(today.tokens * progress) : '–';
        this._costValue.text = Format.cost(today && today.cost !== null ? today.cost * progress : null);
        this._bars.set((days ?? []).map(day => day.tokens), progress);

        const parts = [];
        if (problem)
            parts.push(PROBLEMS[problem]);
        if (limitsAt !== null)
            parts.push(problem ? `Limits are from ${Format.ago(now - limitsAt)}.` : `Reported by Claude Code ${Format.ago(now - limitsAt)}.`);
        this._footer.text = parts.join(' ');
    }
}
