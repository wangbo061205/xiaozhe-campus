const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const campus = require('../miniprogram/utils/campus')

const source = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/map/map.js'), 'utf8')
const campusResponse = [{ id: 'east', title: '东校区', latitude: 38.49, longitude: 106.1 }]
const categoryResponse = [{ id: 'college', title: '学院', list: [
  { id: 'college-place', title: '法学院', campus_id: 'east', latitude: 38.491, longitude: 106.101 }
] }]

function response(name) {
  if (name === 'campus.list') return campusResponse
  if (name === 'category.with-sites') return categoryResponse
  if (name === 'campus.map-calibration') return { enabled: false }
  if (name === 'space.summary') return { buildings: [] }
  return []
}

function createPage(call, savedMap = null) {
  let page
  vm.runInNewContext(source, {
    require: key => key.endsWith('/map-cache') ? { read: () => savedMap, write() {} } : key.endsWith('/campus') ? { ...campus, call } :
      require(path.join(__dirname, '../miniprogram/utils', path.basename(key))),
    Page: definition => { page = definition },
    wx: { getStorageSync() { return '' }, setStorageSync() {} },
    getApp: () => ({ globalData: {} }),
    setTimeout, clearTimeout, console
  })
  page.updates = []
  page.setData = update => { page.updates.push(update); Object.assign(page.data, update) }
  page.sheetMin = 120
  page.sheetMid = 270
  page.sheetMax = 470
  page.setData({ loading: false, sheetHeight: page.sheetMin })
  return page
}

test('initial map connection failure exposes retry and category actions preserve the error', async () => {
  const page = createPage(async name => {
    if (name === 'campus.list') throw new Error('无法连接校园服务')
    return response(name)
  })
  page.setData({ categoryExpanded: true })
  await page.load()
  assert.equal(page.data.loading, false)
  assert.equal(page.loadInFlight, false)
  assert.equal(page.data.mapReady, false)
  assert.equal(page.data.latitude, 0)
  assert.equal(page.data.longitude, 0)
  assert.equal(page.data.error, '无法连接校园服务')
  assert.equal(page.data.categoryExpanded, false)
  assert.equal(page.data.sheetHeight, page.sheetMid)
  assert.equal(page.data.sheetLevel, 1)
  page.onCategory({ currentTarget: { dataset: { id: '' } } })
  page.toggleCategories()
  assert.equal(page.data.error, '无法连接校园服务')
  assert.equal(page.data.categoryExpanded, false)
})

test('saved verified campuses remain searchable when the backend is unavailable', async () => {
  const page = createPage(async () => { throw new Error('无法连接校园服务') }, {
    campuses: campusResponse, categories: categoryResponse, calibrations: {}
  })
  await page.load()
  assert.equal(page.data.mapReady, true)
  assert.equal(page.data.offlineData, true)
  assert.equal(page.data.loading, false)
  assert.equal(page.data.error, '')
  assert.match(page.data.warning, /已保存/)
  assert.equal(page.data.resultCount, 1)
  page.setData({ keyword: '法学' })
  await page.search()
  assert.equal(page.data.results[0].title, '法学院')
  page.onResult({ currentTarget: { dataset: { index: 0 } } })
  assert.equal(page.data.selected.title, '法学院')
})

test('retry after the backend recovers creates the real campus map and clears the failure', async () => {
  let online = false
  const page = createPage(async name => {
    if (!online) throw new Error('无法连接校园服务')
    return response(name)
  })
  await page.load()
  assert.ok(page.data.error)
  online = true
  const pending = page.load()
  assert.equal(page.data.loading, true)
  assert.equal(page.data.error, '')
  await pending
  assert.equal(page.data.loading, false)
  assert.equal(page.loadInFlight, false)
  assert.equal(page.data.mapReady, true)
  assert.equal(page.data.campusId, 'east')
  assert.equal(page.data.latitude, 38.49)
  assert.equal(page.data.longitude, 106.1)
  assert.equal(page.data.categoryCount, 1)
  assert.equal(page.data.resultCount, 1)
  assert.equal(page.data.markers.length, 0)
  assert.equal(page.data.error, '')
})

test('returning to an offline map reconnects and clears the old warning while keeping the destination', async () => {
  let online = false
  const page = createPage(async name => {
    if (!online) throw new Error('无法连接校园服务')
    return response(name)
  }, { campuses: campusResponse, categories: categoryResponse, calibrations: {} })
  await page.load()
  page.onResult({ currentTarget: { dataset: { index: 0 } } })
  const destination = page.data.selected.id
  assert.equal(page.data.offlineData, true)
  assert.ok(page.data.warning)
  online = true
  await page.onShow()
  assert.equal(page.data.offlineData, false)
  assert.equal(page.data.warning, '')
  assert.equal(page.data.error, '')
  assert.equal(page.data.selected.id, destination)
  assert.equal(page.data.origin, null)
})

test('repeated onShow and retry clicks share one in-flight map load', async () => {
  let releaseCampus
  const calls = []
  const page = createPage(name => {
    calls.push(name)
    return name === 'campus.list' ? new Promise(resolve => { releaseCampus = resolve }) : Promise.resolve(response(name))
  })
  page.setData({ error: '无法连接校园服务' })
  const pending = page.onShow()
  page.onShow()
  page.onShow()
  await page.load()
  assert.equal(page.data.loading, true)
  assert.equal(calls.filter(name => name === 'campus.list').length, 1)
  assert.equal(calls.filter(name => name === 'category.with-sites').length, 1)
  releaseCampus(campusResponse)
  await pending
  assert.equal(page.data.mapReady, true)
  assert.equal(page.data.loading, false)
  assert.equal(page.loadInFlight, false)
  page.onShow()
  assert.equal(calls.filter(name => name === 'campus.list').length, 1)
})
