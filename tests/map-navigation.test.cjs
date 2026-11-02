const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const campus=require('../miniprogram/utils/campus')
const source=fs.readFileSync(path.join(__dirname,'../miniprogram/pages/map/map.js'),'utf8')
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {resolve,reject,promise}}
function create(call, wxOverrides = {}) {
  let page,locationCallbacks,stops=0
  vm.runInNewContext(source,{Page:p=>page=p,require:key=>key.endsWith('/campus')?{...campus,call}:
    key.endsWith('/map-location')?{createTracker(api,handlers){locationCallbacks=handlers;return {start:()=>Promise.resolve(page.location),stop(){stops++}}}}:
    require(path.join(__dirname,'../miniprogram/utils',path.basename(key))),
    wx:{getLocation(){},getStorageSync(){return ''},setStorageSync(){},...wxOverrides},getApp:()=>({globalData:{}}),setTimeout,clearTimeout,Date,console})
  page.setData=u=>Object.assign(page.data,u);page.pageVisible=true
  page.sheetMin=120;page.sheetMid=270;page.sheetMax=470;page.windowWidth=375
  page.data.campuses=[{id:'east',point:{latitude:38.49,longitude:106.1}}];page.data.campusId='east';page.data.mapReady=true
  page.campusBoundary=[{latitude:38.48,longitude:106.09},{latitude:38.5,longitude:106.12}]
  page.campusSites=[];page.allCategories=[];page.allSites=[]
  const fits=[];page.map={includePoints:o=>fits.push(o)}
  const destination={id:'library',title:'图书馆',point:{latitude:38.493,longitude:106.104}}
  page.selectSite(destination)
  page.location={latitude:38.49,longitude:106.1,timestamp:Date.now()}
  return {page,fits,destination,get handlers(){return locationCallbacks},get stops(){return stops}}
}
const route={points:[[106.1,38.49],[106.102,38.492],[106.104,38.493]],routeDistance:600,estimatedTime:8}

test('departure uses current GPS and keeps the full campus and route in the overview',async()=>{
  const calls=[];const h=create(async(key,args)=>{calls.push({key,args});return route})
  await h.page.depart()
  assert.equal(calls.length,1);assert.equal(calls[0].key,'road.plan')
  assert.equal(calls[0].args.start_lat,h.page.location.latitude)
  assert.equal(calls[0].args.end_lng,h.destination.point.longitude)
  assert.equal(h.page.data.navigationActive,true);assert.equal(h.page.data.route.distance,'600 米')
  const points=h.fits.at(-1).points
  for(const point of [...h.page.campusBoundary,...h.page.data.polyline[0].points]) assert.ok(points.some(p=>p.latitude===point.latitude&&p.longitude===point.longitude))
  assert.equal(h.page.data.scale,16,'selecting a destination must preserve an overview')
})
test('live GPS is converted back from display calibration before planning',async()=>{
  let planned
  const h=create(async(key,args)=>{planned=args;return route})
  h.page.calibration={enabled:true,deltaLat:.0001,deltaLng:-.0002}
  await h.page.depart()
  assert.equal(planned.start_lat,h.page.location.latitude-.0001)
  assert.equal(planned.start_lng,h.page.location.longitude+.0002)
  assert.equal(planned.end_lat,h.destination.point.latitude)
})
test('new GPS samples update the origin without duplicate in-flight route requests',async()=>{
  const pending=deferred(),calls=[]
  const h=create((key,args)=>{calls.push(args);return pending.promise})
  const first=h.page.depart();await new Promise(setImmediate)
  h.handlers.onPosition({latitude:38.491,longitude:106.101,timestamp:Date.now()})
  assert.equal(calls.length,1)
  pending.resolve(route);await first
  await h.page.planRoute(false)
  assert.equal(calls.length,2);assert.equal(calls[1].start_lat,38.491)
})
test('switching destinations and hiding invalidates late route results',async()=>{
  for(const action of ['destination','hide']){
    const pending=deferred(),h=create(()=>pending.promise)
    const first=h.page.depart();await new Promise(setImmediate)
    if(action==='destination')h.page.selectSite({id:'food',title:'食堂',point:{latitude:38.495,longitude:106.105}})
    else h.page.onHide()
    pending.resolve(route);await first
    assert.equal(h.page.data.route,null);assert.equal(h.page.data.polyline.length,0)
    assert.equal(h.page.data.routeLoading,false);assert.ok(h.stops>0)
  }
})
test('a permission rejection and a changed destination cannot route from a stale origin',async()=>{
  const h=create(async()=>{throw new Error('should not plan')})
  h.page.locationTracker={start:()=>Promise.reject(new Error('定位未授权')),stop(){}}
  await h.page.depart();assert.equal(h.page.data.navigationActive,false);assert.match(h.page.data.routeError,/未授权/)
  const locating=deferred();h.page.locationTracker={start:()=>locating.promise,stop(){}}
  const first=h.page.depart();h.page.selectSite({id:'other',title:'其他目的地',point:{latitude:38.495,longitude:106.106}})
  locating.resolve(h.page.location);await first
  assert.equal(h.page.data.navigationActive,false)
})
test('a route failure remains visible and preserves the selected destination',async()=>{
  const h=create(async()=>{throw new Error('路网无法连通')})
  await h.page.depart()
  assert.equal(h.page.data.selected.id,'library');assert.equal(h.page.data.routeLoading,false)
  assert.match(h.page.data.routeError,/暂无连通.*微信地图/)
  assert.equal(h.page.data.polyline.length,0)
})
test('arrival clears the previous line instead of drawing an invented short route',async()=>{
  const h=create(async()=>{throw new Error('should not call')})
  h.page.location={...h.destination.point,timestamp:Date.now()}
  await h.page.depart()
  assert.equal(h.page.data.route.distance,'已到达目的地');assert.equal(h.page.data.polyline.length,0)
})

test('offline departure opens the calibrated destination without waiting for the unreachable backend',async()=>{
  const opened=[]
  const h=create(async()=>{throw new Error('must not call the local backend')},{openLocation(options){opened.push(options);options.success()}})
  h.page.setData({offlineData:true})
  h.page.calibration={enabled:true,deltaLat:.0001,deltaLng:-.0002}
  h.page.selectSite(h.destination)
  h.page.locationTracker={start:()=>new Promise(()=>{}),stop(){}}
  await h.page.depart()
  assert.equal(opened.length,1)
  assert.equal(opened[0].name,'图书馆')
  assert.equal(opened[0].latitude,h.destination.point.latitude+.0001)
  assert.equal(opened[0].longitude,h.destination.point.longitude-.0002)
  assert.equal(h.page.data.routeLoading,false)
  assert.equal(h.page.data.nativeNavigation,true)
  assert.equal(h.page.data.navigationActive,false)
  assert.equal(h.page.data.polyline.length,0)
  assert.match(h.page.data.routeNotice,/已打开微信地图/)
})

test('a disconnected road network or network timeout opens WeChat map only after a departure tap',async()=>{
  for(const message of ['路网无法连通','校园服务响应超时']){
    const opened=[]
    const h=create(async()=>{throw new Error(message)},{openLocation(options){opened.push(options);options.success()}})
    await h.page.depart()
    assert.equal(opened.length,1,message)
    assert.equal(h.page.data.routeLoading,false)
    assert.equal(h.page.data.routeError,'')
    assert.equal(h.page.data.selected.id,'library')
    assert.equal(h.page.data.route,null)
    assert.equal(h.page.data.polyline.length,0)
  }
  const opened=[]
  const h=create(async()=>{throw new Error('网络暂时不可用')},{openLocation(o){opened.push(o);o.success()}})
  h.page.setData({navigationActive:true})
  await h.page.planRoute(false)
  assert.equal(opened.length,0,'background GPS refresh must not open another map')
  assert.equal(h.page.data.navigationActive,false)
  assert.equal(h.page.data.nativeNavigation,true)
  await h.page.depart()
  assert.equal(opened.length,1)
})

test('hiding or changing destination cancels the actual route request and prevents late native navigation',async()=>{
  for(const action of ['hide','destination']){
    const pending=deferred(),opened=[];let aborts=0
    pending.promise.abort=()=>{aborts++;pending.reject(new Error('request aborted'))}
    const h=create(()=>pending.promise,{openLocation(o){opened.push(o);o.success()}})
    const first=h.page.depart();await new Promise(setImmediate)
    if(action==='hide')h.page.onHide()
    else h.page.selectSite({id:'food',title:'食堂',point:{latitude:38.495,longitude:106.105}})
    await first
    assert.equal(aborts,1)
    assert.equal(opened.length,0)
    assert.equal(h.page.data.routeLoading,false)
    assert.equal(h.page.data.routeError,'')
  }
})

test('native map success survives page hiding, rejects duplicate taps, and recovers after permission failure',async()=>{
  let opening;const h=create(async()=>route,{openLocation(o){opening=o}})
  h.page.setData({offlineData:true})
  const first=h.page.depart()
  await h.page.depart()
  assert.equal(h.page.data.routeLoading,true)
  h.page.onHide();opening.success();await first
  assert.equal(h.page.data.routeLoading,false)
  assert.match(h.page.data.routeNotice,/已打开微信地图/)
  h.page.pageVisible=true
  const denied=h.page.depart();opening.fail({errMsg:'openLocation:fail privacy permission denied'});await denied
  assert.equal(h.page.data.routeLoading,false)
  assert.match(h.page.data.routeError,/权限/)
  assert.equal(h.page.data.routeNotice,'')
  const retry=h.page.depart();opening.success();await retry
  assert.equal(h.page.data.routeError,'')
})
