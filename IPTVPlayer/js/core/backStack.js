/* ============================================================
   IPTV Player — Back Navigation Stack & Chain of Responsibility
   Replaces monolithic DOM-sniffing goBack() chains with
   self-contained, priority-ordered or LIFO back handlers (OCP).
   ============================================================ */

window.IPTV = window.IPTV || {};

window.IPTV.BackStack = {
    _guards: [],
    _stack: [],

    /**
     * Push a transient modal/drawer close handler onto the LIFO stack.
     */
    push(id, onBack) {
        if (!id || typeof onBack !== 'function') return;
        this.pop(id);
        this._stack.push({ id, onBack });
    },

    /**
     * Remove a transient handler by id when the modal/drawer closes.
     */
    pop(id) {
        if (!id) return;
        this._stack = this._stack.filter(item => item.id !== id);
    },

    /**
     * Register a declarative back guard in priority order (higher runs first).
     */
    register({ id, priority = 0, isActive, onBack }) {
        if (!id || typeof isActive !== 'function' || typeof onBack !== 'function') return;
        this._guards = this._guards.filter(g => g.id !== id);
        this._guards.push({ id, priority, isActive, onBack });
        this._guards.sort((a, b) => b.priority - a.priority);
    },

    /**
     * Execute the highest-priority active back handler.
     * Returns true if a handler consumed the back action, false if at root.
     */
    handleBack() {
        while (this._stack.length > 0) {
            const top = this._stack.pop();
            const res = top.onBack();
            if (res !== false) return true;
        }

        for (let i = 0; i < this._guards.length; i++) {
            const guard = this._guards[i];
            if (guard.isActive()) {
                const res = guard.onBack();
                return res !== false;
            }
        }
        return false;
    },

    clear() {
        this._stack = [];
        this._guards = [];
    }
};

