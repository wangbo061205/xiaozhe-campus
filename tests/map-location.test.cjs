const {test} = require('node:test')
const assert = require('node:assert/strict')
const {createTracker} = require('../miniprogram/utils/map-location')

function harness() {
  let now = 10000, listener, errorListener, tick, pending, timeout, intervalMs, reads = 0, stops = 0
  const positions = [], states = []
  const api = {
    getLocation(options) { reads++; pending = options },
    onLocationChange(fn) { listener = fn },
    offLocationChange(fn) { if (listener === fn) listener = null },
    onLocationError(fn) { errorListener=fn },
    offLocationError(fn) { if(errorListener===fn)errorListener=null },
    startLocationUpdate(options) { options.success() },
    stopLocationUpdate() { stops++ }
  }
  const clock = { now: () => now, setInterval(fn, ms) { tick = fn; intervalMs = ms; return 1 },
    clearInterval() { tick = null }, setTimeout(fn) { timeout = fn; return 2 }, clearTimeout() { timeout = null } }
  const tracker = createTracker(api,{onPosition:p=>positions.push(p),onState:(kind,message)=>states.push({kind,message})},clock)
  return {tracker,api,positions,states,get reads(){return reads},get stops(){return stops},get intervalMs(){return intervalMs},
    resolve: p => pending.success(p), reject: e => pending.fail(e), emit: p => listener && listener(p),
    sensorError: e => errorListener && errorListener(e),
    advance(ms) { now += ms; if (tick) tick() }, fireTimeout() { if (timeout) timeout() },
    get handler(){return listener},get ticking(){return Boolean(tick)} }
}

test('location reads once and samples the newest foreground position every five seconds', async () => {
  const h = harness(), first = h.tracker.start()
  h.resolve({latitude:38.49,longitude:106.1,accuracy:5}); await first
  assert.equal(h.intervalMs,5000); assert.equal(h.positions.length,1)
  h.emit({latitude:38.491,longitude:106.101}); h.emit({latitude:38.492,longitude:106.102})
  assert.equal(h.positions.length,1)
  h.advance(5000)
  assert.equal(h.positions[1].latitude,38.492)
  assert.equal(h.reads,1)
  await h.tracker.start(); assert.equal(h.reads,1)
  h.tracker.stop(); assert.equal(h.ticking,false); assert.equal(h.handler,null); assert.equal(h.stops,1)
})
test('stopping rejects late GPS and stream callbacks without resurrecting timers', async () => {
  const h = harness(), first = h.tracker.start()
  h.tracker.stop(); assert.equal(await first,null)
  h.resolve({latitude:38.49,longitude:106.1})
  assert.equal(h.positions.length,0); assert.equal(h.ticking,false)
  const second = h.tracker.start(); h.resolve({latitude:38.49,longitude:106.1}); await second
  const staleListener = h.handler; h.tracker.stop(); staleListener({latitude:0,longitude:100})
  h.advance(5000); assert.equal(h.positions.length,1)
})
test('denied or timed-out location never uses a made-up origin and can retry', async () => {
  for (const reason of ['deny','timeout']) {
    const h=harness(), first=h.tracker.start()
    if(reason==='deny')h.reject({errMsg:'getLocation:fail auth deny'});else h.fireTimeout()
    await assert.rejects(first,reason==='deny'?/未授权/:/暂不可用/)
    assert.equal(h.positions.length,0); assert.equal(h.ticking,false)
    const second=h.tracker.start();h.resolve({latitude:38.49,longitude:106.1});await second
    assert.equal(h.positions.length,1);h.tracker.stop()
  }
})
test('standing still keeps the current position, and sensor failures stop the stream', async () => {
  const h=harness(), first=h.tracker.start();h.resolve({latitude:38.49,longitude:106.1});await first
  h.emit({latitude:91,longitude:106});h.advance(21000)
  assert.equal(h.positions.length,2);assert.equal(h.positions[1].latitude,38.49)
  assert.equal(h.positions[1].acquiredAt,10000);assert.equal(h.positions[1].timestamp,31000)
  h.emit({latitude:38.491,longitude:106.101});h.advance(5000)
  assert.equal(h.positions.length,3);assert.equal(h.states.at(-1).kind,'ready')
  h.sensorError({errMsg:'gps unavailable'});assert.equal(h.states.at(-1).kind,'error');assert.equal(h.ticking,false)
  h.advance(5000);assert.equal(h.positions.length,3)
})
