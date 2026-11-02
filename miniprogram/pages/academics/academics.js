const campus = require('../../utils/campus')
const design = require('../../utils/design-config')
const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const SUMMARY_LABELS = { averageGpa: '平均绩点', avgGpa: '平均绩点', gpa: '绩点', totalCredits: '总学分',
  earnedCredits: '已获学分', weightedAverage: '加权平均分', averageScore: '平均成绩', average: '平均分',
  courseCount: '课程数', totalCourses: '课程数', passedCount: '通过课程数', failedCount: '未通过课程数',
  totalCount: '成绩条数', totalCredit: '总学分' }

function summaryRows(summary) {
  if (typeof summary === 'string' || typeof summary === 'number') return [{ label: '教务汇总', value: String(summary) }]
  if (!summary || typeof summary !== 'object') return []
  return Object.keys(summary).filter(key => summary[key] != null && typeof summary[key] !== 'object')
    .map(key => ({ label: SUMMARY_LABELS[key] || key, value: String(summary[key]) }))
}

Page({
  data: {
    gq: '', consentColor: design.palette.accentInk, loading: true, error: '', bound: false, session: {}, share: {},
    tab: 'schedule', tabs: [{ key: 'schedule', label: '课表' }, { key: 'grades', label: '成绩' }, { key: 'summary', label: '汇总' }, { key: 'account', label: '关联' }],
    bindMode: 'share', studentNo: '', password: '', authcode: '', shareCode: '', consent: false,
    captchaId: '', captchaImage: '', captchaLoading: false, captchaError: '', submitting: false,
    courses: [], shownCourses: [], days: DAYS, dayIndex: (new Date().getDay() + 6) % 7,
    grades: [], summaryRows: [], rule: '', dataSource: '', dataUpdated: '', semester: '',
    semesters: ['全部学期'], semesterIndex: 0, syncing: false, revoking: false, scopesText: '', statusError: ''
  },
  onLoad(options) { this.setData({ gq: getApp().glassClass(), returnToCourses: !!(options && options.returnToCourses === '1') }) },
  onShow() { this.loadStatus() },
  onHide() { this.setData({ password: '', authcode: '', shareCode: '' }) },
  onUnload() { this.requestVersion = (this.requestVersion || 0) + 1 },
  onPullDownRefresh() { this.loadStatus().finally(() => wx.stopPullDownRefresh()) },
  valid(version) { return version === this.requestVersion && this.accountId === getApp().globalData.guestId },
  async loadStatus() {
    const version = this.requestVersion = (this.requestVersion || 0) + 1
    this.setData({ loading: true, statusError: '', error: '' })
    try { await getApp().ensureSession() }
    catch (error) {
      if (version === this.requestVersion) this.setData({ loading: false, statusError: campus.errorText(error) })
      return
    }
    if (version !== this.requestVersion) return
    const identity = getApp().globalData.guestId
    if (this.accountId !== identity) {
      this.accountId = identity
      this.setData({ bound: false, courses: [], shownCourses: [], grades: [], summaryRows: [],
        session: {}, share: {}, password: '', studentNo: '', authcode: '', shareCode: '', consent: false })
    }
    const results = await Promise.allSettled([campus.call('jwxt.session-status'), campus.call('jwxt.share-status')])
    if (!this.valid(version)) return
    const session = results[0].status === 'fulfilled' ? results[0].value : {}
    const share = results[1].status === 'fulfilled' ? results[1].value : {}
    const expired = status => ['expired', 'revoked', 'none'].includes(status)
    const bound = !!((session.bound && !expired(session.status)) || (share.linked && !expired(share.status)))
    const failed = results.find(result => result.status === 'rejected')
    this.setData({ session, share, bound, loading: false,
      scopesText: (share.scopes || []).map(scope => ({ schedule: '课表', grades: '成绩', 'grade-summary': '成绩汇总' }[scope] || scope)).join('、'),
      statusError: failed ? campus.errorText(failed.reason) : '' })
    if (bound && this.data.tab !== 'account') await this.loadData()
  },
  async loadData() {
    if (!this.data.bound || this.data.tab === 'account') return
    const version = this.requestVersion = (this.requestVersion || 0) + 1
    const tab = this.data.tab
    this.setData({ loading: true, error: '' })
    try {
      const key = tab === 'summary' ? 'jwxt.grade-summary' : 'jwxt.' + tab
      const query = this.data.semesterIndex > 0 ? { semester: this.data.semesters[this.data.semesterIndex] } : {}
      const data = await campus.call(key, query)
      if (!this.valid(version)) return
      const update = { loading: false, dataSource: campus.text(data.source),
        dataUpdated: campus.dateText(data.syncedAt || data.updatedAt), error: '' }
      if (tab === 'schedule') {
        const courses = (Array.isArray(data.courses) ? data.courses : []).map((course, index) => ({
          id: campus.id(course) || String(index), name: campus.text(course.courseName || course.name),
          teacher: campus.text(course.teacher), classroom: campus.text(course.classroom || course.location),
          weekday: Number(course.weekday), startSection: course.startSection, endSection: course.endSection,
          weekText: campus.text(course.weekText)
        })).sort((a, b) => a.weekday - b.weekday || Number(a.startSection) - Number(b.startSection))
        Object.assign(update, { courses, shownCourses: courses.filter(c => c.weekday === this.data.dayIndex + 1), semester: campus.text(data.semester) })
      } else if (tab === 'grades') {
        update.grades = (Array.isArray(data.items) ? data.items : []).map((item, index) => {
          const fields = item.fields || {}
          return { id: String(index), semester: campus.text(item.semester),
            name: campus.text(fields['课程名称'] || fields['课程名'] || fields.courseName || item.courseName) || '课程成绩',
            fields: Object.keys(fields).map(key => ({ label: key, value: campus.text(fields[key]) })) }
        })
        update.summaryRows = summaryRows(data.summary)
      } else {
        update.summaryRows = summaryRows(data.summary)
        update.rule = campus.text(data.rule)
      }
      if (Array.isArray(data.semesters) && data.semesters.length) {
        const semesters = ['全部学期'].concat(data.semesters.map(item => campus.text(typeof item === 'object' ? item.semester || item.name || item.value : item)).filter(Boolean))
        const selected = this.data.semesters[this.data.semesterIndex]
        update.semesters = semesters
        update.semesterIndex = Math.max(0, semesters.indexOf(selected))
      }
      this.setData(update)
    } catch (error) { if (this.valid(version)) this.setData({ loading: false, error: campus.errorText(error) }) }
  },
  onTab(e) { this.setData({ tab: e.currentTarget.dataset.key, error: '' }); this.loadData() },
  onDay(e) { const index = Number(e.currentTarget.dataset.index); this.setData({ dayIndex: index, shownCourses: this.data.courses.filter(c => c.weekday === index + 1) }) },
  onSemester(e) { this.setData({ semesterIndex: Number(e.detail.value) }); this.loadData() },
  goTimetable() { if (this.data.returnToCourses) wx.navigateBack(); else wx.navigateTo({ url: '/pages/courses/courses' }) },
  onBindMode(e) {
    const bindMode = e.currentTarget.dataset.mode
    this.setData({ bindMode, error: '', password: '', authcode: '', shareCode: '' })
    if (bindMode === 'independent' && !this.data.captchaImage) this.loadCaptcha()
  },
  onForm(e) { const field = e.currentTarget.dataset.field; if (['studentNo', 'password', 'authcode', 'shareCode'].includes(field)) this.setData({ [field]: e.detail.value }) },
  onConsent(e) { this.setData({ consent: e.detail.value.includes('agree') }) },
  async loadCaptcha() {
    if (this.data.captchaLoading) return
    const identity = this.accountId
    this.setData({ captchaLoading: true, captchaError: '', captchaImage: '', captchaId: '' })
    try {
      const data = await campus.call('jwxt.captcha')
      if (identity !== getApp().globalData.guestId) return
      const raw = data.imageBase64 || ''
      this.setData({ captchaId: data.captchaId || '', captchaImage: raw.startsWith('data:image/') ? raw : 'data:image/png;base64,' + raw, captchaLoading: false })
    } catch (error) { if (identity === getApp().globalData.guestId) this.setData({ captchaLoading: false, captchaError: campus.errorText(error) }) }
  },
  async bind() {
    if (this.data.submitting) return
    const independent = this.data.bindMode === 'independent'
    if (independent && !this.data.consent) { wx.showToast({ title: '请先阅读并同意教务数据处理说明', icon: 'none' }); return }
    const query = independent ? { studentNo: this.data.studentNo.trim(), password: this.data.password,
      captchaId: this.data.captchaId, authcode: this.data.authcode.trim() } : { shareCode: this.data.shareCode.trim() }
    if (Object.keys(query).some(key => !query[key])) { wx.showToast({ title: independent ? '请完整填写登录信息' : '请输入授权码', icon: 'none' }); return }
    const identity = this.accountId
    this.setData({ submitting: true, error: '' })
    try {
      const data = await campus.call(independent ? 'jwxt.auth' : 'jwxt.share-redeem', query)
      if (identity !== getApp().globalData.guestId) return
      if (!(data.authenticated || data.linked)) throw new Error('教务关联未完成，请重试')
      this.setData({ tab: 'schedule', password: '', authcode: '', shareCode: '', captchaImage: '', captchaId: '' })
      wx.showToast({ title: '教务已关联', icon: 'success' })
      await this.loadStatus()
    } catch (error) {
      if (identity === getApp().globalData.guestId) {
        this.setData({ error: campus.errorText(error) })
        if (independent) this.loadCaptcha()
      }
    } finally { this.setData({ submitting: false, password: '', authcode: '', shareCode: '' }) }
  },
  async sync() {
    if (this.data.syncing || !this.data.session.bound) return
    const identity = this.accountId
    this.setData({ syncing: true, error: '' })
    try {
      await campus.call('jwxt.sync', { type: 'all' })
      if (identity !== getApp().globalData.guestId) return
      wx.showToast({ title: '同步完成', icon: 'success' })
      await this.loadStatus()
    } catch (error) { if (identity === getApp().globalData.guestId) this.setData({ error: campus.errorText(error) }) }
    finally { this.setData({ syncing: false }) }
  },
  revoke(e) {
    const kind = e.currentTarget.dataset.kind
    if (this.data.revoking) return
    wx.showModal({ title: kind === 'share' ? '撤销共享授权' : '解除教务会话', content: '确认后将无法继续读取这项关联下的课表和成绩。',
      confirmText: '确认解除', success: async result => {
        if (!result.confirm) return
        this.setData({ revoking: true, error: '' })
        try {
          await campus.call(kind === 'share' ? 'jwxt.share-revoke' : 'jwxt.session-revoke')
          this.setData({ courses: [], shownCourses: [], grades: [], summaryRows: [], tab: 'account' })
          await this.loadStatus()
        } catch (error) { this.setData({ error: campus.errorText(error) }) }
        finally { this.setData({ revoking: false }) }
      } })
  },
  mapClassroom(e) {
    const classroom = e.currentTarget.dataset.classroom
    if (!classroom) return
    getApp().globalData.mapTarget = { keyword: classroom }
    wx.switchTab({ url: '/pages/map/map' })
  }
})
