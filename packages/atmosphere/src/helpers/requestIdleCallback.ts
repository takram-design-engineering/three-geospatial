// Reference: https://github.com/behnammodi/polyfill/blob/master/window.polyfill.js

export const requestIdleCallback: typeof window.requestIdleCallback =
  window.requestIdleCallback ??
  function requestIdleCallback(callback, options = {}) {
    const relaxation = 1
    const timeout = options.timeout ?? relaxation
    const start = performance.now()
    return setTimeout(function () {
      callback({
        get didTimeout() {
          return options.timeout != null
            ? false
            : performance.now() - start - relaxation > timeout
        },
        timeRemaining: function () {
          return Math.max(0, relaxation + (performance.now() - start))
        }
      })
    }, relaxation) as unknown as number
  }

export const cancelIdleCallback: typeof window.cancelIdleCallback =
  window.cancelIdleCallback ??
  function cancelIdleCallback(id) {
    clearTimeout(id)
  }
