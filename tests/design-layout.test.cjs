const test = require('node:test')
const assert = require('node:assert/strict')
const { mapLayout } = require('../miniprogram/utils/design-layout')

const tokens = { navHeight: 64, mapSheetHeight: 120 }
test('map panel and navigation scale together with a safe area', () => {
  const a = mapLayout({ windowWidth: 375, windowHeight: 812 }, 88, 34, tokens)
  const b = mapLayout({ windowWidth: 430, windowHeight: 932 }, 92, 34, tokens)
  assert.equal(a.sheetMin, 120)
  assert.equal(a.tabHeight, 118)
  assert.equal(b.sheetMin, 120 * 430 / 375)
  assert.ok(b.tabHeight > a.tabHeight)
})
test('all three map panel stops stay ordered and clear of the toolbar', () => {
  for (const [width, height, top, safe] of [[320, 568, 64, 0], [375, 667, 64, 0], [430, 932, 92, 34]]) {
    for (const mapSheetHeight of [120, 190]) {
      const d = mapLayout({ windowWidth: width, windowHeight: height }, top, safe, { ...tokens, mapSheetHeight })
      assert.ok(d.sheetMin <= d.sheetMid && d.sheetMid <= d.sheetMax)
      assert.ok(height - d.tabHeight - d.sheetMax >= top + 100 * width / 375)
    }
  }
})
