// Reference: https://github.com/behnammodi/polyfill/blob/master/window.polyfill.js

export const requestIdleCallback: typeof window.requestIdleCallback =
  typeof window !== 'undefined' && window.requestIdleCallback != null
    ? window.requestIdleCallback
    : function requestIdleCallback(callback, options = {}) {
        const relaxation = 1
        const timeout = options.timeout ?? relaxation
        const start = performance.now()
        return setTimeout(() => {
          callback({
            get didTimeout() {
              return options.timeout != null
                ? false
                : performance.now() - start - relaxation > timeout
            },
            timeRemaining() {
              return Math.max(0, relaxation + (performance.now() - start))
            }
          })
        }, relaxation) as unknown as number
      }

export const cancelIdleCallback: typeof window.cancelIdleCallback =
  typeof window !== 'undefined' && window.cancelIdleCallback != null
    ? window.cancelIdleCallback
    : function cancelIdleCallback(id) {
        clearTimeout(id)
      }
