// The design system's WavyProgress: a wave for what is used, a straight
// track for what remains and a stop dot at the end.

import Cairo from 'cairo';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {fraction, setSource, toneColor} from './paint.js';

const AMPLITUDE = 3;
const WAVELENGTH = 19;
const STROKE = 4;
const GAP = 9;
const TRACK_ALPHA = 0.22;
const HEIGHT = 2 * AMPLITUDE + STROKE + 2;

export const WavyProgress = GObject.registerClass(
class WavyProgress extends St.DrawingArea {
    _init({theme}) {
        super._init({height: HEIGHT, x_expand: true});
        this._theme = theme;
        this._percent = null;
        this._tone = 'primary';
        this._phase = 0;
        this.connect('repaint', () => this._draw());
    }

    set(percent, tone) {
        this._percent = percent;
        this._tone = tone;
        this.queue_repaint();
    }

    // Shifts the wave by a share of one wavelength, to let it travel.
    setPhase(phase) {
        this._phase = phase;
        this.queue_repaint();
    }

    setTheme(theme) {
        this._theme = theme;
        this.queue_repaint();
    }

    _draw() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        const color = toneColor(this._theme, this._tone);
        const middle = height / 2;
        const left = STROKE / 2;
        const right = width - STROKE / 2;
        const end = left + fraction(this._percent) * (right - left);

        cr.setLineWidth(STROKE);
        cr.setLineCap(Cairo.LineCap.ROUND);
        cr.setLineJoin(Cairo.LineJoin.ROUND);

        if (end > left) {
            setSource(cr, color);
            const shift = this._phase * WAVELENGTH;
            for (let x = left; x <= end; x += 1) {
                const y = middle + AMPLITUDE * Math.sin(((x - left - shift) / WAVELENGTH) * 2 * Math.PI);
                if (x === left)
                    cr.moveTo(x, y);
                else
                    cr.lineTo(x, y);
            }
            cr.stroke();
        }

        const trackStart = end > left ? end + GAP : left;
        if (trackStart < right) {
            setSource(cr, color, TRACK_ALPHA);
            cr.moveTo(trackStart, middle);
            cr.lineTo(right, middle);
            cr.stroke();

            setSource(cr, color);
            cr.arc(right, middle, STROKE / 2, 0, 2 * Math.PI);
            cr.fill();
        }
        cr.$dispose();
    }
});
