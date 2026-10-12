// Tells whether anyone is at the device: no key or pointer input for a
// while means nobody is there to read a fresh value.

export class IdleWatch {
    // onActive is called at the first input after the device went idle.
    constructor({thresholdMs, onActive}) {
        this._monitor = global.backend.get_core_idle_monitor();
        this._onActive = onActive;
        this._idle = false;
        this._activeWatch = 0;
        this._idleWatch = this._monitor.add_idle_watch(thresholdMs, () => this._becomeIdle());
        // The watch only fires on crossing the threshold, not when already past it.
        if (this._monitor.get_idletime() >= thresholdMs)
            this._becomeIdle();
    }

    isIdle() {
        return this._idle;
    }

    _becomeIdle() {
        if (this._idle)
            return;
        this._idle = true;
        // A user-active watch fires once and removes itself.
        this._activeWatch = this._monitor.add_user_active_watch(() => {
            this._activeWatch = 0;
            this._idle = false;
            this._onActive();
        });
    }

    destroy() {
        this._monitor.remove_watch(this._idleWatch);
        if (this._activeWatch)
            this._monitor.remove_watch(this._activeWatch);
        this._activeWatch = 0;
    }
}
