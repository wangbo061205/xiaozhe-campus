(() => {
  'use strict';

  const IDENTITY_KEY = 'campus.xiaozhe.identity.v1';
  const CONVERSATION_KEY = 'campus.xiaozhe.conversation.v1';
  const DEFAULT_GREETING = '你好，我是小折。校园里的问题、学习压力，或者今天的心情，都可以慢慢和我说。';
  const DEFAULT_SUGGESTIONS = [
    '今天有点累，想找人聊聊',
    '临近期末，帮我安排复习节奏',
    '校园卡丢了该怎么办？',
    '我想了解学校的办事指南'
  ];

  const $ = selector => document.querySelector(selector);
  const state = {
    token: '',
    sessionPromise: null,
    sessionId: '',
    messages: [],
    name: '小折',
    greeting: DEFAULT_GREETING,
    suggestions: DEFAULT_SUGGESTIONS.slice(),
    emotionalSupportEnabled: true,
    sending: false
  };

  const elements = {
    brandName: $('#brand-name'),
    assistantName: $('#assistant-name'),
    assistantStatus: $('#assistant-status'),
    connectionIndicator: $('#connection-indicator'),
    serviceStatus: $('#service-status-text'),
    retryConnection: $('#retry-connection'),
    chatBody: $('#chat-body'),
    messageList: $('#message-list'),
    typing: $('#typing-indicator'),
    requestError: $('#request-error'),
    quickPrompts: $('#quick-prompts'),
    composeForm: $('#compose-form'),
    input: $('#chat-input'),
    sendButton: $('#send-button'),
    newChat: $('#new-chat'),
    disclaimer: $('#disclaimer-text'),
    sourceDialog: $('#source-dialog'),
    sourceTitle: $('#source-title'),
    sourceMeta: $('#source-meta'),
    sourceContent: $('#source-content'),
    sourceLink: $('#source-link')
  };

  function readStorage(storage, key) {
    try { return storage.getItem(key); } catch (_) { return null; }
  }

  function writeStorage(storage, key, value) {
    try { storage.setItem(key, value); } catch (_) { /* Conversation still works for this page. */ }
  }

  function removeStorage(storage, key) {
    try { storage.removeItem(key); } catch (_) { /* Storage may be unavailable in private mode. */ }
  }

  function text(value, fallback, maxLength) {
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : fallback;
  }

  function readIdentity() {
    const raw = readStorage(localStorage, IDENTITY_KEY);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      if (value && typeof value.guestId === 'string' && typeof value.guestSecret === 'string') return value;
    } catch (_) { /* Invalid local state is replaced with a new guest identity. */ }
    removeStorage(localStorage, IDENTITY_KEY);
    return null;
  }

  function restoreConversation() {
    const raw = readStorage(sessionStorage, CONVERSATION_KEY);
    if (!raw) return;
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object') return;
      if (typeof value.sessionId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value.sessionId)) state.sessionId = value.sessionId;
      if (!Array.isArray(value.messages)) return;
      state.messages = value.messages.slice(-80).filter(item => {
        return item && (item.role === 'user' || item.role === 'assistant') && typeof item.text === 'string';
      }).map(item => ({
        role: item.role,
        text: item.text.slice(0, 10000),
        welcome: item.welcome === true,
        sources: Array.isArray(item.sources) ? item.sources.slice(0, 6).filter(source => source && Number.isSafeInteger(Number(source.id)) && typeof source.title === 'string').map(source => ({
          id: Number(source.id), title: source.title.slice(0, 200), sourceName: typeof source.sourceName === 'string' ? source.sourceName.slice(0, 120) : ''
        })) : []
      }));
    } catch (_) {
      state.messages = [];
      state.sessionId = '';
      removeStorage(sessionStorage, CONVERSATION_KEY);
    }
  }

  function saveConversation() {
    state.messages = state.messages.slice(-80);
    writeStorage(sessionStorage, CONVERSATION_KEY, JSON.stringify({ sessionId: state.sessionId, messages: state.messages }));
  }

  async function readEnvelope(response) {
    let envelope;
    try { envelope = await response.json(); } catch (_) { envelope = null; }
    if (!response.ok || !envelope || envelope.code !== 0) {
      const error = new Error(envelope && envelope.message ? envelope.message : `请求失败（${response.status}）`);
      error.status = response.status;
      throw error;
    }
    return envelope.data;
  }

  async function request(path, options = {}) {
    const method = options.method || 'GET';
    const useAuth = options.auth !== false;
    const headers = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
    if (useAuth) headers.Authorization = `Bearer ${await ensureSession()}`;

    let response;
    try {
      response = await fetch(path, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });
    } catch (_) {
      throw new Error('无法连接校园服务，请检查网络后重试。');
    }

    if (useAuth && response.status === 401 && options.retry !== false) {
      state.token = '';
      await ensureSession();
      return request(path, { ...options, retry: false });
    }
    return readEnvelope(response);
  }

  async function createGuest(identity) {
    const response = await fetch('/api/v1/auth/guest', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(identity ? { guestId: identity.guestId, guestSecret: identity.guestSecret } : {})
    });
    return readEnvelope(response);
  }

  async function ensureSession() {
    if (state.token) return state.token;
    if (state.sessionPromise) return state.sessionPromise;
    state.sessionPromise = (async () => {
      let identity = readIdentity();
      let result;
      try {
        result = await createGuest(identity);
      } catch (error) {
        if (!identity || error.status !== 401) throw error;
        identity = null;
        removeStorage(localStorage, IDENTITY_KEY);
        result = await createGuest(null);
      }
      if (!result || result.role !== 'GUEST' || typeof result.token !== 'string' || !result.token ||
          typeof result.guestId !== 'string' || typeof result.guestSecret !== 'string') {
        throw new Error('校园服务返回的访客会话无效，请稍后重试。');
      }
      state.token = result.token;
      writeStorage(localStorage, IDENTITY_KEY, JSON.stringify({ guestId: result.guestId, guestSecret: result.guestSecret }));
      return state.token;
    })().finally(() => { state.sessionPromise = null; });
    return state.sessionPromise;
  }

  function setConnection(message, status) {
    elements.serviceStatus.textContent = message;
    elements.connectionIndicator.dataset.state = status;
    elements.retryConnection.hidden = status !== 'error';
  }

  function updateAssistantHeader() {
    elements.brandName.textContent = state.name;
    elements.assistantName.textContent = state.name;
    elements.assistantStatus.textContent = state.emotionalSupportEnabled
      ? '校园里的倾听伙伴'
      : '校园信息与日常交流';
  }

  function showPrompts(visible) {
    elements.quickPrompts.replaceChildren();
    if (!visible || state.messages.some(message => message.role === 'user')) {
      elements.quickPrompts.hidden = true;
      return;
    }
    state.suggestions.forEach(suggestion => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = suggestion;
      button.addEventListener('click', () => sendMessage(suggestion));
      elements.quickPrompts.append(button);
    });
    elements.quickPrompts.hidden = state.suggestions.length === 0;
  }

  function renderMessage(message) {
    const item = document.createElement('li');
    item.className = `message message--${message.role}`;

    const column = document.createElement('div');
    column.className = 'message-column';

    const label = document.createElement('span');
    label.className = 'message-label';
    label.textContent = message.role === 'assistant' ? state.name : '我';

    const bubble = document.createElement('div');
    bubble.className = 'message-card';
    bubble.textContent = message.text;
    column.append(label, bubble);

    if (message.role === 'assistant' && message.sources && message.sources.length) {
      const sourceBlock = document.createElement('div');
      sourceBlock.className = 'source-block';
      const sourceLabel = document.createElement('span');
      sourceLabel.className = 'source-label';
      sourceLabel.textContent = '引用的校园资料';
      sourceBlock.append(sourceLabel);
      message.sources.forEach(source => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'source-chip';
        button.textContent = source.title;
        button.title = source.sourceName ? `${source.title} · ${source.sourceName}` : source.title;
        button.setAttribute('aria-label', `查看引用资料：${source.title}`);
        button.addEventListener('click', () => openSource(source.id));
        sourceBlock.append(button);
      });
      bubble.append(sourceBlock);
    }

    item.append(column);
    return item;
  }

  function renderTranscript() {
    elements.messageList.replaceChildren(...state.messages.map(renderMessage));
    showPrompts(true);
    scrollToBottom();
  }

  function appendMessage(role, messageText, sources = [], welcome = false) {
    const message = { role, text: String(messageText), sources, welcome };
    state.messages.push(message);
    elements.messageList.append(renderMessage(message));
    saveConversation();
    showPrompts(false);
    scrollToBottom();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => { elements.chatBody.scrollTop = elements.chatBody.scrollHeight; });
  }

  function applyPublicConfig(config) {
    if (!config || typeof config !== 'object') return;
    const assistant = config.assistant && typeof config.assistant === 'object' ? config.assistant : {};
    state.name = text(assistant.name, '小折', 40);
    state.greeting = text(assistant.greeting, DEFAULT_GREETING, 1200);
    state.suggestions = Array.isArray(assistant.suggestions)
      ? assistant.suggestions.filter(item => typeof item === 'string' && item.trim()).slice(0, 6).map(item => item.trim().slice(0, 100))
      : DEFAULT_SUGGESTIONS.slice();
    state.emotionalSupportEnabled = typeof assistant.emotionalSupportEnabled === 'boolean'
      ? assistant.emotionalSupportEnabled : true;
    elements.disclaimer.textContent = text(config.aiDisclaimer, '内容由 AI 生成 · 校园信息请以学校最新官方发布为准', 240);
    updateAssistantHeader();

    if (state.messages.length === 1 && state.messages[0].welcome) {
      state.messages[0].text = state.greeting;
      renderTranscript();
      saveConversation();
    } else if (!state.messages.length) {
      state.messages.push({ role: 'assistant', text: state.greeting, sources: [], welcome: true });
      renderTranscript();
      saveConversation();
    } else {
      renderTranscript();
    }
  }

  async function connect() {
    setConnection('正在连接校园服务', 'loading');
    const [configResult, sessionResult] = await Promise.allSettled([
      request('/api/v1/config/public', { auth: false }),
      ensureSession()
    ]);
    if (configResult.status === 'fulfilled') applyPublicConfig(configResult.value);
    else if (!state.messages.length) {
      state.messages.push({ role: 'assistant', text: state.greeting, sources: [], welcome: true });
      renderTranscript();
      saveConversation();
    }
    if (sessionResult.status === 'fulfilled') setConnection('已连接校园服务', 'ready');
    else setConnection('暂时无法连接校园服务', 'error');
  }

  function showRequestError(message) {
    elements.requestError.textContent = message;
    elements.requestError.hidden = false;
  }

  function setSending(sending) {
    state.sending = sending;
    elements.typing.hidden = !sending;
    elements.chatBody.setAttribute('aria-busy', String(sending));
    elements.sendButton.querySelector('.send-label').textContent = sending ? '回信中' : '发送';
    elements.sendButton.disabled = sending || !elements.input.value.trim();
    elements.sendButton.setAttribute('aria-label', sending ? '小折正在回复' : '发送消息');
    if (sending) scrollToBottom();
  }

  function resizeComposer() {
    elements.input.style.height = 'auto';
    elements.input.style.height = `${Math.min(elements.input.scrollHeight, 132)}px`;
    elements.sendButton.disabled = state.sending || !elements.input.value.trim();
  }

  async function sendMessage(messageText) {
    const content = String(messageText || '').trim();
    if (!content || state.sending) return;
    elements.requestError.hidden = true;
    elements.input.value = '';
    resizeComposer();
    appendMessage('user', content);
    setSending(true);
    try {
      const result = await request('/api/v1/chat', {
        method: 'POST',
        body: { sessionId: state.sessionId || null, message: content }
      });
      if (result && typeof result.sessionId === 'string') state.sessionId = result.sessionId;
      saveConversation();
      appendMessage('assistant', result && result.reply ? result.reply : '我暂时没有生成回复，请稍后再试。', result && Array.isArray(result.sources) ? result.sources : []);
      setConnection('已连接校园服务', 'ready');
    } catch (error) {
      if (!elements.input.value) elements.input.value = content;
      resizeComposer();
      setConnection('暂时无法连接校园服务', 'error');
      showRequestError(`${error.message || '发送失败'} 消息仍保留在输入框中，可以检查连接后重试。`);
    } finally {
      setSending(false);
    }
  }

  function safeHttpUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value, window.location.origin);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch (_) { return ''; }
  }

  async function openSource(id) {
    const numericId = Number(id);
    if (!Number.isSafeInteger(numericId) || numericId < 1) return;
    elements.sourceTitle.textContent = '正在打开资料…';
    elements.sourceMeta.textContent = '';
    elements.sourceContent.textContent = '';
    elements.sourceLink.hidden = true;
    if (!elements.sourceDialog.open) elements.sourceDialog.showModal();
    try {
      const item = await request(`/api/v1/knowledge/${numericId}`, { auth: false });
      elements.sourceTitle.textContent = text(item.title, '校园资料', 300);
      const details = [item.sourceName, item.publishedAt ? `发布日期：${item.publishedAt}` : ''].filter(Boolean);
      elements.sourceMeta.textContent = details.join(' · ');
      elements.sourceContent.textContent = text(item.content, item.summary || '当前资料没有正文。', 20000);
      const sourceUrl = safeHttpUrl(item.sourceUrl);
      if (sourceUrl) {
        elements.sourceLink.href = sourceUrl;
        elements.sourceLink.hidden = false;
      }
    } catch (error) {
      elements.sourceTitle.textContent = '暂时无法打开资料';
      elements.sourceContent.textContent = error.message || '请稍后重试。';
    }
  }

  elements.composeForm.addEventListener('submit', event => {
    event.preventDefault();
    sendMessage(elements.input.value);
  });
  elements.input.addEventListener('input', resizeComposer);
  elements.input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      elements.composeForm.requestSubmit();
    }
  });
  elements.input.addEventListener('focus', scrollToBottom);
  elements.newChat.addEventListener('click', () => {
    const previousSessionId = state.sessionId;
    state.sessionId = '';
    state.messages = [{ role: 'assistant', text: state.greeting, sources: [], welcome: true }];
    elements.input.value = '';
    elements.requestError.hidden = true;
    saveConversation();
    renderTranscript();
    resizeComposer();
    if (previousSessionId) request('/api/v1/chat/reset', { method: 'POST', body: { sessionId: previousSessionId } }).catch(() => {});
  });
  elements.retryConnection.addEventListener('click', connect);

  function updateVisualHeight() {
    const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--visual-height', `${Math.round(height)}px`);
  }
  updateVisualHeight();
  window.addEventListener('resize', updateVisualHeight, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', updateVisualHeight, { passive: true });

  restoreConversation();
  if (!state.messages.length) state.messages.push({ role: 'assistant', text: state.greeting, sources: [], welcome: true });
  updateAssistantHeader();
  renderTranscript();
  connect();
})();
