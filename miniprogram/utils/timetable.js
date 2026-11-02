const DAYS = ['一', '二', '三', '四', '五', '六', '日']
const TIMES = [
  ['08:00', '08:45'], ['08:55', '09:40'], ['10:10', '10:55'], ['11:05', '11:50'],
  ['14:00', '14:45'], ['14:55', '15:40'], ['16:10', '16:55'], ['17:05', '17:50'],
  ['', ''], ['', ''], ['', ''], ['', '']
]
const ROW_HEIGHT = 180
const BREAK_HEIGHT = 24
const pad = n => ('0' + n).slice(-2)
function dateKey(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) }
function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d, 12)
  return dateKey(date) === value ? date : null
}
function monday(date) {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
  day.setDate(day.getDate() - (day.getDay() + 6) % 7)
  return day
}
function weekNumber(date, start) {
  const first = parseDate(start)
  if (!first) return null
  const a = monday(first), b = monday(date)
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 604800000) + 1
}
function normalizeWeeks(value) {
  return String(value || '').replace(/[，、]/g, ',').replace(/[－—–～~]/g, '-').replace(/（/g, '(').replace(/）/g, ')')
    .replace(/每周|全部周|全周|第|周|\s/g, '').replace(/单数/g, '单').replace(/双数/g, '双')
}
function weekSet(value) {
  const text = normalizeWeeks(value)
  if (!text) return null
  const values = new Set()
  for (const part of text.split(',')) {
    const m = /^(?:(\d{1,2})(?:-(\d{1,2}))?)?(?:\(?([单双])\)?)?$/.exec(part)
    if (!m || !part) return false
    const a = m[1] ? Number(m[1]) : 1, b = m[1] ? Number(m[2] || m[1]) : 60
    if (a < 1 || b > 60 || a > b) return false
    for (let week = a; week <= b; week++) if (!m[3] || week % 2 === (m[3] === '单' ? 1 : 0)) values.add(week)
  }
  return values.size ? values : false
}
function occurs(course, week) {
  if (week == null) return true
  if (week < 1 || week > 60) return false
  const values = weekSet(course.weeks)
  return values === false ? false : !values || values.has(week)
}
function courseColor(name) {
  let hash = 0
  for (const char of String(name)) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return ['sky', 'blue', 'teal', 'indigo', 'slate'][Math.abs(hash) % 5]
}
function position(section) { return (section - 1) * ROW_HEIGHT + (section > 4 ? BREAK_HEIGHT : 0) + (section > 8 ? BREAK_HEIGHT : 0) }
function build(courses, offset, termStart, now, showInactive) {
  now = now || new Date()
  const first = monday(now); first.setDate(first.getDate() + (offset || 0) * 7)
  const week = weekNumber(first, termStart)
  const today = dateKey(now)
  const days = DAYS.map((label, i) => {
    const date = new Date(first); date.setDate(date.getDate() + i)
    return { label, date: date.getDate(), key: dateKey(date), today: dateKey(date) === today }
  })
  const count = Math.max(8, ...courses.map(c => Number(c.endSect) || 8))
  const sections = TIMES.slice(0, Math.min(12, count)).map((t, i) => ({
    number: i + 1, start: t[0], end: t[1], top: position(i + 1), height: ROW_HEIGHT,
    breakBefore: i === 4 ? '午间休息' : i === 8 ? '晚间课程' : ''
  }))
  const columns = DAYS.map((_, i) => {
    const items = courses.filter(c => c.weekday === i + 1 && (showInactive || occurs(c, week)))
      .map(c => ({ ...c, inactive: !occurs(c, week), tone: courseColor(c.name),
        top: position(c.startSect) + 4, height: position(c.endSect) + ROW_HEIGHT - position(c.startSect) - 8,
        time: TIMES[c.startSect - 1] && TIMES[c.startSect - 1][0] || '第' + c.startSect + '节' }))
      .sort((a, b) => a.startSect - b.startSect || a.endSect - b.endSect)
    let group = [], lastEnd = 0
    const finish = () => {
      group.forEach((c, index) => {
        c.left = group.length === 1 ? '3%' : (3 + index * 94 / group.length) + '%'
        c.width = (94 / group.length) + '%'; c.conflict = group.length > 1
      }); group = []
    }
    items.forEach(c => { if (group.length && c.startSect > lastEnd) { finish(); lastEnd = 0 } group.push(c); lastEnd = Math.max(lastEnd, c.endSect) })
    finish()
    return { key: i + 1, items }
  })
  const last = new Date(first); last.setDate(last.getDate() + 6)
  return { days, columns, sections, gridHeight: position(sections.length) + ROW_HEIGHT,
    month: first.getMonth() + 1, week, weekText: week == null ? '设置开学日' : week < 1 ? '尚未开学' : '第' + week + '周',
    range: (first.getMonth() + 1) + '月' + first.getDate() + '日 — ' + (last.getMonth() + 1) + '月' + last.getDate() + '日',
    dateText: dateKey(now).replace(/-/g, '/'), todayName: '周' + DAYS[(now.getDay() + 6) % 7],
    activeCount: courses.filter(c => occurs(c, week)).length }
}
function validate(form) {
  if (!String(form.name || '').trim()) return '请填写课程名称'
  if (form.name.length > 128 || (form.teacher || '').length > 64 || (form.location || '').length > 128) return '课程信息太长，请缩短后保存'
  if (!Number.isInteger(form.weekday) || form.weekday < 1 || form.weekday > 7) return '请选择正确的星期'
  if (!Number.isInteger(form.startSect) || !Number.isInteger(form.endSect) || form.startSect < 1 || form.endSect > 12 || form.startSect > form.endSect) return '起始节次不能大于结束节次'
  if ((form.weeks || '').length > 64 || weekSet(form.weeks) === false) return '周次格式如1-16、1-16(单)或1,3,5'
  return ''
}
module.exports = { DAYS, TIMES, build, validate, occurs, weekNumber, normalizeWeeks, parseDate, dateKey }
