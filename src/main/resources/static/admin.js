(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const SESSION_KEY = 'campus-admin.session.v1';
  const icons = {
    school:'<path d="m3 10 9-7 9 7v11H3z"/><path d="M9 21v-6h6v6M3 10h18M8 10v2m8-2v2M12 6v3"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    bag:'<rect x="5" y="7" width="14" height="14" rx="3"/><path d="M9 7V5a3 3 0 0 1 6 0v2M9 12h6m-8 4h10"/>',
    message:'<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/><path d="M8 10h8m-8 4h5"/>',
    ticket:'<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4Z"/><path d="M14 5v2m0 4v2m0 4v2"/>',
    book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 3H20v19H6.5A2.5 2.5 0 0 1 4 19.5v-14A2.5 2.5 0 0 1 6.5 3Z"/><path d="M8 7h7m-7 4h5"/>',
    shield:'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
    lock:'<rect x="4" y="10" width="16" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
    eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
    chevron:'<path d="m9 6 6 6-6 6"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5M21 12H9"/>',
    search:'<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
    refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 6.1A8 8 0 0 1 19.4 9L20 12M4 12l.6 3A8 8 0 0 0 18 18"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
    edit:'<path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    wallet:'<path d="M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v12H6a3 3 0 0 1-3-3V6"/><path d="M20 12h-4v5h4m-2-2.5h.1"/>',
    chart:'<path d="M3 3v18h18M7 14l4-4 4 3 5-7"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    alert:'<path d="m10.3 3.9-8.2 14A2 2 0 0 0 3.8 21h16.4a2 2 0 0 0 1.7-3.1l-8.2-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>',
    inbox:'<path d="M4 3h16l2 12v6H2v-6ZM2 15h6l2 3h4l2-3h6"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.grid}</svg>`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pageInfo = {
    overview:['运营概览','查看模型用量与成本，有序推进校园服务。'],
    lostfound:['失物招领','审核寻物与招领信息，帮助每一份遗失找到回应。'],
    feedback:['用户反馈','汇集同学的意见与建议，发现需要完善的服务。'],
    tickets:['服务工单','跟进人工求助，从接收、处理到解决。'],
    knowledge:['知识库','维护准确、有来源的校园信息与办事指南。'],
    assistant:['小折助手设置','设定小程序与独立网页助手的名称、开场白与知识来源。']
  };
  const knowledgeTypes = {NOTICE:'通知公告',POLICY:'政策文件',GUIDE:'办事指南',FAQ:'常见问题',SERVICE:'校园服务',PLACE:'校园地点',DEPARTMENT:'学校部门'};
  const feedbackTypes = {USEFUL:'内容有用',USELESS:'内容无用',ERROR_REPORT:'内容有误',MISSING_CONTENT:'未找到内容',OTHER:'意见建议'};
  const ticketTypes = {ACCOUNT:'账号卡证',COURSE:'教学教务',DORM:'宿舍后勤',PAYMENT:'缴费资助',OTHER:'其他'};
  const statusNames = {
    PENDING_REVIEW:['amber','待审核'],PUBLISHED:['blue','已发布'],REMOVED:['red','已下架'],CLAIMED:['blue','已认领'],CLOSED:['neutral','已关闭'],
    OPEN:['amber','待处理'],HANDLING:['blue','处理中'],IN_PROGRESS:['blue','处理中'],RESOLVED:['blue','已解决'],DRAFT:['neutral','草稿'],EXPIRED:['red','已过期'],ARCHIVED:['neutral','已归档']
  };
  const filters = {
    lostfound:[['PENDING_REVIEW','待审核'],['PUBLISHED','已发布'],['','全部信息']],
    feedback:[['','全部反馈'],['OPEN','待处理'],['RESOLVED','已解决']],
    tickets:[['','全部工单'],['OPEN','待处理'],['HANDLING','处理中'],['RESOLVED','已解决']],
    knowledge:[['','全部内容'],['PENDING_REVIEW','待发布'],['PUBLISHED','已发布'],['EXPIRED','已下架']]
  };
  const state = { user:null,page:'overview',rows:[],data:null,search:'',type:'',filter:'',loading:false,epoch:0,loadVersion:0,imageVersion:0,controller:null,images:new Set(),editor:null,editorBusy:false,assistantBusy:false,confirmResolve:null,kbPage:0,kbSize:50,kbTotal:0,searchTimer:null };
  const count = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('zh-CN') : '—';
  const cost = value => value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value).toLocaleString('zh-CN',{minimumFractionDigits:4,maximumFractionDigits:4}) : '—';
  const time = value => { const d = new Date(value); return value && Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d) : '—'; };
  const sourceDate = value => { const d=new Date(value);return value&&Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(d):'未标注发布日期'; };
  const sourceLink = value => { try { const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:''; }catch{return '';} };
  const siteNames = {www:'学校主站',xww:'新闻网',jwc:'教务处',yjsc:'研究生院',kyc:'科研处',gjhzjl:'国际合作处',dsjy:'党史专题',en:'英文站'};
  const idOf = value => { if (!/^\d+$/.test(String(value))) throw new Error('记录编号无效，请刷新列表。'); return String(value); };
  const chip = (status, text) => { const [tone,label] = statusNames[status] || ['neutral',status || '未设置']; return `<span class="chip ${tone}">${esc(text || label)}</span>`; };
  const action = (name,id,label,type='',glyph='') => `<button class="text-button ${type}" data-action="${name}" data-id="${esc(id)}">${glyph ? icon(glyph) : ''}${esc(label)}</button>`;
  const normalError = error => error.name !== 'AbortError' && !error.authHandled;

  function fillIcons(root=document) { root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
  function toast(message,error=false) {
    const item = document.createElement('div'); item.className = 'toast' + (error ? ' error' : '');
    item.innerHTML = icon(error ? 'alert' : 'check'); const text=document.createElement('span'); text.textContent=message; item.append(text); $('#toast-region').replaceChildren(item);
    setTimeout(() => item.remove(),4500);
  }
  function releaseImages() {
    state.imageVersion++;
    if ($('#image-dialog').open) $('#image-dialog').close();
    $('#preview-image').removeAttribute('src');
    state.images.forEach(url => URL.revokeObjectURL(url)); state.images.clear();
  }
  function endSession(message='') {
    clearTimeout(state.searchTimer);state.searchTimer=null;
    state.epoch++; state.user=null; state.loadVersion++; state.controller?.abort(); releaseImages();
    if (state.confirmResolve) resolveConfirm(false);
    if ($('#knowledge-dialog').open) $('#knowledge-dialog').close();
    state.editor=null; state.editorBusy=false; state.assistantBusy=false;
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Session-only storage can be unavailable. */ }
    $('#workspace').hidden=true; $('#login-view').hidden=false; $('#page-content').innerHTML=''; $('#password').value='';
    $('#account-name').textContent=''; $('#account-role').textContent='';
    $('#login-error').textContent=message; $('#login-error').hidden=!message;
    $('#username').focus();
  }
  async function request(path,{method='GET',body,signal,anonymous=false,image=false}={}) {
    const epoch=state.epoch;
    const headers={};
    if (!anonymous && state.user?.token) headers.Authorization='Bearer '+state.user.token;
    if (body !== undefined) headers['Content-Type']='application/json';
    let response;
    try { response=await fetch(path,{method,headers,body:body === undefined ? undefined : JSON.stringify(body),signal,cache:'no-store'}); }
    catch(error) { if (error.name==='AbortError') throw error; throw new Error('连接失败，请检查网络或稍后重试。'); }
    if (epoch!==state.epoch) throw new DOMException('Session changed','AbortError');
    if (!anonymous && (response.status===401 || response.status===403)) {
      const error=new Error(response.status===403 ? '当前账号没有管理权限，请使用管理员账号登录。' : '登录已过期，请重新登录。');
      error.authHandled=true; endSession(error.message); throw error;
    }
    if (image) { if (!response.ok) throw new Error('图片加载失败'); return response.blob(); }
    let result; try { result=await response.json(); } catch { throw new Error('服务返回异常，请稍后重试。'); }
    if (!response.ok || result.code!==0) throw new Error(result.message || `请求失败（${response.status}）`);
    return result.data;
  }
  function showWorkspace(user) {
    state.user=user; state.epoch++; state.page='overview'; state.filter=''; state.search='';state.type='';
    $('#login-view').hidden=true; $('#workspace').hidden=false;
    $('#account-name').textContent=user.displayName || '管理员'; $('#account-role').textContent=user.role==='MODERATOR' ? '内容审核员' : '管理员';
    document.querySelectorAll('[data-admin-only]').forEach(element=>element.hidden=user.role!=='ADMIN');
    renderLayout(); loadData();
  }
  async function login(event) {
    event.preventDefault();
    const username=$('#username').value.trim(),password=$('#password').value;
    if (!username || !password) return;
    const button=$('#login-submit');button.disabled=true;button.querySelector('span').textContent='正在登录…'; $('#login-error').hidden=true;
    try {
      const user=await request('/api/v1/auth/login',{method:'POST',body:{username,password},anonymous:true});
      if (!user || !['ADMIN','MODERATOR'].includes(user.role) || typeof user.token!=='string' || !user.token) throw new Error('该账号没有管理权限，请使用管理员或审核员账号。');
      try { sessionStorage.setItem(SESSION_KEY,JSON.stringify(user)); } catch { /* A nonpersistent session still works in this tab. */ }
      $('#password').value='';showWorkspace(user);
    } catch(error) { $('#login-error').textContent=error.message;$('#login-error').hidden=false; }
    finally { button.disabled=false;button.querySelector('span').textContent='登录工作台'; }
  }
  function navigate(page) {
    if (!state.user || !pageInfo[page] || (page==='assistant'&&state.user.role!=='ADMIN')) return;
    if(state.assistantBusy){toast('正在保存助手设置，请稍候。');return;}
    if (state.confirmResolve) resolveConfirm(false);
    clearTimeout(state.searchTimer);state.searchTimer=null;
    state.page=page;state.search='';state.type='';state.filter=page==='lostfound'?'PENDING_REVIEW':'';
    state.kbPage=0;state.kbTotal=0;
    state.rows=[];state.data=null;renderLayout();loadData();
  }
  function heading() {
    const [title,description]=pageInfo[state.page];
    return `<div class="page-heading"><div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions"><span class="updated-label">${icon('clock')}<span id="updated-time">等待更新</span></span><button class="button" data-action="refresh">${icon('refresh')}刷新</button>${state.page==='knowledge'?`<button class="button primary" data-action="create">${icon('plus')}新建条目</button>`:''}</div></div>`;
  }
  function toolbar() {
    const types=state.page==='knowledge'?knowledgeTypes:state.page==='feedback'?feedbackTypes:state.page==='tickets'?ticketTypes:null;
    const knowledge=state.page==='knowledge';
    return `<div class="list-toolbar${knowledge?' knowledge-toolbar':''}"><div class="filter-group" role="group" aria-label="状态筛选">${filters[state.page].map(([value,label])=>`<button data-filter="${value}" aria-pressed="${state.filter===value}">${label}</button>`).join('')}</div><div class="toolbar-end">${types?`<select id="type-filter" aria-label="类型筛选"><option value="">全部类型</option>${Object.entries(types).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select>`:''}<label class="list-search">${icon('search')}<input id="list-search" type="search" aria-label="${knowledge?'搜索全部知识库':'搜索当前列表'}" placeholder="${knowledge?'搜索全部标题、正文和来源':'搜索标题、内容或来源'}"></label></div></div>`;
  }
  function renderLayout() {
    releaseImages();
    $('#breadcrumb-current').textContent=pageInfo[state.page][0];
    $('#main-nav').querySelectorAll('[data-page]').forEach(button=>{ if(button.dataset.page===state.page) button.setAttribute('aria-current','page');else button.removeAttribute('aria-current'); });
    $('#page-content').innerHTML=heading()+(['overview','assistant'].includes(state.page)?'<div id="data-body"></div>':toolbar()+'<div id="data-body" class="card"></div>');
  }
  function stateView(kind,title,description,retry=false) {
    return `<div class="state-view ${kind}" role="${kind==='error'?'alert':'status'}"><div class="state-symbol">${kind==='loading'?'<span class="spinner"></span>':icon(kind==='error'?'alert':'inbox')}</div><h2>${esc(title)}</h2><p>${esc(description)}</p>${retry?`<button class="button" data-action="refresh">${icon('refresh')}重新加载</button>`:''}</div>`;
  }
  async function loadData() {
    if(!state.user || (state.page==='assistant'&&state.assistantBusy))return;
    clearTimeout(state.searchTimer);state.searchTimer=null;
    const page=state.page,version=++state.loadVersion,epoch=state.epoch;
    state.controller?.abort();state.controller=new AbortController();releaseImages();state.loading=true;
    $('#data-body').innerHTML=stateView('loading','正在加载','请稍候，正在获取最新数据。');$('#data-body').setAttribute('aria-busy','true');
    $('#page-content').querySelectorAll('[data-action="refresh"]').forEach(button=>button.disabled=true);
    const params=new URLSearchParams();if(state.filter && page!=='feedback')params.set('status',state.filter);
    if(page==='knowledge'){params.set('page',state.kbPage);params.set('size',state.kbSize);if(state.search.trim())params.set('q',state.search.trim());if(state.type)params.set('type',state.type);}
    const endpoints={overview:'/api/v1/admin/usage',lostfound:'/api/v1/lost-found/admin/all',feedback:'/api/v1/feedback/admin',tickets:'/api/v1/admin/tickets',knowledge:'/api/v1/admin/knowledge/page',assistant:'/api/v1/admin/assistant-settings'};
    try {
      const signal=state.controller.signal;
      const data=await request(endpoints[page]+(params.size?'?'+params.toString():''),{signal});
      if(version!==state.loadVersion || epoch!==state.epoch || page!==state.page)return;
      state.loading=false;state.data=data;state.rows=Array.isArray(data)?data:[];
      if(page==='knowledge'){
        if(!data||!Array.isArray(data.items)||!Number.isInteger(data.total)||data.total<0||!Number.isInteger(data.page)||data.page<0||!Number.isInteger(data.size)||data.size<1)throw new Error('知识库分页数据异常，请刷新重试。');
        state.rows=data.items;state.kbTotal=data.total;state.kbPage=data.page;state.kbSize=data.size;
        if(state.kbPage>0&&state.kbPage>=Math.ceil(state.kbTotal/state.kbSize)){state.kbPage=Math.max(0,Math.ceil(state.kbTotal/state.kbSize)-1);loadData();return;}
      }
      if(!['overview','assistant','knowledge'].includes(page)&&!Array.isArray(data))throw new Error('列表数据格式异常，请刷新重试。');
      if(page==='assistant'&&(!data||typeof data!=='object'||Array.isArray(data)))throw new Error('助手设置格式异常，请刷新重试。');
      if(page==='overview')renderOverview(data||{});else if(page==='assistant')renderAssistant(data);else renderRows();
      $('#updated-time').textContent='更新于 '+new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
    } catch(error) { if(version===state.loadVersion && epoch===state.epoch && normalError(error)) {state.loading=false;state.rows=[];$('#data-body').innerHTML=stateView('error','暂时无法加载',error.message,true);} }
    finally { if(version===state.loadVersion && epoch===state.epoch && $('#data-body')) { $('#data-body').setAttribute('aria-busy','false');$('#page-content').querySelectorAll('[data-action="refresh"]').forEach(button=>button.disabled=false); } }
  }
  function searchKnowledge() {
    clearTimeout(state.searchTimer);state.kbPage=0;state.loadVersion++;state.controller?.abort();state.loading=true;
    $('#data-body').innerHTML=stateView('loading','正在搜索知识库','按全部标题、正文和来源检索。');$('#data-body').setAttribute('aria-busy','true');
    state.searchTimer=setTimeout(()=>{state.searchTimer=null;if(state.page==='knowledge'&&state.user)loadData();},300);
  }
  function renderAssistant(data) {
    const suggestions=Array.isArray(data.suggestions)?data.suggestions:[];
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    $('#data-body').innerHTML=`<div class="assistant-layout"><form id="assistant-form" class="assistant-form" novalidate>
      <section class="card"><header class="card-heading"><div><h2>认识你的助手</h2><p>名称和开场白会显示在小程序与独立网页。</p></div><a class="text-button" href="/xiaozhe.html" target="_blank" rel="noopener">预览小折网页</a></header><div class="assistant-fields">
        <label for="assistant-name">助手名称 <span class="required">*</span></label><input id="assistant-name" name="name" maxlength="40" required value="${esc(data.name)}" placeholder="小折">
        <label for="assistant-greeting">欢迎语 <span class="required">*</span></label><textarea id="assistant-greeting" name="greeting" rows="3" maxlength="1200" required placeholder="用一句温暖的问候，邀请同学开始聊天。">${esc(data.greeting)}</textarea>
        <label for="assistant-persona">角色与说话风格 <span class="required">*</span></label><p id="persona-hint" class="assistant-hint">描述助手的性格、语气和擅长的帮助方式。例如：耐心倾听，先回应感受，再一起梳理可行的小步骤。</p><textarea id="assistant-persona" name="personaPrompt" rows="7" maxlength="8000" required aria-describedby="persona-hint" placeholder="你希望它是一位怎样的校园伙伴？">${esc(data.personaPrompt)}</textarea>
        <label for="assistant-suggestions">开场建议</label><p id="suggestions-hint" class="assistant-hint">每行一条，填写 1–6 条，每条最多 100 字。</p><textarea id="assistant-suggestions" name="suggestions" rows="4" maxlength="605" aria-describedby="suggestions-hint">${esc(suggestions.join('\n'))}</textarea>
      </div></section>
      <section class="card"><header class="card-heading"><div><h2>知识与陪伴</h2><p>让回答有依据，也让表达更体贴。</p></div></header><div class="assistant-fields">
        <label class="assistant-option"><span><strong>使用校园知识库回答</strong><small>检索已发布条目，回答时展示引用来源。草稿与下架内容不会参与回答。</small></span><input type="checkbox" name="knowledgeEnabled" ${data.knowledgeEnabled?'checked':''}></label>
        <button type="button" class="text-button assistant-knowledge-link" data-page="knowledge">${icon('book')}管理知识库${icon('chevron')}</button>
        <label class="assistant-option"><span><strong>温柔陪伴与情绪支持</strong><small>先倾听、接纳感受，再给出适度建议，陪同学一起缓解学习和生活中的压力。</small></span><input type="checkbox" name="emotionalSupportEnabled" ${data.emotionalSupportEnabled?'checked':''}></label>
        <label for="assistant-contact">学校心理支持联系信息</label><p id="contact-hint" class="assistant-hint">可填写已核实的心理中心名称、联系方式和服务时间；遇到需要线下支持的情况时供助手使用。没有可靠信息可留空。</p><textarea id="assistant-contact" name="supportContact" rows="3" maxlength="800" aria-describedby="contact-hint" placeholder="请填写学校提供并已核实的信息">${esc(data.supportContact)}</textarea>
        <label for="assistant-verified">联系信息核实日期</label><input id="assistant-verified" name="supportContactVerifiedAt" type="date" max="${today}" value="${esc(data.supportContactVerifiedAt||'')}"><p class="assistant-hint">填写了联系信息时，需同时注明最近核实日期。</p>
      </div></section>
      <div class="assistant-save-bar"><div><strong id="assistant-save-state" role="status">设置已加载</strong><span>保存后，后续对话与首页开场白将使用新设置。</span></div><button id="assistant-save" class="button primary" type="submit">${icon('check')}保存设置</button></div><p id="assistant-error" class="inline-error" role="alert" tabindex="-1" hidden></p>
    </form><aside class="assistant-preview"><section class="card"><header class="card-heading"><div><h2>首页开场预览</h2><p>在保存前看看问候的感觉。</p></div></header><div class="assistant-preview-content"><span class="assistant-avatar">${icon('message')}</span><span class="eyebrow">校园里的倾听伙伴</span><h3 id="assistant-preview-name"></h3><div id="assistant-preview-greeting" class="assistant-bubble"></div><div id="assistant-preview-suggestions" class="assistant-preview-suggestions"></div><p class="assistant-preview-caption">内容由 AI 生成</p></div></section><div class="info-note">${icon('shield')}<div><strong>安心陪伴，尊重边界</strong>情绪支持侧重倾听与疏解，不提供诊断或治疗。后台仅维护人设和公共知识，不展示同学的私人对话。</div></div></aside></div>`;
    updateAssistantPreview(false);
  }
  function updateAssistantPreview(dirty=true) {
    const form=$('#assistant-form');if(!form)return;
    $('#assistant-preview-name').textContent=form.elements.name.value.trim()||'你的校园助手';
    $('#assistant-preview-greeting').textContent=form.elements.greeting.value.trim()||'写下欢迎语，邀请同学开始聊天。';
    const container=$('#assistant-preview-suggestions');container.replaceChildren();
    form.elements.suggestions.value.split('\n').map(value=>value.trim()).filter(Boolean).slice(0,6).forEach(value=>{const item=document.createElement('span');item.textContent=value;container.append(item);});
    if(dirty){$('#assistant-save-state').textContent='有未保存的修改';$('#assistant-error').hidden=true;}
  }
  async function saveAssistant(event) {
    event.preventDefault();if(state.assistantBusy||state.user?.role!=='ADMIN')return;
    const form=event.target,epoch=state.epoch;
    const body=Object.fromEntries(['name','greeting','personaPrompt','supportContact'].map(key=>[key,form.elements[key].value.trim()]));
    body.suggestions=form.elements.suggestions.value.split('\n').map(value=>value.trim()).filter(Boolean);
    body.knowledgeEnabled=form.elements.knowledgeEnabled.checked;body.emotionalSupportEnabled=form.elements.emotionalSupportEnabled.checked;
    body.supportContactVerifiedAt=body.supportContact?(form.elements.supportContactVerifiedAt.value||null):null;
    if(state.data?.version!==undefined)body.version=state.data.version;
    let error='';
    if(!body.name||!body.greeting||!body.personaPrompt)error='请填写助手名称、欢迎语和角色与说话风格。';
    else if(body.name.length>40||body.greeting.length>1200||body.personaPrompt.length>8000||body.supportContact.length>800)error='部分内容超过字数限制，请适当精简。';
    else if(body.suggestions.length<1||body.suggestions.length>6||body.suggestions.some(value=>value.length>100))error='请填写 1–6 条开场建议，每条最多 100 字。';
    else if(body.supportContact&&!body.supportContactVerifiedAt)error='请填写心理支持联系信息的核实日期。';
    else if(body.supportContactVerifiedAt&&body.supportContactVerifiedAt>form.elements.supportContactVerifiedAt.max)error='核实日期不能晚于今天。';
    const errorElement=$('#assistant-error');
    if(error){errorElement.textContent=error;errorElement.hidden=false;errorElement.focus();return;}
    state.assistantBusy=true;errorElement.hidden=true;
    form.querySelectorAll('input,textarea,button').forEach(element=>element.disabled=true);
    $('#page-content').querySelectorAll('[data-action="refresh"]').forEach(button=>button.disabled=true);
    $('#assistant-save-state').textContent='正在保存…';
    try {
      const saved=await request('/api/v1/admin/assistant-settings',{method:'PUT',body});
      if(epoch!==state.epoch||state.page!=='assistant'||!form.isConnected)return;
      if(!saved||typeof saved!=='object'||Array.isArray(saved))throw new Error('保存响应异常，请重新加载确认设置。');
      state.data=saved;$('#assistant-save-state').textContent='已保存，后续对话立即生效';toast('助手设置已保存');
      if(!body.supportContact)form.elements.supportContactVerifiedAt.value='';
    }catch(error){if(epoch===state.epoch&&normalError(error)&&form.isConnected){errorElement.textContent=error.message;errorElement.hidden=false;$('#assistant-save-state').textContent='保存未完成，修改已保留';errorElement.focus();}}
    finally{if(epoch===state.epoch){state.assistantBusy=false;if(form.isConnected){form.querySelectorAll('input,textarea,button').forEach(element=>element.disabled=false);$('#page-content').querySelectorAll('[data-action="refresh"]').forEach(button=>button.disabled=false);}}}
  }
  function renderOverview(data) {
    const stats=[['今日模型成本','wallet',data.todayCostCny,true,`${count(data.todayCalls)} 次模型调用`],['近 7 天成本','chart',data.weekCostCny,true,'最近七天累计用量'],['累计模型成本','wallet',data.totalCostCny,true,'模型调用累计成本'],['累计调用次数','message',data.totalCalls,false,'覆盖问答、对话与内容生成']];
    const purposeNames={CHAT:'智能对话',chat:'智能对话',QA:'校园问答',qa:'校园问答',DRAFT:'文稿生成',draft:'文稿生成',AGENT:'任务助手',agent:'任务助手',unknown:'未分类'};
    const purposes=Array.isArray(data.byPurpose)?data.byPurpose:[],maxCost=Math.max(0,...purposes.map(item=>Number(item.costCny)||0));
    const table=purposes.length?`<div class="table-wrap"><table><thead><tr><th>调用用途</th><th class="numeric">调用次数</th><th class="numeric">累计成本 / 元</th></tr></thead><tbody>${purposes.map(item=>`<tr><td><span class="usage-purpose"><span class="purpose-mark"></span>${esc(purposeNames[item.purpose]||item.purpose||'未分类')}</span><div class="cost-bar"><span style="width:${maxCost?Math.min(100,Math.max(0,Number(item.costCny)/maxCost*100)):0}%"></span></div></td><td class="numeric">${count(item.calls)}</td><td class="numeric">${cost(item.costCny)}</td></tr>`).join('')}</tbody></table></div>`:stateView('empty','暂无模型调用','开始使用校园助手后，可在这里查看调用量与成本。');
    $('#data-body').innerHTML=`<div class="stats-grid">${stats.map(([title,glyph,value,money,note])=>`<article class="stat-card"><div class="stat-top"><span>${title}</span><span class="stat-icon">${icon(glyph)}</span></div><div class="stat-value">${money?'<small>¥</small>':''}${money?cost(value):count(value)}</div><div class="stat-note">${note}</div></article>`).join('')}</div><div class="overview-columns"><section class="card"><header class="card-heading"><div><h2>模型调用分布</h2><p>按用途统计调用次数与累计成本</p></div><span class="count-badge">${purposes.length} 项用途</span></header>${table}<div class="table-footer"><span>金额精确到小数点后四位</span><span>数据来自实际模型调用记录</span></div></section><aside class="overview-side"><section class="card"><header class="card-heading"><h2>常用管理</h2><span class="count-badge">快捷入口</span></header><div class="overview-links">${[['lostfound','bag','失物招领审核','核对物品描述与图片'],['tickets','ticket','跟进服务工单','推进待处理的校园求助'],['knowledge','book','维护校园知识','发布有来源的通知与指南']].map(([page,glyph,title,description])=>`<button class="overview-link" data-page="${page}"><span>${icon(glyph)}</span><span><strong>${title}</strong><small>${description}</small></span>${icon('chevron')}</button>`).join('')}</div></section><div class="info-note">${icon('shield')}<div><strong>信息准确，服务有序</strong>发布前核对内容来源，及时下架过期信息。后台仅展示运营所需的公开内容与服务摘要。</div></div></aside></div>`;
  }
  function filteredRows() {
    if(state.page==='knowledge')return state.rows;
    const search=state.search.trim().toLocaleLowerCase();
    return state.rows.filter(item=>(state.page!=='feedback'||!state.filter||item.status===state.filter)&&(!state.type||(state.page==='tickets'?item.category:item.type)===state.type)&&(!search||[item.title,item.content,item.description,item.detail,item.contactHint,item.sourceName,item.department].some(value=>String(value||'').toLocaleLowerCase().includes(search))));
  }
  function renderRows() {
    if(state.loading)return;
    releaseImages();const rows=filteredRows();
    const titles={lostfound:['物品信息','发布类型','状态','联系方式 / 时间','操作'],feedback:['反馈类型','反馈内容','状态','提交时间'],tickets:['工单信息','分类','状态','提交时间','操作'],knowledge:['内容标题','类型','状态','来源','操作']};
    const title={lostfound:'失物招领信息',feedback:'反馈记录',tickets:'人工求助工单',knowledge:'知识条目'}[state.page];
    const empty=state.search||state.type?'没有找到匹配的记录':'这里暂时没有记录';
    const body=rows.length?`<div class="table-wrap"><table><thead><tr>${titles[state.page].map(text=>`<th scope="col">${text}</th>`).join('')}</tr></thead><tbody>${rows.map(item=>renderRow(item)).join('')}</tbody></table></div>`:stateView('empty',empty,'可以调整筛选条件，或稍后刷新查看。');
    const knowledge=state.page==='knowledge',totalPages=Math.max(1,Math.ceil(state.kbTotal/state.kbSize));
    const footer=knowledge?`<div class="table-footer knowledge-pagination"><span aria-live="polite">共 ${count(state.kbTotal)} 条 · ${rows.length?`${count(state.kbPage*state.kbSize+1)}–${count(state.kbPage*state.kbSize+rows.length)}`:'0'} 条</span><nav aria-label="知识库分页"><button class="button" data-action="kb-prev" ${state.kbPage===0?'disabled':''}>上一页</button><span class="page-number">第 ${count(state.kbPage+1)} / ${count(totalPages)} 页</span><button class="button" data-action="kb-next" ${state.kbPage+1>=totalPages?'disabled':''}>下一页</button></nav></div>`:`<div class="table-footer"><span>显示 ${count(rows.length)} 条 / 已加载 ${count(state.rows.length)} 条</span><span>内容按当前条件展示</span></div>`;
    $('#data-body').innerHTML=`<header class="card-heading"><h2>${title}</h2><span class="count-badge">${count(knowledge?state.kbTotal:rows.length)} 条记录</span></header>${body}${footer}`;
    if(state.page==='lostfound')loadImages(rows);
  }
  function renderRow(item) {
    const id=idOf(item.id);
    if(state.page==='lostfound') {
      const paths=imagePaths(item.images);
      const buttons=item.status==='PUBLISHED'?action('lf-remove',id,'下架','danger'):item.status==='PENDING_REVIEW'?action('lf-approve',id,'通过发布','','check')+action('lf-remove',id,'下架','danger'):action('lf-approve',id,'恢复发布','','upload');
      return `<tr><td><strong class="cell-title">${esc(item.title)}</strong><p class="cell-description">${esc(item.description||'暂无物品描述')}</p>${paths.length?`<div class="lf-photos" data-photos="${id}">${paths.map((_,index)=>`<span class="photo-placeholder" data-photo-index="${index}">${icon('image')}</span>`).join('')}</div>`:''}</td><td><span class="chip type ${item.kind==='LOST'?'amber':'blue'}">${item.kind==='LOST'?'寻物启事':'物品招领'}</span></td><td>${chip(item.status)}</td><td class="cell-meta">${esc(item.contactHint||'未提供联系方式')}<br>${esc(time(item.createdAt))}</td><td><div class="row-actions">${buttons}</div></td></tr>`;
    }
    if(state.page==='feedback')return `<tr><td><span class="chip blue type">${esc(feedbackTypes[item.type]||item.type)}</span></td><td><div class="cell-content">${esc(item.content||'未填写详细内容')}</div></td><td>${chip(item.status)}</td><td class="cell-meta">${esc(time(item.createdAt))}</td></tr>`;
    if(state.page==='tickets')return `<tr><td><strong class="cell-title">${esc(item.title)}</strong><p class="cell-description">${esc(item.detail||'未填写详细内容')}</p><p class="cell-description">${esc(item.contactHint||'未提供联系方式')}</p></td><td><span class="chip type neutral">${esc(ticketTypes[item.category]||item.category)}</span></td><td>${chip(item.status)}</td><td class="cell-meta">${esc(time(item.createdAt))}</td><td><div class="row-actions">${item.status==='OPEN'?action('ticket-start',id,'开始处理'):''}${item.status==='HANDLING'?action('ticket-resolve',id,'标记解决','','check'):''}${!['CLOSED','RESOLVED'].includes(item.status)?action('ticket-close',id,'关闭','danger'):'<span class="cell-meta">已结束</span>'}</div></td></tr>`;
    const sourceUrl=sourceLink(item.sourceUrl),sourceMeta=[siteNames[item.sourceSite]||item.sourceSite,item.sourceCategory].filter(Boolean).join(' · ');
    return `<tr><td><strong class="cell-title">${esc(item.title)}</strong><p class="cell-description">${esc(item.summary||item.content?.slice(0,65)||'')}</p><p class="cell-description">${item.official?'官方来源 · ':''}版本 ${count(item.version||1)}</p></td><td><span class="chip type neutral">${esc(knowledgeTypes[item.type]||item.type)}</span></td><td>${chip(item.status)}</td><td class="cell-meta knowledge-source"><span>${esc(item.sourceName||'未标注来源')}</span>${sourceMeta?`<span>${esc(sourceMeta)}</span>`:''}${item.department?`<span>${esc(item.department)}</span>`:''}<span>${esc(sourceDate(item.publishedAt))}</span>${sourceUrl?`<a class="source-link" href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">查看原文${icon('arrow')}</a>`:''}</td><td><div class="row-actions">${action('kb-edit',id,'编辑','','edit')}${item.status==='PUBLISHED'?action('kb-expire',id,'下架','danger'):action('kb-publish',id,'发布','','upload')}</div></td></tr>`;
  }
  function imagePaths(value) {
    try {if(typeof value==='string')value=JSON.parse(value);}catch{return [];}
    return Array.isArray(value)?value.filter(path=>typeof path==='string'&&/^\/api\/v1\/lost-found\/images\/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(path)).slice(0,6):[];
  }
  async function loadImages(rows) {
    const version=state.imageVersion,epoch=state.epoch,signal=state.controller?.signal;
    await Promise.allSettled(rows.flatMap(item=>imagePaths(item.images).map(async(path,index)=>{
      const placeholder=$(`[data-photos="${idOf(item.id)}"] [data-photo-index="${index}"]`);if(!placeholder)return;
      try {
        const blob=await request(path,{image:true,signal});
        if(version!==state.imageVersion||epoch!==state.epoch||!placeholder.isConnected)return;
        const url=URL.createObjectURL(blob);state.images.add(url);
        const button=document.createElement('button');button.className='photo-button';button.type='button';button.setAttribute('aria-label',`查看${item.title||'物品'}图片 ${index+1}`);button.dataset.image=url;button.dataset.title=item.title||'物品图片';
        const image=document.createElement('img');image.src=url;image.alt=`${item.title||'物品'}图片 ${index+1}`;button.append(image);placeholder.replaceWith(button);
      }catch(error){if(normalError(error)&&version===state.imageVersion&&placeholder.isConnected){placeholder.textContent='加载失败';placeholder.title='图片加载失败，请刷新重试';}}
    })));
  }
  function resolveConfirm(accepted) { const resolve=state.confirmResolve;state.confirmResolve=null;if($('#confirm-dialog').open)$('#confirm-dialog').close();resolve?.(accepted); }
  function confirmAction(title,description,label) {
    if(state.confirmResolve)resolveConfirm(false);
    $('#confirm-title').textContent=title;$('#confirm-description').textContent=description;$('#confirm-proceed').textContent=label;$('#confirm-dialog').showModal();$('#confirm-cancel').focus();
    return new Promise(resolve=>state.confirmResolve=resolve);
  }
  function openEditor(item=null) {
    state.editor=item ? {...item} : {id:null};state.editorBusy=false;
    const form=$('#knowledge-form');form.reset();$('#editor-error').hidden=true;
    $('#editor-title').textContent=item?'编辑知识条目':'新建知识条目';
    ['type','title','summary','content','sourceName','sourceUrl','department'].forEach(key=>form.elements[key].value=item?.[key] || (key==='type'?'NOTICE':''));
    form.elements.official.checked=!!item?.official;
    let materials=[];try{materials=typeof item?.materials==='string'?JSON.parse(item.materials):item?.materials||[];}catch{materials=[];}
    form.elements.materials.value=Array.isArray(materials)?materials.join('\n'):'';
    $('#materials-field').hidden=form.elements.type.value!=='GUIDE';
    $('#save-knowledge').textContent=item?'保存修改':'保存待发布';
    $('#publish-knowledge').hidden=item?.status==='PUBLISHED';
    form.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=false);
    $('#knowledge-dialog').showModal();form.elements.title.focus();
  }
  async function saveKnowledge(event) {
    event.preventDefault();if(!state.editor||state.editorBusy)return;
    const form=event.currentTarget,editing=state.editor,epoch=state.epoch;
    const publish=event.submitter?.value==='publish';
    const body=Object.fromEntries(['type','title','summary','content','sourceName','sourceUrl','department'].map(key=>[key,form.elements[key].value.trim()]));
    body.official=form.elements.official.checked;
    body.materials=body.type==='GUIDE'?JSON.stringify(form.elements.materials.value.split('\n').map(s=>s.trim()).filter(Boolean)):editing.materials||null;
    if(!body.title||!body.content){$('#editor-error').textContent='请填写标题和正文。';$('#editor-error').hidden=false;return;}
    if(body.sourceUrl&&!/^https?:\/\//i.test(body.sourceUrl)){$('#editor-error').textContent='来源链接应以 https:// 或 http:// 开头。';$('#editor-error').hidden=false;return;}
    state.editorBusy=true;$('#editor-error').hidden=true;form.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);
    try {
      const item=await request('/api/v1/admin/knowledge'+(editing.id?'/'+idOf(editing.id):''),{method:editing.id?'PUT':'POST',body});
      if(epoch!==state.epoch)return;
      if(!item||!/^\d+$/.test(String(item.id)))throw new Error('保存响应缺少条目编号，请刷新列表确认保存状态。');
      // A successful create is remembered before publishing, so retry never creates duplicates.
      state.editor={...item};
      $('#editor-title').textContent='编辑知识条目';$('#save-knowledge').textContent='保存修改';
      if(publish){try{await request(`/api/v1/admin/knowledge/${idOf(item.id)}/publish`,{method:'POST'});}catch(error){if(normalError(error))error.message='内容已保存，发布未完成：'+error.message;throw error;}}
      if(epoch!==state.epoch)return;
      $('#knowledge-dialog').close();toast(publish?'内容已保存并发布':'修改已保存');loadData();
    }catch(error){if(epoch===state.epoch&&normalError(error)){$('#editor-error').textContent=error.message;$('#editor-error').hidden=false;}}
    finally{if(epoch===state.epoch){state.editorBusy=false;form.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=false);}}
  }
  async function runAction(button) {
    const name=button.dataset.action;if(!state.user)return;
    if(name==='refresh'){loadData();return;}if(name==='create'){openEditor();return;}
    if(name==='kb-prev'||name==='kb-next'){if(state.page!=='knowledge'||state.loading)return;const next=state.kbPage+(name==='kb-next'?1:-1);if(next<0||next>=Math.ceil(state.kbTotal/state.kbSize))return;state.kbPage=next;loadData();return;}
    const id=idOf(button.dataset.id),epoch=state.epoch,page=state.page;
    if(name==='kb-edit'){const item=state.rows.find(row=>String(row.id)===id);if(item)openEditor(item);return;}
    const actions={
      'lf-approve':[`/api/v1/lost-found/admin/lost-found/${id}/review?approve=true`,'信息已发布'],
      'lf-remove':[`/api/v1/lost-found/admin/lost-found/${id}/review?approve=false`,'信息已下架','下架这条物品信息？','下架后将不再显示在失物招领广场，可在后台恢复发布。','确认下架'],
      'ticket-start':[`/api/v1/admin/tickets/${id}/status?status=HANDLING`,'工单已开始处理'],
      'ticket-resolve':[`/api/v1/admin/tickets/${id}/status?status=RESOLVED`,'工单已标记解决'],
      'ticket-close':[`/api/v1/admin/tickets/${id}/status?status=CLOSED`,'工单已关闭','关闭这张服务工单？','请确认该工单无需继续处理，关闭后将结束当前处理流程。','关闭工单'],
      'kb-publish':[`/api/v1/admin/knowledge/${id}/publish`,'知识条目已发布'],
      'kb-expire':[`/api/v1/admin/knowledge/${id}/expire`,'知识条目已下架','下架这条知识内容？','下架后同学将无法查看该内容，后续可以重新发布。','确认下架']
    };
    const job=actions[name];if(!job)return;
    if(job[2]&&!await confirmAction(job[2],job[3],job[4]))return;
    if(epoch!==state.epoch||page!==state.page)return;
    button.disabled=true;
    try{await request(job[0],{method:'POST'});if(epoch===state.epoch){toast(job[1]);if(page===state.page)loadData();}}
    catch(error){if(normalError(error)&&epoch===state.epoch)toast(error.message,true);}
    finally{if(button.isConnected)button.disabled=false;}
  }

  fillIcons();
  $('#login-form').addEventListener('submit',login);
  $('#logout-button').addEventListener('click',()=>endSession());
  $('#toggle-password').addEventListener('click',()=>{const visible=$('#password').type==='password';$('#password').type=visible?'text':'password';$('#toggle-password').setAttribute('aria-pressed',String(visible));$('#toggle-password').setAttribute('aria-label',visible?'隐藏密码':'显示密码');});
  document.addEventListener('click',event=>{
    const navigation=event.target.closest('[data-page]');if(navigation){navigate(navigation.dataset.page);return;}
    const filter=event.target.closest('[data-filter]');if(filter){state.filter=filter.dataset.filter;state.kbPage=0;$('.filter-group').querySelectorAll('button').forEach(el=>el.setAttribute('aria-pressed',String(el===filter)));if(state.page==='feedback')renderRows();else loadData();return;}
    const button=event.target.closest('[data-action]');if(button){runAction(button).catch(error=>toast(error.message,true));return;}
    const close=event.target.closest('[data-close]');if(close){const dialog=document.getElementById(close.dataset.close);if(dialog.id==='knowledge-dialog'&&state.editorBusy)return;dialog.close();return;}
    const photo=event.target.closest('[data-image]');if(photo&&state.images.has(photo.dataset.image)){$('#preview-image').src=photo.dataset.image;$('#preview-image').alt=photo.dataset.title;$('#image-title').textContent=photo.dataset.title;$('#image-dialog').showModal();}
  });
  $('#page-content').addEventListener('input',event=>{if(event.target.id==='list-search'){state.search=event.target.value;if(state.page==='knowledge')searchKnowledge();else renderRows();}else if(event.target.closest('#assistant-form'))updateAssistantPreview();});
  $('#page-content').addEventListener('submit',event=>{if(event.target.id==='assistant-form')saveAssistant(event);});
  $('#page-content').addEventListener('change',event=>{if(event.target.id==='type-filter'){state.type=event.target.value;if(state.page==='knowledge'){state.kbPage=0;loadData();}else renderRows();}});
  $('#knowledge-form').addEventListener('submit',saveKnowledge);
  $('#knowledge-form').elements.type.addEventListener('change',()=>$('#materials-field').hidden=$('#knowledge-form').elements.type.value!=='GUIDE');
  $('#knowledge-dialog').addEventListener('cancel',event=>{if(state.editorBusy)event.preventDefault();});
  $('#image-dialog').addEventListener('close',()=>$('#preview-image').removeAttribute('src'));
  $('#confirm-cancel').addEventListener('click',()=>resolveConfirm(false));
  $('#confirm-proceed').addEventListener('click',()=>resolveConfirm(true));
  $('#confirm-dialog').addEventListener('cancel',event=>{event.preventDefault();resolveConfirm(false);});
  window.addEventListener('pagehide',()=>{clearTimeout(state.searchTimer);state.controller?.abort();releaseImages();});
  // Only a dedicated admin session is restored; no mini-program visitor token is accepted here.
  try {
    const saved=JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if(saved&&['ADMIN','MODERATOR'].includes(saved.role)&&typeof saved.token==='string'&&saved.token)showWorkspace(saved);
  }catch{ /* Missing or invalid admin sessions start at the login form. */ }
})();
