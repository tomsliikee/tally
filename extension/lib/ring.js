// The design system's Ring: circular progress that starts at 12 o'clock and
// runs clockwise, with round caps.

import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {colors} from './tokens.js';
import {fraction, setSource, toneColor} from './paint.js';

export const Ring = GObject.registerClass(
class Ring extends St.DrawingArea {
    _init({size, stroke, theme}) {
        super._init({width: size, height: size, y_align: Clutter.ActorAlign.CENTER});
        this._stroke = stroke;
        this._theme = theme;
        this._percent = null;
        this._tone = 'primary';
        this.connect('repaint', () => this._draw());
    }

    set(percent, tone) {
        this._percent = percent;
        this._tone = tone;
        this.queue_repaint();
    }

    setTheme(theme) {
        this._theme = theme;
        this.queue_repaint();
    }

    _draw() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        const radius = (Math.min(width, height) - this._stroke) / 2;
        const start = -Math.PI / 2;

        cr.setLineWidth(this._stroke);
        cr.setLineCap(Cairo.LineCap.ROUND);
        setSource(cr, colors[this._theme]['primary-container']);
        cr.arc(width / 2, height / 2, radius, 0, 2 * Math.PI);
        cr.stroke();

        const value = fraction(this._percent);
        if (value > 0) {
            setSource(cr, toneColor(this._theme, this._tone));
            cr.arc(width / 2, height / 2, radius, start, start + value * 2 * Math.PI);
            cr.stroke();
        }
        cr.$dispose();
    }
});
