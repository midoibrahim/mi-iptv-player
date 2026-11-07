/* ============================================================
   IPTV Player — Lightweight Pub/Sub Event Bus
   Decouples UI views, domain services, and background tasks
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.EventBus = {
    _listeners: {},

    on(event, handler) {
        if (!event || typeof handler !== 'function') return () => {};
        if (!this._listeners[event]) {
            this._listeners[event] = [];
        }
        this._listeners[event].push(handler);
        return () => this.off(event, handler);
    },

    off(event, handler) {
        const list = this._listeners[event];
        if (!list) return;
        if (!handler) {
            delete this._listeners[event];
            return;
        }
        const idx = list.indexOf(handler);
        if (idx !== -1) {
            list.splice(idx, 1);
        }
    },

    emit(event, payload) {
        const list = this._listeners[event];
        if (!list || list.length === 0) return;
        const snapshot = list.slice();
        for (let i = 0; i < snapshot.length; i++) {
            try {
                snapshot[i](payload);
            } catch (err) {
                console.error(`[EventBus] Error in handler for "${event}":`, err);
            }
        }
    },

    toast(message, duration = 2500) {
        this.emit('ui:toast', { message, duration });
    }
};

