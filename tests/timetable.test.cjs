const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const table = require('../miniprogram/utils/timetable')
const now = new Date(2026, 9, 31, 12)
const row = { id: 1, name: '大学物理II', weekday: 2, startSect: 1, endSect: 2, weeks: '1-16(单)' }
test('reference times and October week crossing are exact', () => {
  assert.deepEqual(table.TIMES.slice(0, 8), [['08:00','08:45'],['08:55','09:40'],['10:10','10:55'],['11:05','11:50'],['14:00','14:45'],['14:55','15:40'],['16:10','16:55'],['17:05','17:50']])
  const data = table.build([row], 0, '2026-08-31', now, false)
  assert.equal(data.week, 9)
  assert.deepEqual(data.days.map(d => d.key), ['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01'])
  assert.equal(data.columns[1].items.length, 1)
  assert.equal(table.build([row], 1, '2026-08-31', now, false).columns[1].items.length, 0)
  assert.equal(table.build([row], 1, '2026-08-31', now, true).columns[1].items[0].inactive, true)
})
test('overlapping courses remain visible and bad weeks do not silently pass', () => {
  const data = table.build([row, { ...row, id: 2, startSect: 2, endSect: 3 }], 0, '2026-08-31', now, false)
  assert.equal(data.columns[1].items.length, 2)
  assert.equal(data.columns[1].items[0].width, '47%')
  assert.notEqual(data.columns[1].items[0].left, data.columns[1].items[1].left)
  assert.match(table.validate({ ...row, weeks: '1,随便' }), /周次/)
  assert.match(table.validate({ ...row, startSect: 4, endSect: 2 }), /节次/)
})
function pageWith(api) {
  let page
  vm.runInNewContext(fs.readFileSync('miniprogram/pages/courses/courses.js','utf8'), {
    Page: value => { page = value }, require: name => name.endsWith('/api') ? api : name.endsWith('/campus') ? { errorText: e => e.message } : table,
    getApp: () => ({ glassClass: () => '' }), wx: { showToast() {} },
  })
  page.data = structuredClone(page.data)
  page.setData = update => { for (const [key, value] of Object.entries(update)) { const parts = key.split('.'); let target = page.data; for (const p of parts.slice(0,-1)) target = target[p]; target[parts.at(-1)] = value } }
  page.alive = true
  return page
}
test('preview edits stay local; only confirmation posts and a failed save preserves preview', async () => {
  const calls = []
  const page = pageWith({ post: async (...args) => { calls.push(args); throw new Error('网络中断') } })
  page.showPreview({ courses: [row] }, '照片')
  page.editCourse({ currentTarget: { dataset: { preview: 0 } } })
  page.data.form.location = '160212'
  await page.saveCourse()
  assert.equal(calls.length, 0)
  assert.equal(page.data.preview.courses[0].location, '160212')
  await page.confirmImport()
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], '/api/v1/courses/import/confirm')
  assert.equal(page.data.preview.courses.length, 1)
  assert.equal(page.data.importError, '网络中断')
})
test('leaving during file recognition never saves or opens a stale preview', async () => {
  let done, posts = 0
  const page = pageWith({ uploadCourse: () => new Promise(resolve => { done = resolve }), post: () => { posts++ } })
  const work = page.importFile('/tmp/course.png', 1000, 'photo', '课表')
  page.onUnload(); done({ courses: [row] }); await work
  assert.equal(page.data.preview, null)
  assert.equal(posts, 0)
})
