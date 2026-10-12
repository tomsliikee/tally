import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Controller} from './lib/controller.js';
import {IdleWatch} from './lib/idle.js';
import {Indicator} from './lib/indicator.js';

const IDLE_AFTER_MS = 20 * 60 * 1000;

export default class TallyExtension extends Extension {
    enable() {
        this._idle = new IdleWatch({
            thresholdMs: IDLE_AFTER_MS,
            onActive: () => this._controller.resume(),
        });
        this._controller = new Controller({
            scanPath: `${this.path}/scan.js`,
            onChange: state => this._indicator.update(state),
            idle: this._idle,
        });
        this._indicator = new Indicator({
            onOpen: () => this._controller.refresh(),
            onProbeMinutes: minutes => this._controller.setProbeMinutes(minutes),
            onStyle: style => this._controller.setStyle(style),
        });

        // Directly left of the system menu.
        const rightBox = Main.panel._rightBox;
        const systemMenu = Main.panel.statusArea.quickSettings?.container;
        const position = Math.max(0, rightBox.get_children().indexOf(systemMenu));
        Main.panel.addToStatusArea(this.uuid, this._indicator, position, 'right');

        this._controller.start();
    }

    disable() {
        this._idle.destroy();
        this._idle = null;
        this._controller.destroy();
        this._controller = null;
        this._indicator.destroy();
        this._indicator = null;
    }
}
