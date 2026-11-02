// pages/chat-minimal —— 极简版校园 AI 对话界面（独立演示页）
//
// 这是一个**纯 UI 演示页**：不调用项目里任何接口、不读写全局状态，
// 回复由本文件里的固定语料模拟，方便单独看设计与交互。
// 设计依据：tasteskill v2 · app-screens · achromatic-ledger（seed 1326006843）

/** 小北的开场句：直接说"能聊什么"，不用"有什么可以帮你"这类通用句 */
const OPENING = '你好，我是小北。学习、心情、办事，挑一件慢慢说。';

/** 三个具体入口：写具体的事，不写"校园服务""常见问题"这种分类名 */
const STARTERS = [
  { id: 'tired', text: '今天有点累，想找人说说' },
  { id: 'review', text: '期末了，帮我排一下复习' },
  { id: 'card', text: '校园卡丢了，该走哪一步' },
];

/** 模拟回复：按关键词命中，命中不了用兜底句 */
const REPLIES = {
  tired: '先不急着解决。是哪门课，或者哪件事，让你最累？',
  review: '先说三件事：哪几门、各剩几天、每天能坐下来几小时。我按这个排。',
  card: '先挂失，再补办。你手里的卡还有余额吗？有的话补办前先确认它是否已冻结。',
  fallback: '我在。你可以直接说事，也可以先说今天怎么了。',
};

/** 简易关键词路由 */
function replyFor(text) {
  const s = String(text || '');
  if (/累|烦|难受|压力|心情|焦虑|睡不着/.test(s)) return REPLIES.tired;
  if (/复习|期末|考试|备考|成绩/.test(s)) return REPLIES.review;
  if (/校园卡|饭卡|丢|挂失|补办/.test(s)) return REPLIES.card;
  return REPLIES.fallback;
}

let seq = 0;
const uid = () => 'm' + (seq += 1);

Page({
  data: {
    statusBar: 20,
    navH: 48,
    opening: OPENING,
    starters: STARTERS,
    showStarters: true,
    messages: [],
    input: '',
    hasInput: false,
    typing: false,
    scrollTop: 0,
    placeholder: '和小北聊聊…',
  },

  onLoad() {
    // 自定义导航栏：取状态栏高度（拿不到就用 20px 兜底）
    let statusBar = 20;
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      statusBar = info.statusBarHeight || 20;
    } catch (e) {
      /* 忽略 */
    }
    this.setData({ statusBar });
    this.timers = [];
  },

  onUnload() {
    (this.timers || []).forEach((t) => clearTimeout(t));
    this.timers = [];
  },

  onInput(event) {
    const value = event.detail.value || '';
    this.setData({ input: value, hasInput: !!value.trim() });
  },

  onSend() {
    const text = (this.data.input || '').trim();
    if (!text || this.data.typing) return;
    this.send(text);
  },

  onStarter(event) {
    const item = this.data.starters[Number(event.currentTarget.dataset.index)];
    if (!item || this.data.typing) return;
    this.send(item.text);
  },

  /** 发一条：先落用户消息，再起"正在输入"，延时后落小北回复 */
  send(text) {
    const messages = this.data.messages.concat({ id: uid(), role: 'user', text });
    this.setData({
      messages,
      input: '',
      hasInput: false,
      showStarters: false,
      typing: true,
    });
    this.scrollToEnd();

    const delay = 520 + Math.floor(Math.random() * 380);
    this.timers.push(
      setTimeout(() => {
        const reply = { id: uid(), role: 'bot', text: replyFor(text) };
        this.setData({
          messages: this.data.messages.concat(reply),
          typing: false,
        });
        this.scrollToEnd();
      }, delay)
    );
  },

  /** 滚到底：scroll-top 每次给一个更大的值才会触发 */
  scrollToEnd() {
    this.timers.push(
      setTimeout(() => {
        this.setData({ scrollTop: this.data.scrollTop + 20000 });
      }, 60)
    );
  },

  /** 新对话：清空线程，回到开场 */
  onReset() {
    (this.timers || []).forEach((t) => clearTimeout(t));
    this.timers = [];
    this.setData({
      messages: [],
      input: '',
      hasInput: false,
      typing: false,
      showStarters: true,
      scrollTop: 0,
    });
  },
});
