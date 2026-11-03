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
    markers: [], polyline: [], polygons: [], results: [], resultCount: 0, selected: null,
    satellite: false, routeLoading: false, route: null, routeError: '',
    origin: null, originOptions: [], originIndex: -1,
    indoorCount: 0, stepList: []
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
  onHide() { this.pageVisible = false; this.departureVersion = (this.departureVersion || 0) + 1; this.cancelSearch(); this.invalidateRoute(); this.setData({ categoryExpanded: false }) },
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
    this.clearRoute()
    this.visibleSites = []
    this.campusSites = []
    this.ranked = []
    this.buildings = []
    this.setData({ campusIndex: index, campusName: selected.title, campusId: selected.id,
      latitude: selected.point.latitude, longitude: selected.point.longitude, mapReady: true,
      loading: false, offlineData: !!savedOnly, selected: null, keyword: '', categoryId: '', categoryTitle: '', categoryExpanded: false,
      categories: [], categoryCount: 0, results: [], resultCount: 0, markers: [], polygons: [], error: '', warning: '',
      origin: null, originOptions: [], originIndex: -1 })
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
    this.updateOriginOptions()
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
    this.clearRoute()
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
    this.clearRoute()
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
    this.clearRoute()
    this.filterSites()
  },
  onMode(e) { this.cancelSearch(); this.setData({ mode: e.currentTarget.dataset.mode, keyword: '', selected: null, categoryId: '', categoryTitle: '', categoryExpanded: false, error: '' }); this.clearRoute(); this.filterSites() },
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
    this.clearRoute()
    const mapPoint = geo.calibrated(site.point, this.calibration, site.id)
    const selected = Object.assign({}, site, { mapPoint })
    const selectedHeight = 310 * (this.windowWidth || 375) / 375
    const update = { selected, categoryExpanded: false, sheetHeight: Math.min(this.sheetMax, Math.max(this.sheetMid, selectedHeight)), sheetLevel: 1 }
    this.setData(update)
    this.refreshMarkers()
    this.fitOverview()
  },
  closeSelected() { this.setData({ selected: null, categoryExpanded: false }); this.clearRoute(); this.filterSites(); this.fitOverview() },
  updateOriginOptions() {
    const originOptions = (this.campusSites || []).filter(site => site.point).map(site => ({
      id: site.id, title: site.title, point: site.point
    }))
    const previous = this.data.origin
    const originIndex = previous && previous.id ? originOptions.findIndex(site => site.id === previous.id) : -1
    const origin = previous && previous.id ? originOptions[originIndex] || null : previous
    if (previous && (!origin || geo.distance(previous.point, origin.point) > 0)) this.clearRoute()
    this.setData({ originOptions, originIndex, origin })
  },
  onOriginChange(e) {
    const index = Number(e.detail.value)
    const origin = Number.isInteger(index) && this.data.originOptions[index]
    if (!origin) return
    this.setOrigin(origin, index)
  },
  onMapLongPress(e) {
    if (!this.data.selected || this.pageVisible === false || this.disposed) return
    const displayPoint = campus.point(e.detail)
    if (!displayPoint) return
    const point = campus.point(geo.originalLocation(displayPoint, this.calibration))
    if (point) this.setOrigin({ id: '', title: '地图上选定的起点', point }, -1)
  },
  setOrigin(origin, index) {
    if (this.pageVisible === false || this.disposed || !campus.point(origin && origin.point)) return
    this.clearRoute()
    this.setData({ origin: Object.assign({}, origin, { mapPoint: geo.calibrated(origin.point, this.calibration, origin.id) }), originIndex: index })
    this.refreshMarkers()
    this.fitOverview()
  },
  refreshMarkers() {
    const selected = this.data.selected && Object.assign({}, this.data.selected, {
      mapPoint: geo.calibrated(this.data.selected.point, this.calibration, this.data.selected.id)
    })
    const origin = this.data.origin && Object.assign({}, this.data.origin, {
      mapPoint: geo.calibrated(this.data.origin.point, this.calibration, this.data.origin.id)
    })
    const markers = []
    if (selected && selected.mapPoint) {
      markers.push({ id: 999999, latitude: selected.mapPoint.latitude, longitude: selected.mapPoint.longitude,
        iconPath: '/assets/icons/map-pin.png', width: 34, height: 43,
        callout: { content: selected.title, display: 'ALWAYS', bgColor: design.palette.surface, color: design.palette.accentInk, padding: 10, fontSize: 13, borderRadius: design.tokens.contentRadius } })
    }
    if (selected && origin && origin.mapPoint) {
      markers.push({ id: 999998, latitude: origin.mapPoint.latitude, longitude: origin.mapPoint.longitude,
        iconPath: '/assets/icons/locate-fixed-green.png', width: 28, height: 28,
        callout: { content: '起点 · ' + origin.title, display: 'ALWAYS', bgColor: design.palette.surface, color: design.palette.accentInk, padding: 8, fontSize: 12, borderRadius: design.tokens.contentRadius } })
    }
    this.setData({ selected, origin, markers })
  },
  async depart() {
    if (!this.data.selected || this.data.routeLoading || this.pageVisible === false || this.disposed) return
    if (!this.data.origin) { this.setData({ routeError: '请先选择出发地点，也可以长按地图设置起点' }); return }
    await this.planRoute()
  },
  async planRoute() {
    if (this.data.routeLoading || !this.data.selected || !this.data.origin || this.pageVisible === false || this.disposed) return
    const selected = this.data.selected
    if (!selected.point) { this.setData({ routeError: '该地点暂未提供导航坐标' }); return }
    const origin = this.data.origin
    const campusId = this.data.campusId
    this.setData({ routeLoading: true, routeError: '' })
    const version = this.routeVersion = (this.routeVersion || 0) + 1
    let request
    try {
      const start = origin.point
      if (geo.distance(start, selected.point) < 5) {
        this.setData({ routeLoading: false, route: { distance: '起点与目的地在同一位置', time: '' }, polyline: [], stepList: [] })
        this.fitOverview()
        return
      }
      request = this.publicCall('road.plan', { start_lat: start.latitude, start_lng: start.longitude,
        end_lat: selected.point.latitude, end_lng: selected.point.longitude,
        campus_ids: this.data.campuses.map(c => c.id).join(','), route_type: 'shortest' })
      this.routeRequest = request
      const data = await request
      if (version !== this.routeVersion || this.pageVisible === false || this.disposed || campusId !== this.data.campusId || !this.data.selected || this.data.selected.id !== selected.id) return
      const points = geo.routePoints(data.points).map(p => geo.calibrated(p, this.calibration))
      if (points.length < 2) throw new Error('暂无可用校园路线，请重新选择目的地后重试')
      const meters = Number(data.routeDistance || data.distance)
      const route = { distance: Number.isFinite(meters) ? (meters >= 1000 ? (meters / 1000).toFixed(1) + ' 公里' : Math.round(meters) + ' 米') : '',
        time: typeof data.estimatedTime === 'number' ? '约 ' + data.estimatedTime + ' 分钟' : campus.text(data.estimatedTime) }
      const stepList = (Array.isArray(data.steps) ? data.steps : []).map((step, i) => ({ id: i,
        text: campus.text(typeof step === 'string' ? step : step.instruction || step.description || step.text || step.roadName) })).filter(step => step.text)
      this.setData({ route, stepList, routeLoading: false,
        polyline: [{ points, color: design.mapRoute, width: 6, arrowLine: true, borderColor: '#FFFFFF', borderWidth: 2 }] })
      this.fitOverview()
    } catch (error) {
      if (version === this.routeVersion && this.pageVisible !== false && !this.disposed && this.data.selected && this.data.selected.id === selected.id) {
        const message = campus.errorText(error)
        this.setData({ routeLoading: false, route: null, polyline: [], stepList: [],
          routeError: /无法连通|路网|距.*道路/.test(message)
            ? '所选起点与目的地之间暂无连通的校园道路，请更换起点' : message + '，可稍后点击“出发”重试' })
      }
    } finally {
      if (this.routeRequest === request) this.routeRequest = null
    }
  },
  invalidateRoute() {
    this.routeVersion = (this.routeVersion || 0) + 1
    if (this.routeRequest && this.routeRequest.abort) this.routeRequest.abort()
    this.routeRequest = null
    this.setData({ routeLoading: false })
  },
  clearRoute() { this.departureVersion = (this.departureVersion || 0) + 1; this.invalidateRoute(); this.setData({ route: null, polyline: [], routeError: '', stepList: [] }) },
  onMapUpdated() { if (!this.mapFitted && this.data.mapReady) { this.mapFitted = true; this.fitOverview() } },
  fitOverview(campusOnly) {
    if (this.disposed || !this.data.mapReady || !this.map || !this.map.includePoints) return
    let points = (this.campusBoundary || []).slice()
    if (!points.length) points = (this.campusSites || []).map(s => geo.calibrated(s.point, this.calibration, s.id)).filter(Boolean)
    if (!campusOnly) {
      this.data.polyline.forEach(line => { points = points.concat(line.points) })
      if (this.data.selected && this.data.selected.mapPoint) points.push(this.data.selected.mapPoint)
      if (this.data.selected && this.data.origin && this.data.origin.mapPoint) points.push(this.data.origin.mapPoint)
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
