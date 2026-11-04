const campus = require('../../utils/campus')
const geo = require('../../utils/map-geo')
const design = require('../../utils/design-config')
const layout = require('../../utils/design-layout')
const mapCache = require('../../utils/map-cache')

Page({
  data: {
    gq: '', mapTop: 90, tabHeight: 70, sheetHeight: 250, sheetLevel: 1,
    campuses: [], campusIndex: 0, campusName: '选择校区', campusId: '',
    latitude: 0, longitude: 0, scale: 16, mapReady: false, loading: true, syncing: false, offlineData: false, searching: false,
    error: '', warning: '', keyword: '', categories: [], categoryCount: 0, categoryId: '', categoryTitle: '', categoryExpanded: false, mode: 'sites',
    markers: [], polygons: [], results: [], resultCount: 0, selected: null,
    satellite: false, navigationLoading: false, navigationError: '', navigationNotice: '',
    indoorCount: 0
  },
  onLoad(options) {
    this.pageVisible = true
    this.disposed = false
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const capsule = wx.getMenuButtonBoundingClientRect()
    this.windowHeight = info.windowHeight
    this.windowWidth = info.windowWidth
    const mapTop = capsule.bottom + Math.max(6, capsule.top - info.statusBarHeight)
    const safe = info.safeArea ? Math.max(0, (info.screenHeight || info.windowHeight) - info.safeArea.bottom) : 0
    const dimensions = layout.mapLayout(info, mapTop, safe, design.tokens)
    const tabHeight = dimensions.tabHeight
    this.sheetMin = dimensions.sheetMin
    this.sheetMax = dimensions.sheetMax
    this.sheetMid = dimensions.sheetMid
    this.setData({ gq: getApp().glassClass(), mapTop, tabHeight, sheetHeight: this.sheetMid, sheetLevel: 1 })
    const settings = getApp().globalData.campusSettings
    if (settings && Number(settings.mapScale) >= 13 && Number(settings.mapScale) <= 20) this.setData({ scale: Number(settings.mapScale) })
    this.pendingTarget = options.siteId ? { id: options.siteId } : null
    this.load()
  },
  onReady() { this.map = wx.createMapContext('campus-map', this); this.fitOverview() },
  onShow() {
    this.pageVisible = true
    if (this.getTabBar && this.getTabBar()) this.getTabBar().setData({ active: 2 })
    const target = getApp().globalData.mapTarget
    if (target) { this.pendingTarget = target; getApp().globalData.mapTarget = null }
    if (this.data.mapReady) {
      if (this.data.offlineData) return this.load().then(() => {
        if (this.pageVisible === false || this.disposed) return
        this.consumeTarget()
      })
      const selectedId = wx.getStorageSync('selectedCampusId')
      const index = this.data.campuses.findIndex(c => c.id === selectedId)
      if (index >= 0 && index !== this.data.campusIndex && !this.pendingTarget) this.changeCampus(index)
      else this.consumeTarget()
    } else if (!this.data.loading && this.data.error) {
      return this.load()
    }
  },
  onHide() { this.pageVisible = false; this.cancelSearch(); this.clearNavigation(); this.setData({ categoryExpanded: false }) },
  onUnload() { this.disposed = true; this.onHide(); this.requestVersion = (this.requestVersion || 0) + 1 },
  publicCall(key, parameters) { return campus.call(key, parameters, { timeout: 8000 }) },
  applyDataset(data) {
    this.allCategories = campus.list(data.categories).map(c => Object.assign(campus.normalize(c), { sites: campus.list(c.list).map(campus.normalize) }))
    this.allSites = this.allCategories.reduce((all, category) => all.concat(category.sites.map(site => Object.assign({}, site, { categoryId: category.id, categoryName: category.title }))), [])
    this.setData({ campuses: campus.list(data.campuses).map(campus.normalize) })
  },
  savedCampusIndex() {
    const saved = wx.getStorageSync('selectedCampusId')
    let index = Math.max(0, this.data.campuses.findIndex(c => c.id === saved))
    if (this.pendingTarget && this.pendingTarget.id) {
      const target = this.allSites.find(s => s.id === this.pendingTarget.id)
      const targetIndex = target ? this.data.campuses.findIndex(c => c.id === target.campus_id) : -1
      if (targetIndex >= 0) index = targetIndex
    }
    return index
  },
  async load() {
    if (this.loadInFlight) return
    this.loadInFlight = true
    this.setData({ loading: !this.data.mapReady, syncing: true, error: '', categoryExpanded: false })
    try {
      const saved = mapCache.read ? mapCache.read(wx) : null
      if (!this.data.mapReady && saved) {
        this.savedMap = saved
        this.applyDataset(saved)
        await this.changeCampus(this.savedCampusIndex(), true)
      }
      const [campusesData, categoriesData] = await Promise.all([this.publicCall('campus.list'), this.publicCall('category.with-sites')])
      if (this.disposed) return
      const campuses = campus.list(campusesData).map(campus.normalize)
      if (!campuses.length) throw new Error('暂无已发布校区')
      const selected = this.data.selected
      this.applyDataset({ campuses: campusesData, categories: campus.list(categoriesData) })
      this.setData({ offlineData: false, warning: '' })
      if (selected && this.data.mapReady) {
        this.campusSites = this.allSites.filter(site => site.campus_id === this.data.campusId)
        this.updateCampusView(this.data.campuses[this.data.campusIndex])
      } else await this.changeCampus(this.savedCampusIndex())
      if (mapCache.write) mapCache.write(wx, { campuses: campusesData, categories: campus.list(categoriesData),
        calibrations: Object.assign({}, this.savedMap && this.savedMap.calibrations, { [this.data.campusId]: this.calibration }) })
    } catch (error) {
      if (this.disposed) return
      if (this.data.mapReady) {
        this.setData({ loading: false, offlineData: true, warning: '正在使用已保存的校园地点，实时服务暂不可用' })
        return
      }
      this.setData({ loading: false, error: campus.errorText(error), categoryExpanded: false,
        sheetHeight: this.sheetMid, sheetLevel: 1 })
    } finally {
      this.loadInFlight = false
      if (!this.disposed) this.setData({ syncing: false })
    }
  },
  async changeCampus(index, savedOnly) {
    this.cancelSearch()
    const version = this.requestVersion = (this.requestVersion || 0) + 1
    const selected = this.data.campuses[index]
    if (!selected || !selected.point) { this.setData({ loading: false, error: '该校区暂未提供地图坐标' }); return }
    wx.setStorageSync('selectedCampusId', selected.id)
    this.clearNavigation()
    this.visibleSites = []
    this.campusSites = []
    this.ranked = []
    this.buildings = []
    this.setData({ campusIndex: index, campusName: selected.title, campusId: selected.id,
      latitude: selected.point.latitude, longitude: selected.point.longitude, mapReady: true,
      loading: false, offlineData: !!savedOnly, selected: null, keyword: '', categoryId: '', categoryTitle: '', categoryExpanded: false,
      categories: [], categoryCount: 0, results: [], resultCount: 0, markers: [], polygons: [], error: '', warning: '' })
    this.mapFitted = false
    this.calibration = this.savedMap && this.savedMap.calibrations && this.savedMap.calibrations[selected.id] || null
    this.updateCampusView(selected)
    this.consumeTarget()
    if (savedOnly) return
    const results = await Promise.allSettled([
      this.publicCall('campus.map-calibration', { campusId: selected.id, provider: 'tencent' }),
      this.publicCall('site.rank', { campus_id: selected.id, current: 1, pageSize: 20 }),
      this.publicCall('space.buildings', { campusId: selected.id }),
      this.publicCall('space.summary', { campusId: selected.id })
    ])
    if (version !== this.requestVersion) return
    this.calibration = results[0].status === 'fulfilled' ? results[0].value : this.calibration
    this.ranked = results[1].status === 'fulfilled' ? campus.list(results[1].value).map(campus.normalize) : []
    this.buildings = results[2].status === 'fulfilled' ? campus.list(results[2].value).map(campus.normalize) : []
    this.indoorSummary = results[3].status === 'fulfilled' ? results[3].value : null
    this.setData({ indoorCount: this.indoorSummary && Array.isArray(this.indoorSummary.buildings) ? this.indoorSummary.buildings.length : this.buildings.length,
      warning: results.some(r => r.status === 'rejected') ? '部分附加信息暂不可用，校园地点仍可查看' : '' })
    this.updateCampusView(selected)
    this.consumeTarget()
  },
  updateCampusView(selected) {
    this.campusSites = this.allSites.filter(site => site.campus_id === selected.id)
    const categories = this.allCategories.filter(c => c.sites.some(s => s.campus_id === selected.id)).map(c => ({
      id: c.id,
      title: c.title,
      count: c.sites.filter(site => site.campus_id === selected.id).length
    }))
    const boundary = geo.routePoints(selected.range).map(p => geo.calibrated(p, this.calibration))
    this.campusBoundary = boundary
    this.setData({ categories, categoryCount: categories.length, loading: false,
      polygons: boundary.length > 2 ? [{ points: boundary, strokeWidth: 2, strokeColor: design.mapRoute + '70', fillColor: design.mapRoute + '09' }] : [] })
    this.refreshMarkers()
    if (!this.data.selected) this.filterSites()
    this.fitOverview()
  },
  onCampusChange(e) { this.changeCampus(Number(e.detail.value), this.data.offlineData) },
  consumeTarget() {
    const target = this.pendingTarget
    if (!target || this.data.loading) return
    this.pendingTarget = null
    if (target.id) {
      const site = this.allSites.find(s => s.id === target.id)
      if (site && site.campus_id !== this.data.campusId) {
        const index = this.data.campuses.findIndex(c => c.id === site.campus_id)
        if (index >= 0) { this.pendingTarget = target; this.changeCampus(index); return }
      }
      if (site) { this.selectSite(site); return }
      const version = this.requestVersion
      const selectionVersion = this.departureVersion
      this.publicCall('site.detail', { id: target.id }).then(item => {
        if (!this.disposed && this.pageVisible !== false && version === this.requestVersion && selectionVersion === this.departureVersion) this.selectSite(campus.normalize(item))
      }).catch(error => { if (!this.disposed && version === this.requestVersion) this.setData({ warning: campus.errorText(error) }) })
    } else if (target.keyword) { this.setData({ keyword: target.keyword }); this.search() }
  },
  onKeyword(e) {
    this.cancelSearch()
    this.setData({ keyword: e.detail.value, categoryExpanded: false })
    this.searchTimer = setTimeout(() => this.search(), 350)
  },
  cancelSearch() {
    clearTimeout(this.searchTimer)
    this.searchVersion = (this.searchVersion || 0) + 1
    this.setData({ searching: false })
  },
  async search() {
    clearTimeout(this.searchTimer)
    const keyword = this.data.keyword.trim()
    const version = this.searchVersion = (this.searchVersion || 0) + 1
    const campusId = this.data.campusId
    const mode = this.data.mode
    if (!keyword) { this.setData({ searching: false, error: '' }); this.filterSites(); return }
    this.setData({ searching: true, error: '', selected: null, markers: [] })
    this.clearNavigation()
    try {
      let data
      if (this.data.offlineData && mode === 'sites') data = (this.campusSites || []).filter(s =>
        [s.title, s.aliases, s.description, s.categoryName].some(value => String(value || '').includes(keyword)))
      else data = await this.publicCall(mode === 'indoor' ? 'space.search' : 'site.search',
        mode === 'indoor' ? { campusId, keyword } : { campus_id: campusId, content: keyword })
      if (version !== this.searchVersion || campusId !== this.data.campusId || mode !== this.data.mode) return
      this.displaySites(campus.list(data).map(campus.normalize))
      this.setData({ searching: false, sheetHeight: this.sheetMid, sheetLevel: 1 })
    } catch (error) {
      if (version === this.searchVersion && campusId === this.data.campusId && mode === this.data.mode) this.setData({ searching: false, error: campus.errorText(error) })
    }
  },
  clearSearch() { this.setData({ keyword: '', error: '' }); this.search() },
  onCategory(e) {
    if (this.data.error) return
    const categoryId = e.currentTarget.dataset.id || ''
    const category = this.data.categories.find(item => item.id === categoryId)
    this.cancelSearch()
    this.setData({ categoryId, categoryTitle: category ? category.title : '', selected: null, keyword: '', categoryExpanded: false, error: '',
      sheetHeight: this.sheetMid, sheetLevel: 1 })
    this.clearNavigation()
    this.filterSites()
  },
  toggleCategories() {
    if (this.data.error) return
    if (this.data.categoryExpanded) {
      this.setData({ categoryExpanded: false, sheetHeight: this.sheetMid, sheetLevel: 1 })
      return
    }
    this.cancelSearch()
    const rows = Math.ceil((this.data.categories.length + 1) / 3)
    const desiredHeight = Math.min(this.sheetMax, Math.max(this.sheetMid,
      (130 + rows * 90) * (this.windowWidth || 375) / 375))
    this.setData({ categoryExpanded: true, selected: null, keyword: '', error: '', sheetHeight: desiredHeight, sheetLevel: 1 })
    this.clearNavigation()
    this.filterSites()
  },
  onMode(e) { this.cancelSearch(); this.setData({ mode: e.currentTarget.dataset.mode, keyword: '', selected: null, categoryId: '', categoryTitle: '', categoryExpanded: false, error: '' }); this.clearNavigation(); this.filterSites() },
  filterSites() {
    let sites
    if (this.data.mode === 'indoor') sites = this.buildings || []
    else if (this.data.categoryId) sites = (this.campusSites || []).filter(s => s.categoryId === this.data.categoryId)
    else {
      const rankedIds = new Set((this.ranked || []).map(s => s.id))
      sites = (this.ranked || []).concat((this.campusSites || []).filter(s => !rankedIds.has(s.id)))
    }
    this.displaySites(sites)
  },
  displaySites(sites) {
    const results = sites.map((site, i) => Object.assign({}, site, { markerId: i + 1,
      mapPoint: geo.calibrated(site.point, this.calibration, site.id) }))
    this.visibleSites = results
    this.setData({ results, resultCount: results.length, markers: [] })
  },
  onMarker(e) { const site = (this.visibleSites || []).find(s => s.markerId === e.detail.markerId); if (site) this.selectSite(site) },
  onResult(e) { const site = this.data.results[e.currentTarget.dataset.index]; if (site) this.selectSite(site) },
  selectSite(site) {
    this.cancelSearch()
    this.clearNavigation()
    const mapPoint = geo.calibrated(site.point, this.calibration, site.id)
    const selected = Object.assign({}, site, { mapPoint })
    const selectedHeight = 310 * (this.windowWidth || 375) / 375
    const update = { selected, categoryExpanded: false, sheetHeight: Math.min(this.sheetMax, Math.max(this.sheetMid, selectedHeight)), sheetLevel: 1 }
    this.setData(update)
    this.refreshMarkers()
    this.fitOverview()
  },
  closeSelected() { this.setData({ selected: null, categoryExpanded: false }); this.clearNavigation(); this.filterSites(); this.fitOverview() },
  refreshMarkers() {
    const selected = this.data.selected && Object.assign({}, this.data.selected, {
      mapPoint: campus.point(geo.calibrated(this.data.selected.point, this.calibration, this.data.selected.id))
    })
    const markers = []
    if (selected && selected.mapPoint) {
      markers.push({ id: 999999, latitude: selected.mapPoint.latitude, longitude: selected.mapPoint.longitude,
        iconPath: '/assets/icons/map-pin.png', width: 34, height: 43,
        callout: { content: selected.title, display: 'ALWAYS', bgColor: design.palette.surface, color: design.palette.accentInk, padding: 10, fontSize: 13, borderRadius: design.tokens.contentRadius } })
    }
    this.setData({ selected, markers })
  },
  depart() {
    const selected = this.data.selected
    if (!selected || this.navigationRequest || this.pageVisible === false || this.disposed) return Promise.resolve(false)
    const point = campus.point(geo.calibrated(selected.point, this.calibration, selected.id))
    if (!point) { this.setData({ navigationError: '该地点暂未提供导航坐标，可复制地点名称后搜索' }); return Promise.resolve(false) }
    if (typeof wx.openLocation !== 'function') {
      this.setData({ navigationError: '当前微信版本无法打开地图，可更新微信或复制地点到地图应用搜索' })
      return Promise.resolve(false)
    }
    const request = this.navigationRequest = {}
    this.setData({ navigationLoading: true, navigationError: '', navigationNotice: '' })
    return new Promise(resolve => {
      let finished = false
      const finish = error => {
        if (finished) return
        finished = true
        if (this.navigationRequest === request) {
          this.navigationRequest = null
          if (!this.disposed && this.data.selected && this.data.selected.id === selected.id) {
            const detail = error && (error.errMsg || error.message) || ''
            this.setData({ navigationLoading: false,
              navigationNotice: error ? '' : '在地图页点击“导航”，选择手机上可用的地图应用',
              navigationError: !error || /cancel/i.test(detail) ? '' : '未能打开地图，请重试或复制地点到地图应用搜索' })
          }
        }
        resolve(!error)
      }
      // Display a public destination only. Device location is handled by the chosen map app.
      try {
        wx.openLocation({ latitude: point.latitude, longitude: point.longitude, scale: 18,
          name: campus.text(selected.title).slice(0, 80),
          address: campus.text(selected.address || '北方民族大学 · ' + this.data.campusName + ' · ' + selected.title).slice(0, 160),
          success: () => finish(), fail: finish })
      } catch (error) { finish(error) }
    })
  },
  copyDestination() {
    const selected = this.data.selected
    if (!selected || this.pageVisible === false || this.disposed) return
    if (typeof wx.setClipboardData !== 'function') { this.setData({ navigationError: '当前微信版本不支持复制，请更新微信' }); return }
    const point = campus.point(geo.calibrated(selected.point, this.calibration, selected.id))
    const data = ['北方民族大学', campus.text(this.data.campusName), campus.text(selected.title),
      campus.text(selected.address), point ? 'GCJ-02：' + point.latitude.toFixed(6) + ',' + point.longitude.toFixed(6) : ''].filter(Boolean).join(' · ')
    const version = this.departureVersion
    wx.setClipboardData({ data, success: () => {
      if (!this.disposed && this.pageVisible !== false && version === this.departureVersion) this.setData({ navigationError: '', navigationNotice: '地点已复制，可粘贴到地图应用搜索' })
    }, fail: () => {
      if (!this.disposed && this.pageVisible !== false && version === this.departureVersion) this.setData({ navigationError: '未能复制地点，请重试' })
    } })
  },
  clearNavigation() { this.departureVersion = (this.departureVersion || 0) + 1; this.navigationRequest = null; this.setData({ navigationLoading: false, navigationError: '', navigationNotice: '' }) },
  onMapUpdated() { if (!this.mapFitted && this.data.mapReady) { this.mapFitted = true; this.fitOverview() } },
  fitOverview(campusOnly) {
    if (this.disposed || !this.data.mapReady || !this.map || !this.map.includePoints) return
    let points = (this.campusBoundary || []).slice()
    if (!points.length) points = (this.campusSites || []).map(s => geo.calibrated(s.point, this.calibration, s.id)).filter(Boolean)
    if (!campusOnly) {
      if (this.data.selected && this.data.selected.mapPoint) points.push(this.data.selected.mapPoint)
    }
    if (!points.length) return
    // MapContext padding is in map-local CSS pixels, below the search bar and above the sheet.
    const side = Math.max(24, Math.round((this.windowWidth || 375) * .07))
    const top = Math.round(112 * (this.windowWidth || 375) / 375)
    this.map.includePoints({ points, padding: [top, side, this.data.sheetHeight + 12, side], fail() {} })
  },
  openDetail() {
    if (!this.data.selected) return
    const type = this.data.mode === 'indoor' ? 'space' : 'site'
    getApp().globalData.campusSelection = { type, item: this.data.selected }
    wx.navigateTo({ url: '/pages/campus-detail/campus-detail?type=' + type + '&id=' + encodeURIComponent(this.data.selected.id) })
  },
  toggleSatellite() { this.setData({ satellite: !this.data.satellite }) },
  resetMap() {
    const selected = this.data.campuses[this.data.campusIndex]
    if (selected && selected.point) { this.setData({ latitude: selected.point.latitude, longitude: selected.point.longitude }); this.fitOverview() }
  },
  onSheetStart(e) { this.touchY = e.touches[0].clientY; this.touchHeight = this.data.sheetHeight },
  onSheetMove(e) { const height = this.touchHeight + this.touchY - e.touches[0].clientY; this.setData({ sheetHeight: Math.max(this.sheetMin, Math.min(this.sheetMax, height)) }) },
  onSheetEnd() {
    const levels = [this.sheetMin, this.sheetMid, this.sheetMax]
    const level = levels.reduce((best, height, i) => Math.abs(height - this.data.sheetHeight) < Math.abs(levels[best] - this.data.sheetHeight) ? i : best, 0)
    this.setData({ sheetLevel: level, sheetHeight: levels[level], categoryExpanded: level === 0 ? false : this.data.categoryExpanded })
    this.fitOverview()
  },
  cycleSheet() { const level = (this.data.sheetLevel + 1) % 3; this.setData({ sheetLevel: level, sheetHeight: [this.sheetMin, this.sheetMid, this.sheetMax][level], categoryExpanded: level === 0 ? false : this.data.categoryExpanded }); this.fitOverview() }
})
