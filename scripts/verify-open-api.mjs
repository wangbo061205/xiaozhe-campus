import fs from 'node:fs/promises';

const base = process.env.CAMPUS_TEST_BASE || 'http://127.0.0.1:8080';
const rows = [];
const cache = new Map();
const arrays = data => Array.isArray(data) ? data : ['list', 'records', 'items', 'data'].reduce((result, key) => result.length ? result : (Array.isArray(data?.[key]) ? data[key] : []), []);
const getId = item => item?.id || item?._id;

async function call(key, parameters = {}) {
  const url = new URL('/api/v1/campus/' + key, base);
  for (const [name, value] of Object.entries(parameters)) if (value != null) url.searchParams.set(name, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  const json = await response.json();
  if (!response.ok || json.code !== 0) {
    const error = new Error(json.message || 'HTTP ' + response.status);
    error.code = json.errorCode || json.code;
    error.requestId = json.requestId;
    throw error;
  }
  return json.data;
}

async function cached(key, parameters) {
  if (!cache.has(key)) cache.set(key, await call(key, parameters));
  return cache.get(key);
}

const catalogResponse = await fetch(base + '/api/v1/campus/catalog');
const catalog = (await catalogResponse.json()).data;
if (catalog.length !== 45) throw new Error('Expected 45 open endpoints');
const campuses = await cached('campus.list');
const selected = campuses[0];
const campusId = getId(selected);
const categories = arrays(await cached('category.with-sites'));
const sites = categories.flatMap(category => arrays(category.list));
const firstSite = sites.find(site => site.campus_id === campusId) || sites[0];
const listParameters = { page: 1, pageSize: 20, current: 1, size: 20 };
for (const key of ['activity.list', 'club.list', 'dormitory.list', 'lottery.list', 'comment-room.list']) await cached(key, listParameters);

for (const endpoint of catalog.filter(item => !item.personal)) {
  const key = endpoint.key;
  const started = Date.now();
  let parameters = { ...listParameters };
  if (key.startsWith('site.') && key !== 'site.detail') parameters = { campus_id: campusId, content: '图书馆' };
  if (key === 'site.detail') parameters = { id: getId(firstSite) };
  if (key.startsWith('space.') || key === 'campus.map-calibration') parameters = { campusId, provider: 'tencent', keyword: '教室' };
  const detailGroup = ['activity', 'club', 'dormitory', 'lottery', 'comment-room'].find(group => key.startsWith(group + '.') && !['list', 'home', 'buildings', 'sites'].includes(key.split('.')[1]));
  if (detailGroup) {
    const id = getId(arrays(cache.get(detailGroup + '.list'))[0]);
    if (!id) { rows.push({ key, status: 'BLOCKED', reason: '列表暂无内容，详情缺少真实编号' }); continue; }
    parameters = { id, current: 1, size: 20 };
  }
  if (key === 'road.plan') parameters = {
    start_lat: selected.latitude, start_lng: selected.longitude,
    end_lat: selected.latitude + .0005, end_lng: selected.longitude + .0005,
    campus_ids: campusId, route_type: 'shortest'
  };
  try {
    const data = await cached(key, parameters);
    rows.push({ key, status: 'PASS', ms: Date.now() - started, count: arrays(data).length });
  } catch (error) { rows.push({ key, status: 'FAIL', code: error.code, reason: error.message, requestId: error.requestId }); }
}
for (const endpoint of catalog.filter(item => item.personal)) {
  const response = await fetch(base + '/api/v1/campus/' + endpoint.key, { method: endpoint.method });
  const json = await response.json();
  rows.push({ key: endpoint.key, status: response.status === 401 && json.errorCode === 'LOGIN_REQUIRED' ? 'AUTH_PASS' : 'FAIL',
    reason: '匿名请求隔离检查；个人数据需用户自行登录教务或兑换授权码' });
}
const report = { checkedAt: new Date().toISOString(), base, rows,
  summary: rows.reduce((counts, row) => ({ ...counts, [row.status]: (counts[row.status] || 0) + 1 }), {}) };
await fs.writeFile('docs/open-api-verification.json', JSON.stringify(report, null, 2) + '\n');
for (const row of rows) console.log([row.status.padEnd(10), row.key, row.reason || ''].join(' '));
console.log(JSON.stringify(report.summary));
if (rows.some(row => row.status === 'FAIL')) process.exitCode = 1;
