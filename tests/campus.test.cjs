const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const campus = require('../miniprogram/utils/campus')
const geo = require('../miniprogram/utils/map-geo')

test('normalizes real campus, food and paginated API responses', () => {
  assert.equal(campus.list({ data: { records: [{ id: 'a' }] } })[0].id, 'a')
  assert.equal(campus.list({ list: [] }).length, 0)
  const site = campus.normalize({ _id: 'library', name: '图书馆', desc: '<p>自习区域</p>',
    latitude: 38.497, longitude: 106.107, img: '/uploads/library.jpg', createdAt: 1792500000000 })
  assert.equal(site.id, 'library')
  assert.equal(site.description, '自习区域')
  assert.equal(site.cover, 'https://xyadmin.tehii.top/uploads/library.jpg')
  assert.equal(site.point.latitude, 38.497)
  assert.match(site.dateText, /^2026-10-/)
  assert.equal(campus.normalize({ dishName: '麻酱干拌', price: 0 }).priceText, '0')
  assert.equal(campus.normalize({ clubName: '虚拟现实团队', title: '2026届招新' }).title, '虚拟现实团队')
})

test('invalid coordinates never become campus markers', () => {
  for (const input of [{}, { latitude: 91, longitude: 106 }, { latitude: 0, longitude: 0 },
    { latitude: 'invalid', longitude: 106 }, { latitude: 38, longitude: Infinity }]) {
    assert.equal(campus.point(input), null)
  }
  assert.deepEqual(geo.routePoints([{ lat: 38, lng: 106 }, [106.1, 38.1], {}, [0, 0]]),
    [{ latitude: 38, longitude: 106 }, { latitude: 38.1, longitude: 106.1 }])
  assert.deepEqual(geo.routePoints(null), [])
})

test('map calibration does not change raw GPS before road planning', () => {
  const original = { latitude: 38.497, longitude: 106.107 }
  const calibration = { enabled: true, deltaLat: 0.0001, deltaLng: -0.0002, siteOverrides: {} }
  const displayed = geo.calibrated(original, calibration, 'library')
  assert.equal(displayed.latitude, original.latitude + .0001)
  assert.ok(geo.distance(geo.originalLocation(displayed, calibration), original) < .001)
  assert.deepEqual(geo.calibrated(original, { enabled: false, deltaLat: 1 }), original)
  assert.equal(geo.distance(original, original), 0)
})

test('client does not publish service credentials or unsafe image protocols', () => {
  assert.equal(campus.imageUrl('javascript:alert(1)'), '')
  assert.equal(campus.imageUrl('cloud://private-file'), '')
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory()
    ? walk(path.join(dir, item.name)) : [path.join(dir, item.name)])
  for (const file of walk(path.resolve('miniprogram')).filter(file => /\.(js|json|wxml|wxss)$/.test(file))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /sk_[a-f0-9]{40,}/i, file)
  }
})

test('late map search cannot overwrite results from another campus', async () => {
  let resolveSearch
  let page
  const sandbox = { require: key => key.endsWith('campus') ? { ...campus, call: () => new Promise(resolve => { resolveSearch = resolve }) } : geo,
    Page: definition => { page = definition }, getApp: () => ({ globalData: {} }), wx: {}, console, setTimeout, clearTimeout }
  vm.runInNewContext(fs.readFileSync(path.resolve('miniprogram/pages/map/map.js'), 'utf8'), sandbox)
  page.data = { ...page.data, keyword: '图书馆', campusId: 'east', mode: 'sites', results: [{ id: 'current' }] }
  page.setData = update => Object.assign(page.data, update)
  const pending = page.search()
  page.data.campusId = 'west'
  resolveSearch([{ id: 'stale-east', name: '图书馆', latitude: 38.4, longitude: 106.1 }])
  await pending
  assert.equal(page.data.results[0].id, 'current')
})

test('pending map search cannot overwrite a category or selected place', async () => {
  for (const action of ['category', 'selection', 'keyword']) {
    let resolveSearch
    let page
    const sandbox = { require: key => key.endsWith('campus') ? { ...campus, call: () => new Promise(resolve => { resolveSearch = resolve }) } : geo,
      Page: definition => { page = definition }, getApp: () => ({ globalData: {} }), wx: {}, console, setTimeout, clearTimeout }
    vm.runInNewContext(fs.readFileSync(path.resolve('miniprogram/pages/map/map.js'), 'utf8'), sandbox)
    page.data = { ...page.data, keyword: '图书馆', campusId: 'east', results: [{ id: 'current' }] }
    page.campusSites = [{ id: 'category-site', categoryId: 'food', title: '食堂', point: null }]
    page.setData = update => Object.assign(page.data, update)
    const pending = page.search()
    if (action === 'category') page.onCategory({ currentTarget: { dataset: { id: 'food' } } })
    else if (action === 'selection') page.selectSite({ id: 'selected', title: '所选地点', point: null })
    else page.onKeyword({ detail: { value: '新关键词' } })
    clearTimeout(page.searchTimer)
    resolveSearch([{ id: 'stale', name: '旧搜索结果', latitude: 38.4, longitude: 106.1 }])
    await pending
    assert.notEqual(page.data.results[0].id, 'stale', action)
    if (action === 'selection') assert.equal(page.data.selected.id, 'selected')
    assert.equal(page.data.searching, false)
  }
})
