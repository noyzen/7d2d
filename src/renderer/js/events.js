class EventEmitter {
    constructor() {
        this.events = {};
    }

    /**
     * @param {string} eventName
     * @param {Function} listener
     * @returns {Function} Unsubscribe function
     */
    on(eventName, listener) {
        if (!this.events[eventName]) {
            this.events[eventName] = [];
        }
        this.events[eventName].push(listener);

        // Return an unsubscribe function
        return () => {
            this.events[eventName] = this.events[eventName].filter(l => l !== listener);
        };
    }

    /**
     * @param {string} eventName
     * @param  {...any} args
     */
    emit(eventName, ...args) {
        if (this.events[eventName]) {
            // Create a copy of the listeners array in case a listener unsubscribes itself
            [...this.events[eventName]].forEach(listener => listener(...args));
        }
    }
}

export const rendererEvents = new EventEmitter();
