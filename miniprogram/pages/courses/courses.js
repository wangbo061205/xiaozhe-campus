const api = require('../../utils/api')
const campus = require('../../utils/campus')
const timetable = require('../../utils/timetable')

Page({
  data: {
    gq: '', loading: true, error: '', list: [], termStart: '', offset: 0, showInactive: false,
    ...timetable.build([], 0, '', new Date(), false),
    importOpen: false, importing: false, importLabel: '', importError: '',
    preview: null, previewRows: [], previewWarnings: [], saving: false,
    editing: null, form: {}, editError: '', settingsOpen: false, settingsError: '',
    weekdayNames: timetable.DAYS.map(d => '周' + d), sectionsRange: Array.from({ length: 12 }, (_, i) => '第' + (i + 1) + '节')
  },
  onLoad() { this.setData({ gq: getApp().glassClass() }); this.alive = true },
  onShow() { this.alive = true; this.load() },
  onUnload() { this.alive = false; this.version = (this.version || 0) + 1 },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh() },
  async load() {
    const version = this.version = (this.version || 0) + 1
    this.setData({ loading: true, error: '' })
    try {
      const [list, settings] = await Promise.all([api.get('/api/v1/courses'), api.get('/api/v1/courses/settings')])
      if (!this.alive || version !== this.version) return
      this.setData({ list, termStart: settings.termStart || '', loading: false })
      this.refreshGrid()
    } catch (error) { if (this.alive && version === this.version) this.setData({ loading: false, error: campus.errorText(error) }) }
  },
  refreshGrid() { this.setData(timetable.build(this.data.list, this.data.offset, this.data.termStart, new Date(), this.data.showInactive)) },
  previousWeek() { this.setData({ offset: this.data.offset - 1 }); this.refreshGrid() },
  nextWeek() { this.setData({ offset: this.data.offset + 1 }); this.refreshGrid() },
  currentWeek() { this.setData({ offset: 0 }); this.refreshGrid() },
  openImport() { if (!this.data.importing && !this.data.saving) this.setData({ importOpen: true, importError: '' }) },
  closeImport() { if (!this.data.importing) this.setData({ importOpen: false, importError: '' }) },
  noop() {},
  openSettings() { this.setData({ settingsOpen: true, settingsError: '' }) },
  closeSettings() { if (!this.data.saving) this.setData({ settingsOpen: false }) },
  async onTermStart(e) {
    if (this.data.saving) return
    const termStart = e.detail.value
    this.setData({ saving: true, settingsError: '' })
    try {
      await api.put('/api/v1/courses/settings', { termStart })
      if (!this.alive) return
      this.setData({ termStart }); this.refreshGrid()
    } catch (error) { if (this.alive) this.setData({ settingsError: campus.errorText(error) }) }
    finally { if (this.alive) this.setData({ saving: false }) }
  },
  onInactive(e) { this.setData({ showInactive: e.detail.value }); this.refreshGrid() },
  chooseFile() {
    if (this.data.importing) return
    wx.chooseMessageFile({ count: 1, type: 'file', extension: ['xlsx', 'xls', 'csv', 'tsv', 'ics', 'json', 'pdf'],
      success: result => { const f = result.tempFiles[0]; if (f) this.importFile(f.path, f.size, 'file', f.name) },
      fail: error => { if (!/cancel/.test(error.errMsg || '')) this.setData({ importError: '未能选择文件，请重新选择微信聊天中的课表' }) }
    })
  },
  choosePhoto() {
    if (this.data.importing) return
    wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['original'],
      success: result => { const f = result.tempFiles[0]; if (f) this.importFile(f.tempFilePath, f.size, 'photo', '课表照片') },
      fail: error => { if (!/cancel/.test(error.errMsg || '')) this.setData({ importError: '未能选择照片，请检查相册或相机权限' }) }
    })
  },
  async importFile(path, size, source, name) {
    if (this.data.importing) return
    if (size > 10 * 1024 * 1024) { this.setData({ importError: '请使用10MB以内的课表文件或图片' }); return }
    this.setData({ importing: true, importLabel: source === 'photo' ? '正在识别课表照片' : '正在读取课表文件', importError: '' })
    try {
      const data = await api.uploadCourse(path, source, this.data.termStart, name)
      if (this.alive) this.showPreview(data, name || (source === 'photo' ? '照片导入' : '文件导入'))
    } catch (error) { if (this.alive) this.setData({ importError: campus.errorText(error) }) }
    finally { if (this.alive) this.setData({ importing: false, importLabel: '' }) }
  },
  async importEducation() {
    if (this.data.importing) return
    this.setData({ importing: true, importLabel: '正在读取教务课表', importError: '' })
    try {
      const data = await api.post('/api/v1/courses/import/education', {})
      if (this.alive) this.showPreview(data, '教务系统')
    } catch (error) {
      if (this.alive) this.setData({ importError: campus.errorText(error) })
    } finally { if (this.alive) this.setData({ importing: false, importLabel: '' }) }
  },
  goAcademics() { this.setData({ importOpen: false }); wx.navigateTo({ url: '/pages/academics/academics?returnToCourses=1' }) },
  showPreview(data, label) {
    if (!data || !Array.isArray(data.courses) || !data.courses.length) throw new Error('没有识别到课程，请换一份完整课表')
    const courses = data.courses.map(c => ({ ...c }))
    this.setData({ importOpen: false, preview: { courses, label, termStart: data.termStart || this.data.termStart || null },
      previewWarnings: data.warnings || [], importError: '' })
    this.refreshPreview()
  },
  refreshPreview() {
    this.setData({ previewRows: this.data.preview.courses.map((c, i) => ({ ...c, index: i,
      summary: this.data.weekdayNames[c.weekday - 1] + ' · 第' + c.startSect + (c.endSect !== c.startSect ? '—' + c.endSect : '') + '节',
      issue: timetable.validate(c) })) })
  },
  closePreview() { if (!this.data.saving) this.setData({ preview: null, previewRows: [], previewWarnings: [], importError: '' }) },
  removePreview(e) {
    if (this.data.saving) return
    const courses = this.data.preview.courses.slice(); courses.splice(Number(e.currentTarget.dataset.index), 1)
    this.setData({ 'preview.courses': courses }); this.refreshPreview()
  },
  async confirmImport() {
    if (this.data.saving || !this.data.preview || !this.data.preview.courses.length) return
    const issue = this.data.preview.courses.map(timetable.validate).find(Boolean)
    if (issue) { this.setData({ importError: issue }); return }
    this.setData({ saving: true, importError: '' })
    try {
      const result = await api.post('/api/v1/courses/import/confirm', { courses: this.data.preview.courses, termStart: this.data.preview.termStart })
      if (!this.alive) return
      this.setData({ preview: null, previewRows: [], previewWarnings: [] })
      wx.showToast({ title: result.added ? '已导入' + result.added + '条课程' : '课程已存在，无需重复导入', icon: 'none' })
      await this.load()
    } catch (error) { if (this.alive) this.setData({ importError: campus.errorText(error) }) }
    finally { if (this.alive) this.setData({ saving: false }) }
  },
  editCourse(e) {
    if (this.data.saving || this.data.importing) return
    const previewIndex = e.currentTarget.dataset.preview
    const preview = previewIndex != null
    const course = preview ? this.data.preview.courses[Number(previewIndex)] : this.data.list.find(c => c.id === Number(e.currentTarget.dataset.id))
    if (!course) return
    this.setData({ editing: { id: course.id, previewIndex: preview ? Number(previewIndex) : null }, form: { ...course }, editError: '' })
  },
  closeEditor() { if (!this.data.saving) this.setData({ editing: null, editError: '' }) },
  onField(e) {
    const field = e.currentTarget.dataset.field
    if (['name', 'location', 'teacher', 'weeks'].includes(field)) this.setData({ ['form.' + field]: e.detail.value })
  },
  onPicker(e) {
    const field = e.currentTarget.dataset.field
    if (['weekday', 'startSect', 'endSect'].includes(field)) this.setData({ ['form.' + field]: Number(e.detail.value) + 1 })
  },
  async saveCourse() {
    if (this.data.saving) return
    const form = this.data.form, issue = timetable.validate(form)
    if (issue) { this.setData({ editError: issue }); return }
    const row = { name: form.name.trim(), teacher: (form.teacher || '').trim(), location: (form.location || '').trim(),
      weekday: form.weekday, startSect: form.startSect, endSect: form.endSect, weeks: timetable.normalizeWeeks(form.weeks) }
    if (this.data.editing.previewIndex != null) {
      const courses = this.data.preview.courses.slice(); courses[this.data.editing.previewIndex] = row
      this.setData({ 'preview.courses': courses, editing: null }); this.refreshPreview(); return
    }
    this.setData({ saving: true, editError: '' })
    try {
      await api.put('/api/v1/courses/' + this.data.editing.id, row)
      if (!this.alive) return
      this.setData({ editing: null }); await this.load()
      wx.showToast({ title: '已保存修改', icon: 'success' })
    } catch (error) { if (this.alive) this.setData({ editError: campus.errorText(error) }) }
    finally { if (this.alive) this.setData({ saving: false }) }
  },
  deleteCourse() {
    if (this.data.saving || !this.data.editing || !this.data.editing.id) return
    const id = this.data.editing.id
    wx.showModal({ title: '删除这条课程？', content: '只移除当前课表中的这条课程，其他课程不受影响。', confirmText: '删除课程', confirmColor: '#9A462F',
      success: async result => {
        if (!result.confirm || !this.alive) return
        this.setData({ saving: true, editError: '' })
        try { await api.del('/api/v1/courses/' + id); if (this.alive) { this.setData({ editing: null }); await this.load() } }
        catch (error) { if (this.alive) this.setData({ editError: campus.errorText(error) }) }
        finally { if (this.alive) this.setData({ saving: false }) }
      } })
  }
})
