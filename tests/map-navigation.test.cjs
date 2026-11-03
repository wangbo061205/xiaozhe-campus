const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const campus = require('../miniprogram/utils/campus')
const geo = require('../miniprogram/utils/map-geo')
const source = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/map/map.js'), 'utf8')
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const route = { points: [[106.1, 38.49], [106.102, 38.492], [106.104, 38.493]], routeDistance: 600, estimatedTime: 8 }
function create(call = async () => route) {
  let page
  const storage = { getStorageSync() { return '' }, setStorageSync() {} }
  const wx = new Proxy(storage, { get(target, key) {
    if (key in target) return target[key]
    throw new Error('Unexpected WeChat API: ' + String(key))
  } })
  vm.runInNewContext(source, {
    Page: definition => { page = definition },
    require: key => key.endsWith('/campus') ? { ...campus, call } :
      require(path.join(__dirname, '../miniprogram/utils', path.basename(key))),
    wx, getApp: () => ({ globalData: {} }), setTimeout, clearTimeout, console
  })
  page.setData = update => Object.assign(page.data, update)
  page.pageVisible = true
  page.sheetMin = 120; page.sheetMid = 270; page.sheetMax = 470; page.windowWidth = 375
  page.setData({ campuses: [{ id: 'east', title: '东校区', point: { latitude: 38.49, longitude: 106.1 } }],
    campusId: 'east', mapReady: true, loading: false })
  page.campusBoundary = [{ latitude: 38.48, longitude: 106.09 }, { latitude: 38.5, longitude: 106.12 }]
  const start = { id: 'gate', title: '东门', campus_id: 'east', point: { latitude: 38.49, longitude: 106.1 } }
  const destination = { id: 'library', title: '图书馆', campus_id: 'east', point: { latitude: 38.493, longitude: 106.104 } }
  page.allSites = [start, destination]; page.campusSites = page.allSites.slice(); page.allCategories = []
  page.updateOriginOptions()
  const fits = []; page.map = { includePoints: options => fits.push(options) }
  page.selectSite(destination)
  return { page, fits, start, destination }
}
const chooseOrigin = (h, index = 0) => h.page.onOriginChange({ detail: { value: String(index) } })

test('destination selection never guesses an origin or requests device location', async () => {
  let requests = 0
  const h = create(async () => { requests++; return route })
  assert.equal(h.page.data.origin, null); assert.equal(h.page.data.originIndex, -1)
  assert.equal(h.page.data.markers.length, 1)
  await h.page.depart()
  assert.equal(requests, 0); assert.match(h.page.data.routeError, /先选择出发地点/)
  chooseOrigin(h)
  assert.equal(h.page.data.routeError, ''); assert.equal(h.page.data.origin.title, '东门')
  assert.equal(h.page.data.markers.length, 2)
})
test('departure uses the selected origin and fits the whole campus, endpoints and route', async () => {
  const calls = [], h = create(async (key, args) => { calls.push({ key, args }); return route })
  chooseOrigin(h); await h.page.depart()
  assert.equal(calls.length, 1); assert.equal(calls[0].key, 'road.plan')
  assert.equal(calls[0].args.start_lat, h.start.point.latitude)
  assert.equal(calls[0].args.end_lng, h.destination.point.longitude)
  assert.equal(h.page.data.route.distance, '600 米')
  const points = h.fits.at(-1).points
  for (const point of [...h.page.campusBoundary, h.start.point, h.destination.point, ...h.page.data.polyline[0].points])
    assert.ok(points.some(p => p.latitude === point.latitude && p.longitude === point.longitude))
  assert.equal(h.page.data.scale, 16)
})
test('saved origins retain raw coordinates while pins use site and campus calibration', async () => {
  let planned
  const h = create(async (key, args) => { planned = args; return route })
  h.page.calibration = { enabled: true, deltaLat: .0001, deltaLng: -.0002,
    siteOverrides: { gate: { latitude: 38.4903, longitude: 106.1004 } } }
  h.page.selectSite(h.destination); chooseOrigin(h); await h.page.depart()
  assert.equal(planned.start_lat, h.start.point.latitude); assert.equal(planned.start_lng, h.start.point.longitude)
  assert.equal(planned.end_lat, h.destination.point.latitude)
  assert.equal(h.page.data.origin.mapPoint.latitude, 38.4903)
  assert.equal(h.page.data.selected.mapPoint.latitude, h.destination.point.latitude + .0001)
})
test('long press reverses display calibration before road planning', async () => {
  let planned
  const h = create(async (key, args) => { planned = args; return route })
  h.page.calibration = { enabled: true, deltaLat: .0001, deltaLng: -.0002 }
  const displayPoint = { latitude: 38.4901, longitude: 106.0998 }
  h.page.onMapLongPress({ detail: displayPoint })
  assert.equal(h.page.data.originIndex, -1); assert.equal(h.page.data.origin.id, '')
  assert.ok(geo.distance(h.page.data.origin.point, h.start.point) < .001)
  assert.equal(h.page.data.origin.mapPoint.latitude, displayPoint.latitude)
  await h.page.depart()
  assert.ok(Math.abs(planned.start_lat - h.start.point.latitude) < 1e-8)
  assert.ok(Math.abs(planned.start_lng - h.start.point.longitude) < 1e-8)
})
test('invalid manual coordinates and picker values cannot replace a valid origin', () => {
  const h = create(); chooseOrigin(h)
  const original = JSON.stringify(h.page.data.origin)
  for (const detail of [{ latitude: 91, longitude: 106 }, {}, { latitude: 'bad', longitude: 106 }]) h.page.onMapLongPress({ detail })
  for (const value of [-1, 50, 0.5, 'bad']) h.page.onOriginChange({ detail: { value } })
  assert.equal(JSON.stringify(h.page.data.origin), original)
  h.page.onHide(); h.page.onMapLongPress({ detail: { latitude: 38.491, longitude: 106.102 } })
  assert.equal(JSON.stringify(h.page.data.origin), original)
  h.page.pageVisible = true; h.page.closeSelected()
  h.page.onMapLongPress({ detail: { latitude: 38.492, longitude: 106.102 } })
  assert.equal(JSON.stringify(h.page.data.origin), original)
})
test('duplicate departure taps share one road request', async () => {
  const request = deferred(); let calls = 0
  const h = create(() => { calls++; return request.promise }); chooseOrigin(h)
  const first = h.page.depart(); await h.page.depart()
  assert.equal(calls, 1); assert.equal(h.page.data.routeLoading, true)
  request.resolve(route); await first
  assert.equal(h.page.data.routeLoading, false)
})
test('origin and destination changes, closing, hiding and campus switches reject late routes', async () => {
  for (const action of ['origin', 'destination', 'close', 'hide', 'campus']) {
    const pending = deferred(), h = create(() => pending.promise); chooseOrigin(h)
    const first = h.page.depart()
    if (action === 'origin') h.page.onMapLongPress({ detail: { latitude: 38.491, longitude: 106.101 } })
    if (action === 'destination') h.page.selectSite({ id: 'food', title: '食堂', point: { latitude: 38.495, longitude: 106.105 } })
    if (action === 'close') h.page.closeSelected()
    if (action === 'hide') h.page.onHide()
    if (action === 'campus') await h.page.changeCampus(0, true)
    pending.resolve(route); await first
    assert.equal(h.page.data.route, null, action); assert.equal(h.page.data.polyline.length, 0, action)
    assert.equal(h.page.data.routeLoading, false, action)
  }
})
test('changing the origin aborts its route request without exposing the cancellation as an error', async () => {
  const request = deferred(); let aborts = 0
  request.promise.abort = () => { aborts++; request.reject(new Error('request aborted')) }
  const h = create(() => request.promise); chooseOrigin(h)
  const first = h.page.depart()
  h.page.onMapLongPress({ detail: { latitude: 38.491, longitude: 106.102 } }); await first
  assert.equal(aborts, 1); assert.equal(h.page.data.routeError, ''); assert.equal(h.page.data.route, null)
})
test('a later request stays active when an aborted request completes', async () => {
  const old = deferred(), current = deferred(); let calls = 0
  const h = create(() => ++calls === 1 ? old.promise : current.promise); chooseOrigin(h)
  const first = h.page.depart()
  h.page.onMapLongPress({ detail: { latitude: 38.491, longitude: 106.102 } })
  const second = h.page.depart(); old.reject(new Error('old request failed')); await first
  assert.equal(h.page.data.routeLoading, true); assert.equal(h.page.data.routeError, '')
  current.resolve(route); await second
  assert.equal(h.page.data.route.distance, '600 米')
})
test('network failures preserve both endpoints for a retry without opening other maps', async () => {
  for (const message of ['路网无法连通', '校园服务响应超时']) {
    let online = false
    const h = create(async () => { if (!online) throw new Error(message); return route }); chooseOrigin(h)
    h.page.setData({ offlineData: true }); await h.page.depart()
    assert.equal(h.page.data.selected.id, 'library'); assert.equal(h.page.data.origin.id, 'gate')
    assert.equal(h.page.data.routeLoading, false); assert.equal(h.page.data.polyline.length, 0)
    assert.match(h.page.data.routeError, message.includes('路网') ? /请更换起点/ : /稍后.*重试/)
    online = true; await h.page.depart()
    assert.equal(h.page.data.routeError, ''); assert.equal(h.page.data.route.distance, '600 米')
  }
})
test('coincident endpoints show a reference status without claiming GPS arrival', async () => {
  const h = create(async () => { throw new Error('should not request a road') }); chooseOrigin(h, 1)
  await h.page.depart()
  assert.equal(h.page.data.route.distance, '起点与目的地在同一位置'); assert.equal(h.page.data.polyline.length, 0)
})
test('changing campuses clears the origin and offers only sites with valid coordinates', async () => {
  const h = create(); chooseOrigin(h)
  const west = { id: 'west-gate', title: '西门', campus_id: 'west', point: { latitude: 38.49, longitude: 106.09 } }
  h.page.allSites.push(west, { id: 'no-point', title: '未标注', campus_id: 'west', point: null })
  h.page.data.campuses.push({ id: 'west', title: '西校区', point: west.point })
  await h.page.changeCampus(1, true)
  assert.equal(h.page.data.origin, null); assert.equal(h.page.data.originIndex, -1)
  assert.deepEqual(Array.from(h.page.data.originOptions, item => item.id), ['west-gate'])
  assert.equal(h.page.data.markers.length, 0)
})
test('removing a saved origin from refreshed data invalidates the old route', async () => {
  const h = create(); chooseOrigin(h); await h.page.depart()
  h.page.campusSites = [h.destination]; h.page.updateOriginOptions(); h.page.refreshMarkers()
  assert.equal(h.page.data.origin, null); assert.equal(h.page.data.route, null); assert.equal(h.page.data.markers.length, 1)
})
