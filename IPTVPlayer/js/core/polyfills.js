/**
 * Polyfills & Compatibility Layer for Legacy webOS Versions (webOS 3.x - 6.x)
 */
(function() {
    'use strict';

    // 1. CustomEvent Polyfill (Older WebKit / Chromium 38)
    // NOTE: function expression (not declaration) - Chromium 38 rejects block-level
    // function declarations in strict mode, which aborted this whole file.
    if (typeof window.CustomEvent !== 'function') {
        var CustomEvent = function CustomEvent(event, params) {
            params = params || { bubbles: false, cancelable: false, detail: null };
            var evt = document.createEvent('CustomEvent');
            evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
            return evt;
        };
        CustomEvent.prototype = window.Event.prototype;
        window.CustomEvent = CustomEvent;
    }

    // 2. Object.assign Polyfill (webOS 3.0 / Chromium 38)
    if (typeof Object.assign !== 'function') {
        Object.defineProperty(Object, 'assign', {
            value: function assign(target, varArgs) {
                if (target === null || target === undefined) {
                    throw new TypeError('Cannot convert undefined or null to object');
                }
                var to = Object(target);
                for (var index = 1; index < arguments.length; index++) {
                    var nextSource = arguments[index];
                    if (nextSource !== null && nextSource !== undefined) {
                        for (var nextKey in nextSource) {
                            if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                                to[nextKey] = nextSource[nextKey];
                            }
                        }
                    }
                }
                return to;
            },
            writable: true,
            configurable: true
        });
    }

    // 3. Array.from Polyfill
    if (!Array.from) {
        Array.from = (function() {
            var toStr = Object.prototype.toString;
            var isCallable = function(fn) {
                return typeof fn === 'function' || toStr.call(fn) === '[object Function]';
            };
            return function from(arrayLike/*, mapFn, thisArg */) {
                var C = this;
                var items = Object(arrayLike);
                if (arrayLike == null) {
                    throw new TypeError('Array.from requires an array-like object - not null or undefined');
                }
                var mapFn = arguments.length > 1 ? arguments[1] : void undefined;
                var T;
                if (typeof mapFn !== 'undefined') {
                    if (!isCallable(mapFn)) {
                        throw new TypeError('Array.from: when provided, the second argument must be a function');
                    }
                    if (arguments.length > 2) {
                        T = arguments[2];
                    }
                }
                var len = items.length >>> 0;
                var A = isCallable(C) ? Object(new C(len)) : new Array(len);
                var k = 0;
                var kValue;
                while (k < len) {
                    kValue = items[k];
                    if (mapFn) {
                        A[k] = typeof T === 'undefined' ? mapFn(kValue, k) : mapFn.call(T, kValue, k);
                    } else {
                        A[k] = kValue;
                    }
                    k += 1;
                }
                A.length = len;
                return A;
            };
        }());
    }

    // 4. String.prototype.startsWith / endsWith / includes
    if (!String.prototype.startsWith) {
        String.prototype.startsWith = function(search, pos) {
            return this.substr(!pos || pos < 0 ? 0 : +pos, search.length) === search;
        };
    }
    if (!String.prototype.includes) {
        String.prototype.includes = function(search, start) {
            if (typeof start !== 'number') { start = 0; }
            if (start + search.length > this.length) { return false; }
            return this.indexOf(search, start) !== -1;
        };
    }

    // 5. window.fetch Polyfill using XMLHttpRequest (for webOS 3.x / Chromium 38)
    if (!window.fetch) {
        window.fetch = function(url, options) {
            options = options || {};
            return new Promise(function(resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.open(options.method || 'GET', url, true);
                
                if (options.headers) {
                    for (var header in options.headers) {
                        if (options.headers.hasOwnProperty(header)) {
                            xhr.setRequestHeader(header, options.headers[header]);
                        }
                    }
                }
                if (options.responseType) {
                    xhr.responseType = options.responseType;
                }

                xhr.onload = function() {
                    var responseHeaders = {};
                    var rawHeaders = xhr.getAllResponseHeaders() || '';
                    rawHeaders.trim().split(/[\r\n]+/).forEach(function(line) {
                        var parts = line.split(': ');
                        var key = parts.shift().toLowerCase();
                        if (key) responseHeaders[key] = parts.join(': ');
                    });

                    resolve({
                        ok: (xhr.status >= 200 && xhr.status < 300) || xhr.status === 0,
                        status: xhr.status,
                        statusText: xhr.statusText,
                        url: xhr.responseURL || url,
                        headers: {
                            get: function(n) { return responseHeaders[n.toLowerCase()] || null; }
                        },
                        text: function() { return Promise.resolve(xhr.responseText); },
                        json: function() {
                            try {
                                return Promise.resolve(JSON.parse(xhr.responseText));
                            } catch (e) {
                                return Promise.reject(e);
                            }
                        }
                    });
                };

                xhr.onerror = function() {
                    reject(new TypeError('Network request failed'));
                };

                xhr.ontimeout = function() {
                    reject(new TypeError('Network request timed out'));
                };

                if (options.timeout) {
                    xhr.timeout = options.timeout;
                }

                // AbortController support (used by loginView server probing)
                if (options.signal) {
                    if (options.signal.aborted) {
                        reject(new Error('AbortError'));
                        return;
                    }
                    options.signal.addEventListener('abort', function() {
                        xhr.abort();
                        var err = new Error('The operation was aborted.');
                        err.name = 'AbortError';
                        reject(err);
                    });
                }

                xhr.send(options.body || null);
            });
        };
    }

    // 6. AbortController / AbortSignal (Chromium < 66)
    if (typeof window.AbortController !== 'function') {
        var AbortSignalShim = function AbortSignal() {
            this.aborted = false;
            this.onabort = null;
            this._listeners = [];
        };
        AbortSignalShim.prototype.addEventListener = function(type, fn) {
            if (type === 'abort') { this._listeners.push(fn); }
        };
        AbortSignalShim.prototype.removeEventListener = function(type, fn) {
            if (type === 'abort') {
                this._listeners = this._listeners.filter(function(l) { return l !== fn; });
            }
        };
        var AbortControllerShim = function AbortController() {
            this.signal = new AbortSignalShim();
        };
        AbortControllerShim.prototype.abort = function() {
            var s = this.signal;
            if (s.aborted) { return; }
            s.aborted = true;
            var evt = { type: 'abort', target: s };
            if (typeof s.onabort === 'function') { s.onabort(evt); }
            s._listeners.slice().forEach(function(l) { l.call(s, evt); });
        };
        window.AbortController = AbortControllerShim;
        window.AbortSignal = AbortSignalShim;
    }

    // 7. DOM helpers: matches / closest / remove / replaceWith (Chromium < 41-54)
    var EP = window.Element && window.Element.prototype;
    if (EP) {
        if (!EP.matches) {
            EP.matches = EP.webkitMatchesSelector || EP.msMatchesSelector;
        }
        if (!EP.closest) {
            EP.closest = function(sel) {
                var el = this;
                while (el && el.nodeType === 1) {
                    if (el.matches(sel)) { return el; }
                    el = el.parentElement || el.parentNode;
                }
                return null;
            };
        }
    }
    [window.Element, window.CharacterData, window.DocumentType].forEach(function(C) {
        if (!C || !C.prototype) { return; }
        var P = C.prototype;
        if (!P.remove) {
            P.remove = function() {
                if (this.parentNode) { this.parentNode.removeChild(this); }
            };
        }
        if (!P.replaceWith) {
            P.replaceWith = function() {
                var parent = this.parentNode;
                if (!parent) { return; }
                var frag = document.createDocumentFragment();
                for (var i = 0; i < arguments.length; i++) {
                    var n = arguments[i];
                    frag.appendChild(n instanceof Node ? n : document.createTextNode(String(n)));
                }
                parent.replaceChild(frag, this);
            };
        }
    });
})();
