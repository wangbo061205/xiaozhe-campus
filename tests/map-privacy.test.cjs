const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.join(__dirname, '../miniprogram')

test('the distributable mini program declares no private location capabilities', () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  assert.equal(app.permission && app.permission['scope.userLocation'], undefined)
  assert.ok(!app.requiredBackgroundModes || !app.requiredBackgroundModes.includes('location'))
  assert.ok(!app.requiredPrivateInfos || !app.requiredPrivateInfos.length)
  const blocked = /\b(?:getLocation|getFuzzyLocation|chooseLocation|choosePoi|chooseAddress|startLocationUpdate(?:Background)?|onLocationChange|onLocationChangeError|offLocationChange|stopLocationUpdate|moveToLocation)\b/
  function scan(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name)
      if (entry.isDirectory()) scan(file)
      else if (/\.(?:js|json|wxml)$/.test(entry.name)) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), blocked, path.relative(root, file))
    }
  }
  scan(root)
})

test('the map disables device location and offers destination-only navigation', () => {
  const template = fs.readFileSync(path.join(root, 'pages/map/map.wxml'), 'utf8')
  assert.match(template, /show-location="\{\{false\}\}"/)
  assert.match(template, /bindtap="depart"/)
  assert.doesNotMatch(template, /当前位置|实时定位|位置设置|onLocate|origin|onMapLongPress|polyline/)
})
