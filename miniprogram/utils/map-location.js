// Foreground-only location updates. Sample WeChat's location stream every five seconds
// instead of repeatedly requesting the permission-bound getLocation API.
function createTracker(api, handlers, clock) {
  const timers = clock || { setInterval, clearInterval, setTimeout, clearTimeout, now: Date.now }
  let active = false, version = 0, interval = null, timeout = null
  let listener = null, errorListener = null, initial = null, settle = null, latest = null, streamStarted = false
  const state = (kind, message) => { if (handlers.onState) handlers.onState(kind, message || '') }
  const valid = p => p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) &&
    Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180 && (p.latitude !== 0 || p.longitude !== 0)
  const position = p => ({ latitude: p.latitude, longitude: p.longitude,
    accuracy: Number.isFinite(p.accuracy) ? p.accuracy : null, timestamp: timers.now() })
  const message = error => /auth|deny|denied|privacy/i.test(error && error.errMsg || '')
    ? '定位未授权，请点击定位图标开启位置权限'
    : '当前位置暂不可用，请到开阔处后重试'

  function stop() {
    active = false; version++
    if (interval !== null) timers.clearInterval(interval)
    if (timeout !== null) timers.clearTimeout(timeout)
    interval = timeout = null
    if (listener && api.offLocationChange) api.offLocationChange(listener)
    if (errorListener && api.offLocationError) api.offLocationError(errorListener)
    listener = null
    errorListener = null
    if (streamStarted && api.stopLocationUpdate) api.stopLocationUpdate({ fail() {} })
    streamStarted = false
    if (settle) settle(null)
    settle = null; initial = null; latest = null
  }
  function start() {
    if (active) return initial || Promise.resolve(latest)
    if (!api.getLocation) return Promise.reject(new Error('当前微信版本不支持定位，请升级后重试'))
    active = true
    const current = ++version
    state('locating', '正在获取当前位置')
    initial = new Promise((resolve, reject) => {
      settle = resolve
      const fail = error => {
        if (!active || current !== version) return
        const text = message(error)
        state('error', text); settle = null; stop(); reject(new Error(text))
      }
      timeout = timers.setTimeout(() => fail({ errMsg: 'location timeout' }), 12000)
      api.getLocation({ type: 'gcj02', isHighAccuracy: true, highAccuracyExpireTime: 8000,
        success(result) {
          if (!active || current !== version) return
          if (!valid(result)) { fail({ errMsg: 'invalid location' }); return }
          timers.clearTimeout(timeout); timeout = null
          latest = position(result); handlers.onPosition(latest); state('ready')
          settle = null; resolve(latest)
          if (!api.startLocationUpdate || !api.onLocationChange) {
            state('error', '当前微信版本不支持实时定位，请升级后重试'); stop(); return
          }
          listener = result => {
            if (active && current === version && valid(result)) latest = position(result)
          }
          api.onLocationChange(listener)
          errorListener = error => {
            if (active && current === version) { state('error', message(error)); stop() }
          }
          if (api.onLocationError) api.onLocationError(errorListener)
          streamStarted = true
          api.startLocationUpdate({ type: 'gcj02',
            success() {
              if (!active || current !== version) return
              interval = timers.setInterval(() => {
                if (!active || current !== version || !latest) return
                // No change event is required when the user stands still. Sample the
                // last position from the active stream; sensor failures have their own event.
                handlers.onPosition(Object.assign({}, latest, { acquiredAt: latest.timestamp, timestamp: timers.now() })); state('ready')
              }, 5000)
            },
            fail(error) { if (active && current === version) { state('error', message(error)); stop() } }
          })
        }, fail
      })
    })
    return initial
  }
  return { start, stop }
}
module.exports = { createTracker }
