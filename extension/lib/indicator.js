// The top bar item: a small ring and the session's percentage.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import * as Format from './format.js';
import {LAYOUT_MS, animate} from './motion.js';
import {Popup} from './popup.js';
import {Ring} from './ring.js';
import {styles} from './tokens.js';

const STALE_OPACITY = 128;
// The top bar is dark in both colour schemes, so its ring always is too.
const PANEL_THEME = 'dark';

export const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init({onOpen, onProbeNow, onProbeMinutes, onStyle}) {
        super._init(0.5, 'Tally');
        this._shown = 0;
        this._tween = null;
        this._style = styles[0];

        this._box = new St.BoxLayout({style_class: 'panel-status-indicators-box cu-indicator'});
        this._ring = new Ring({size: 16, stroke: 3, theme: `${this._style}-${PANEL_THEME}`});
        this._label = new St.Label({
            text: Format.percent(null),
            style_class: 'cu-indicator-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box.add_child(this._ring);
        this._box.add_child(this._label);
        this.add_child(this._box);

        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._theme = this._readTheme();
        this._popup = new Popup({style: this._style, theme: this._theme}, {onProbeNow, onProbeMinutes, onStyle});
        this.menu.box.add_style_class_name(this._popupClass());
        this.menu.box.add_child(this._popup.actor);

        this._interface.connectObject('changed::color-scheme',
            () => this._applyScheme(this._style, this._readTheme()), this);
        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open) {
                onOpen();
                this._popup.play();
            } else {
                this._popup.stop();
            }
        });
        this.connect('destroy', () => {
            this._tween?.stop();
            this._popup.stop();
            this._interface.disconnectObject(this);
        });
    }

    update(state) {
        const session = state.limits?.session ?? null;
        this._label.text = Format.percent(session?.percent ?? null);
        // Out-of-date limits stay visible, but stand back.
        this._box.opacity = state.problem && session ? STALE_OPACITY : 255;

        const from = this._shown;
        const to = session?.percent ?? 0;
        const tone = Format.tone(session?.percent);
        this._tween?.stop();
        this._tween = animate(this._ring, LAYOUT_MS, progress => {
            this._shown = from + (to - from) * progress;
            this._ring.set(this._shown, tone);
        });

        if (state.style !== this._style)
            this._applyScheme(state.style, this._theme);
        this._popup.update(state);
    }

    _popupClass() {
        return `cu-popup-${this._style}-${this._theme}`;
    }

    _readTheme() {
        return this._interface.get_string('color-scheme') === 'prefer-dark' ? 'dark' : 'light';
    }

    _applyScheme(style, theme) {
        this.menu.box.remove_style_class_name(this._popupClass());
        this._style = style;
        this._theme = theme;
        this.menu.box.add_style_class_name(this._popupClass());
        this._ring.setTheme(`${style}-${PANEL_THEME}`);
        this._popup.setScheme({style, theme});
    }
});
