const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const campus = require('../miniprogram/utils/campus')

const source = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/map/map.js'), 'utf8')
const plain = value => JSON.parse(JSON.stringify(value))
const event = dataset => ({ currentTarget: { dataset } })

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function site(id, categoryId, campusId, title = id) {
  return { id, categoryId, campus_id: campusId, title,
    point: { latitude: 38.49, longitude: 106.1 } }
}

function createPage(call = () => { throw new Error('Unexpected API call') }) {
  let page
  vm.runInNewContext(source, {
    require: key => key.endsWith('/campus') ? { ...campus, call } : require(path.join(__dirname, '../miniprogram/utils', path.basename(key))),
    Page: definition => { page = definition },
    wx: { setStorageSync() {} },
    getApp: () => ({ globalData: {} }),
    setTimeout, clearTimeout, console
  })
  page.setData = update => Object.assign(page.data, update)
  page.sheetMin = 120
  page.sheetMid = 270
  page.sheetMax = 470
  page.windowWidth = 375
  page.data = { ...page.data, loading: false, campusId: 'east',
    categories: [{ id: 'college', title: '学院', count: 1 }, { id: 'food', title: '食堂', count: 1 }] }
  page.campusSites = [site('college-place', 'college', 'east', '法学院'), site('food-place', 'food', 'east', '餐厅')]
  page.ranked = [page.campusSites[1]]
  page.filterSites()
  return page
}

test('late searches cannot replace an open category picker or the chosen category', async () => {
  for (const action of ['open', 'choose']) {
    for (const outcome of ['success', 'failure']) {
      const request = deferred()
      const page = createPage(name => {
        assert.equal(name, 'site.search')
        return request.promise
      })
      page.setData({ keyword: '旧搜索' })
      const pending = page.search()
      page.toggleCategories()
      assert.equal(page.data.categoryExpanded, true)
      assert.ok(page.data.sheetHeight >= page.sheetMid && page.data.sheetHeight <= page.sheetMax)
      if (action === 'choose') page.onCategory(event({ id: 'college' }))
      const expected = plain({ height: page.data.sheetHeight, results: page.data.results, markers: page.data.markers })
      if (outcome === 'success') request.resolve([{ id: 'stale', name: '旧搜索地点', latitude: 38.5, longitude: 106.2 }])
      else request.reject(new Error('旧搜索失败'))
      await pending
      assert.equal(page.data.categoryExpanded, action === 'open')
      assert.equal(page.data.keyword, '')
      assert.equal(page.data.searching, false)
      assert.equal(page.data.error, '')
      assert.equal(page.data.sheetHeight, expected.height)
      assert.deepEqual(plain(page.data.results), expected.results)
      assert.deepEqual(plain(page.data.markers), expected.markers)
      if (action === 'choose') {
        assert.equal(page.data.categoryId, 'college')
        assert.equal(page.data.categoryTitle, '学院')
        assert.equal(page.data.resultCount, 1)
        assert.deepEqual(Array.from(page.data.results, item => item.id), ['college-place'])
        assert.equal(page.data.markers.length, 0)
      } else {
        assert.deepEqual(Array.from(page.data.results, item => item.id), ['food-place', 'college-place'])
      }
    }
  }
})

test('category picker can reopen after closing, folding, mode changes, search, selection and hiding', () => {
  const actions = {
    close: page => page.toggleCategories(),
    drag: page => { page.setData({ sheetHeight: page.sheetMin }); page.onSheetEnd() },
    cycle: page => { page.cycleSheet(); page.cycleSheet() },
    mode: page => page.onMode(event({ mode: 'indoor' })),
    search: page => { page.onKeyword({ detail: { value: '图书馆' } }); clearTimeout(page.searchTimer) },
    selection: page => page.selectSite(page.campusSites[0]),
    hide: page => page.onHide()
  }
  for (const [name, action] of Object.entries(actions)) {
    const page = createPage()
    page.toggleCategories()
    action(page)
    assert.equal(page.data.categoryExpanded, false, name)
    if (name === 'drag' || name === 'cycle') assert.equal(page.data.sheetHeight, page.sheetMin, name)
    if (name === 'selection') assert.equal(page.data.selected.id, 'college-place')
    page.onMode(event({ mode: 'sites' }))
    page.toggleCategories()
    assert.equal(page.data.categoryExpanded, true, name)
    assert.ok(page.data.sheetHeight >= page.sheetMid && page.data.sheetHeight <= page.sheetMax, name)
    page.onCategory(event({ id: 'food' }))
    assert.equal(page.data.categoryExpanded, false, name)
    assert.equal(page.data.categoryTitle, '食堂', name)
    assert.deepEqual(Array.from(page.data.results, item => item.id), ['food-place'], name)
    page.onCategory(event({ id: '' }))
    assert.equal(page.data.categoryTitle, '', name)
    assert.deepEqual(Array.from(page.data.results, item => item.id), ['food-place', 'college-place'], name)
  }
})

test('late campus requests cannot restore another campus categories, counts or markers', async () => {
  const requests = new Map()
  const page = createPage((name, params) => {
    const key = (params.campusId || params.campus_id) + ':' + name
    const request = deferred()
    requests.set(key, request)
    return request.promise
  })
  const east = site('east-place', 'college', 'east', '东校区学院')
  const westOne = site('west-one', 'food', 'west', '西校区一食堂')
  const westTwo = site('west-two', 'food', 'west', '西校区二食堂')
  page.allSites = [east, westOne, westTwo]
  page.allCategories = [{ id: 'college', title: '学院', sites: [east] }, { id: 'food', title: '食堂', sites: [westOne, westTwo] }]
  page.setData({ campuses: [
    { id: 'east', title: '东校区', point: east.point },
    { id: 'west', title: '西校区', point: { latitude: 38.5, longitude: 106.2 } }
  ] })
  page.onCategory(event({ id: 'college' }))
  page.toggleCategories()
  const pendingEast = page.changeCampus(0)
  const pendingWest = page.changeCampus(1)
  assert.equal(page.data.categoryExpanded, false)
  assert.equal(page.data.categoryId, '')
  assert.equal(page.data.categoryTitle, '')
  // Public campus sites render before optional calibration/rank/indoor requests complete.
  assert.equal(page.data.categoryCount, 1)
  assert.equal(page.data.resultCount, 2)
  assert.deepEqual(Array.from(page.data.results, item => item.id), ['west-one', 'west-two'])
  const finish = id => {
    requests.get(id + ':campus.map-calibration').resolve({ enabled: false })
    requests.get(id + ':site.rank').resolve(id === 'west'
      ? [{ id: westTwo.id, name: westTwo.title, latitude: westTwo.point.latitude, longitude: westTwo.point.longitude }]
      : [{ id: east.id, name: east.title, latitude: east.point.latitude, longitude: east.point.longitude }])
    requests.get(id + ':space.buildings').resolve([])
    requests.get(id + ':space.summary').resolve({ buildings: [] })
  }
  finish('west')
  await pendingWest
  const expected = plain({ categories: page.data.categories, results: page.data.results, markers: page.data.markers })
  assert.deepEqual(expected.categories, [{ id: 'food', title: '食堂', count: 2 }])
  assert.equal(page.data.categoryCount, 1)
  assert.equal(page.data.resultCount, 2)
  assert.deepEqual(Array.from(page.data.results, item => item.id), ['west-two', 'west-one'])
  finish('east')
  await pendingEast
  assert.equal(page.data.campusId, 'west')
  assert.equal(page.data.categoryExpanded, false)
  assert.equal(page.data.loading, false)
  assert.deepEqual(plain(page.data.categories), expected.categories)
  assert.deepEqual(plain(page.data.results), expected.results)
  assert.deepEqual(plain(page.data.markers), expected.markers)
  page.toggleCategories()
  page.onCategory(event({ id: 'food' }))
  assert.equal(page.data.categoryTitle, '食堂')
  assert.equal(page.data.results.length, 2)
  assert.equal(page.data.markers.length, 0)
})

test('browsing stays free of pins and selecting, replacing or closing a place leaves no stale markers', async () => {
  const page = createPage(async () => { throw new Error('搜索暂不可用') })
  assert.equal(page.data.resultCount, 2)
  assert.equal(page.data.markers.length, 0)
  assert.equal(page.data.startOptions, undefined)

  page.onResult(event({ index: 0 }))
  assert.equal(page.data.selected.id, 'food-place')
  assert.equal(page.data.markers.length, 1)
  assert.equal(page.data.markers[0].callout.content, '餐厅')
  assert.equal(page.data.markers[0].latitude, page.data.selected.mapPoint.latitude)
  assert.equal(page.data.markers[0].longitude, page.data.selected.mapPoint.longitude)

  page.onResult(event({ index: 1 }))
  assert.equal(page.data.selected.id, 'college-place')
  assert.equal(page.data.markers.length, 1)
  assert.equal(page.data.markers[0].callout.content, '法学院')

  page.setData({ keyword: '图书馆' })
  const pending = page.search()
  assert.equal(page.data.selected, null)
  assert.equal(page.data.markers.length, 0)
  await pending
  assert.equal(page.data.error, '搜索暂不可用')
  assert.equal(page.data.markers.length, 0)

  page.onResult(event({ index: 1 }))
  page.selectSite({ id: 'unmapped', title: '暂无坐标地点', point: null })
  assert.equal(page.data.selected.id, 'unmapped')
  assert.equal(page.data.markers.length, 0)

  page.onResult(event({ index: 0 }))
  assert.equal(page.data.markers.length, 1)
  page.closeSelected()
  assert.equal(page.data.selected, null)
  assert.equal(page.data.markers.length, 0)
  assert.equal(page.data.resultCount, 2)
})
