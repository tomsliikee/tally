// A small bar chart of the last days; the last bar is today.

import GObject from 'gi://GObject';
import St from 'gi://St';

import {colors, sizes} from './tokens.js';
import {setSource} from './paint.js';

const HEIGHT = 64;
const GAP = sizes['space-2'];
// A day without usage still gets a mark, so the week reads as seven days.
const EMPTY_HEIGHT = 4;

function roundedBar(cr, x, y, width, height) {
    const radius = Math.min(sizes['radius-large'], width / 2, height / 2);
    cr.newSubPath();
    cr.arc(x + width - radius, y + radius, radius, -Math.PI / 2, 0);
    cr.arc(x + width - radius, y + height - radius, radius, 0, Math.PI / 2);
    cr.arc(x + radius, y + height - radius, radius, Math.PI / 2, Math.PI);
    cr.arc(x + radius, y + radius, radius, Math.PI, 1.5 * Math.PI);
    cr.closePath();
}

export const Bars = GObject.registerClass(
class Bars extends St.DrawingArea {
    _init({theme}) {
        super._init({height: HEIGHT, x_expand: true});
        this._theme = theme;
        this._values = [];
        this._grow = 1;
        this.connect('repaint', () => this._draw());
    }

    // grow (0–1) scales every bar, for the entrance.
    set(values, grow = 1) {
        this._values = values;
        this._grow = grow;
        this.queue_repaint();
    }

    setTheme(theme) {
        this._theme = theme;
        this.queue_repaint();
    }

    _draw() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        const count = this._values.length;
        if (count > 0) {
            const barWidth = (width - GAP * (count - 1)) / count;
            const max = Math.max(...this._values);
            const palette = colors[this._theme];
            this._values.forEach((value, i) => {
                const today = i === count - 1;
                const share = max > 0 ? (value / max) * this._grow : 0;
                const barHeight = Math.max(EMPTY_HEIGHT, share * height);
                const color = value > 0 ? palette[today ? 'primary' : 'primary-container'] : palette['outline-variant'];
                setSource(cr, color);
                roundedBar(cr, i * (barWidth + GAP), height - barHeight, barWidth, barHeight);
                cr.fill();
            });
        }
        cr.$dispose();
    }
});
