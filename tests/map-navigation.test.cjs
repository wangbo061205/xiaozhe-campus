const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const campus = require('../miniprogram/utils/campus')
const source = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/map/map.js'), 'utf8')

function create(overrides = {}) {
  let page
  const opened = [], copied = [], fits = []
  const api = { getStorageSync() { return '' }, setStorageSync() {},
    openLocation(options) { opened.push(options); options.success() },
    setClipboardData(options) { copied.push(options); options.success() }, ...overrides }
  const wx = new Proxy(api, { get(target, key) {
    if (key in target) return target[key]
    throw new Error('Unexpected WeChat API: ' + String(key))
  } })
  vm.runInNewContext(source, {
    Page: definition => { page = definition },
    require: key => key.endsWith('/campus') ? { ...campus, call() { throw new Error('Departure must not call backend') } } :
      require(path.join(__dirname, '../miniprogram/utils', path.basename(key))),
    wx, getApp: () => ({ globalData: {} }), setTimeout, clearTimeout, console
  })
  page.setData = update => Object.assign(page.data, update)
  page.pageVisible = true
  page.sheetMin = 120; page.sheetMid = 270; page.sheetMax = 470; page.windowWidth = 375
  const destination = { id: 'library', title: '图书馆', campus_id: 'east', point: { latitude: 38.493, longitude: 106.104 } }
  page.setData({ campuses: [{ id: 'east', title: '东校区', point: destination.point }],
    campusId: 'east', campusName: '东校区', mapReady: true, loading: false })
  page.allSites = [destination]; page.campusSites = page.allSites.slice(); page.allCategories = []
  page.campusBoundary = [{ latitude: 38.48, longitude: 106.09 }, { latitude: 38.5, longitude: 106.12 }]
  page.map = { includePoints: options => fits.push(options) }
  page.selectSite(destination)
  return { page, destination, opened, copied, fits }
}

test('selecting a destination never opens navigation until a departure tap', async () => {
  const h = create()
  assert.equal(h.opened.length, 0)
  assert.equal(h.page.data.markers.length, 1)
  assert.equal(h.page.data.origin, undefined)
  assert.equal(await h.page.depart(), true)
  assert.equal(h.opened.length, 1)
  const options = h.opened[0]
  assert.equal(options.latitude, h.destination.point.latitude)
  assert.equal(options.longitude, h.destination.point.longitude)
  assert.equal(options.name, '图书馆')
  assert.match(options.address, /北方民族大学.*东校区/)
  assert.equal(h.page.data.navigationLoading, false)
  assert.match(h.page.data.navigationNotice, /导航.*地图应用/)
  assert.deepEqual(Object.keys(options).sort(), ['address', 'fail', 'latitude', 'longitude', 'name', 'scale', 'success'])
})
test('saved points can hand off offline without a route request or guest session', async () => {
  const h = create(); h.page.setData({ offlineData: true })
  assert.equal(await h.page.depart(), true)
  assert.equal(h.opened.length, 1)
})
test('map handoff and pins use matching GCJ-02 campus calibration and site overrides', async () => {
  for (const calibration of [
    { enabled: true, deltaLat: .0001, deltaLng: -.0002 },
    { enabled: true, siteOverrides: { library: { latitude: 38.494, longitude: 106.105 } } }
  ]) {
    const h = create(); h.page.calibration = calibration; h.page.refreshMarkers()
    await h.page.depart()
    assert.equal(h.opened[0].latitude, h.page.data.markers[0].latitude)
    assert.equal(h.opened[0].longitude, h.page.data.markers[0].longitude)
  }
})
test('duplicate departure taps share a native-map opening and recover after failure', async () => {
  let opening, count = 0
  const h = create({ openLocation(options) { count++; opening = options } })
  const first = h.page.depart()
  assert.equal(await h.page.depart(), false)
  assert.equal(count, 1); assert.equal(h.page.data.navigationLoading, true)
  opening.fail({ errMsg: 'openLocation:fail unavailable' })
  assert.equal(await first, false)
  assert.match(h.page.data.navigationError, /复制地点/)
  const retry = h.page.depart(); opening.success()
  assert.equal(await retry, true); assert.equal(count, 2)
  assert.equal(h.page.data.navigationError, '')
})
test('cancelled navigation keeps the destination without an error alert', async () => {
  const h = create({ openLocation(options) { options.fail({ errMsg: 'openLocation:fail cancel' }) } })
  assert.equal(await h.page.depart(), false)
  assert.equal(h.page.data.selected.id, 'library')
  assert.equal(h.page.data.navigationLoading, false)
  assert.equal(h.page.data.navigationError, '')
})
test('missing native API or a synchronous failure offers a usable copy fallback', async () => {
  for (const openLocation of [undefined, () => { throw new Error('Native API unavailable') }]) {
    const h = create({ openLocation })
    assert.equal(await h.page.depart(), false)
    assert.equal(h.page.data.navigationLoading, false)
    assert.match(h.page.data.navigationError, /复制地点/)
    h.page.copyDestination()
    assert.match(h.copied[0].data, /北方民族大学.*图书馆.*38.493000,106.104000/)
    assert.match(h.page.data.navigationNotice, /地点已复制/)
  }
})
test('a changed destination, closing, switching campus or hiding rejects late native-map callbacks', async () => {
  for (const action of ['destination', 'close', 'campus', 'hide', 'unload']) {
    let opening
    const h = create({ openLocation(options) { opening = options } })
    const pending = h.page.depart()
    if (action === 'destination') h.page.selectSite({ id: 'food', title: '食堂', point: { latitude: 38.495, longitude: 106.105 } })
    if (action === 'close') h.page.closeSelected()
    if (action === 'campus') await h.page.changeCampus(0, true)
    if (action === 'hide') h.page.onHide()
    if (action === 'unload') h.page.onUnload()
    opening.fail({ errMsg: 'late failure' }); await pending
    assert.equal(h.page.data.navigationLoading, false, action)
    assert.equal(h.page.data.navigationError, '', action)
    assert.equal(h.page.data.navigationNotice, '', action)
  }
})
test('returning from a native map preserves the selection and permits another departure', async () => {
  const h = create({ openLocation(options) { h.opened.push(options); h.page.onHide(); options.success() } })
  await h.page.depart()
  assert.equal(h.page.data.selected.id, 'library')
  assert.equal(h.page.data.navigationLoading, false)
  h.page.onShow(); await h.page.depart()
  assert.equal(h.opened.length, 2)
})
test('invalid destination coordinates cannot open another app', async () => {
  const h = create()
  for (const point of [null, { latitude: 91, longitude: 106 }, { latitude: 38, longitude: 181 }, { latitude: 0, longitude: 0 }]) {
    h.page.selectSite({ id: 'unmapped', title: '未知地点', point })
    assert.equal(await h.page.depart(), false)
    assert.match(h.page.data.navigationError, /导航坐标/)
    assert.equal(h.page.data.markers.length, 0)
  }
  assert.equal(h.opened.length, 0)
})
test('clipboard failures and late callbacks never overwrite a different destination', () => {
  let pending
  const h = create({ setClipboardData(options) { pending = options } })
  h.page.copyDestination(); pending.fail()
  assert.match(h.page.data.navigationError, /未能复制/)
  h.page.copyDestination()
  h.page.selectSite({ id: 'food', title: '食堂', point: { latitude: 38.495, longitude: 106.105 } })
  pending.success()
  assert.equal(h.page.data.navigationError, '')
  assert.equal(h.page.data.navigationNotice, '')
})
test('map overview retains the campus boundary and the selected destination only', () => {
  const h = create(), points = h.fits.at(-1).points
  for (const point of [...h.page.campusBoundary, h.destination.point])
    assert.ok(points.some(p => p.latitude === point.latitude && p.longitude === point.longitude))
  assert.equal(points.length, 3)
})
