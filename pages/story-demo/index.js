function scoreEntry(entry, index, total) {
  const rating = Number(entry.rating || 0);
  const hasNote = entry.note ? 0.6 : 0;
  const recency = (total - index) * 0.15;
  return rating * 1.5 + hasNote + recency;
}

function topMood(entries) {
  const counter = {};
  entries.forEach((e) => {
    if (!e.mood) return;
    counter[e.mood] = (counter[e.mood] || 0) + 1;
  });
  let best = '';
  let bestCount = 0;
  Object.keys(counter).forEach((k) => {
    if (counter[k] > bestCount) {
      best = k;
      bestCount = counter[k];
    }
  });
  return best || '☕️';
}

function avgRating(entries) {
  if (!entries.length) return 0;
  const total = entries.reduce((sum, e) => sum + Number(e.rating || 0), 0);
  return Math.round((total / entries.length) * 10) / 10;
}

Page({
  data: {
    mode: 'weekly',
    theme: 'latte',
    weekLabel: '2026.02.23 - 2026.03.01',
    cardTitle: 'This Week\'s Coffee Story',
    summary: {
      cups: 0,
      shops: 0,
      avgRating: 0,
      mood: '☕️'
    },
    photos: [],
    activePhotoIndex: 0,
    activePhoto: null,
    caption: '',
    draftCaption: '',
    shareCountHint: '预计可提升周分享率 8%-12%（Demo 假设）'
  },

  onLoad() {
    this.seedDemo();
  },

  seedDemo() {
    const entries = [
      {
        date: '2026-02-23',
        shop: 'M Stand',
        mood: '😀',
        rating: 4,
        note: '今天第一杯很顺。',
        photos: ['/images/tab-history.png']
      },
      {
        date: '2026-02-25',
        shop: 'Metal Hands',
        mood: '😌',
        rating: 5,
        note: '豆子很干净，尾段回甘。',
        photos: ['/images/tab-map.png']
      },
      {
        date: '2026-02-27',
        shop: '自制',
        mood: '☕️',
        rating: 4,
        note: '',
        photos: ['/images/tab-shelf.png']
      }
    ];

    const photos = [];
    entries.forEach((entry, idx) => {
      (entry.photos || []).forEach((url) => {
        photos.push({
          url,
          shop: entry.shop,
          mood: entry.mood,
          rating: entry.rating,
          date: entry.date,
          score: scoreEntry(entry, idx, entries.length)
        });
      });
    });
    photos.sort((a, b) => b.score - a.score);

    const shopSet = {};
    entries.forEach((e) => {
      if (e.shop && e.shop !== '自制') shopSet[e.shop] = true;
    });
    const summary = {
      cups: entries.length,
      shops: Object.keys(shopSet).length,
      avgRating: avgRating(entries),
      mood: topMood(entries)
    };
    const best = photos[0] || null;
    const caption = best
      ? '本周最佳：' + best.shop + '，评分 ' + best.rating + '★，继续保持好状态。'
      : '本周坚持打卡，下一周继续。';

    this.setData({
      summary,
      photos,
      activePhotoIndex: 0,
      activePhoto: best,
      caption,
      draftCaption: caption
    });
  },

  onModeTap(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!mode || mode === this.data.mode) return;
    const weekly = mode === 'weekly';
    this.setData({
      mode,
      cardTitle: weekly ? 'This Week\'s Coffee Story' : 'Today\'s Coffee Story',
      weekLabel: weekly ? '2026.02.23 - 2026.03.01' : '2026.02.27'
    });
  },

  onThemeTap(e) {
    const theme = e.currentTarget.dataset.theme;
    if (!theme || theme === this.data.theme) return;
    this.setData({ theme });
  },

  onSelectPhoto(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(idx) || idx < 0 || idx >= this.data.photos.length) return;
    this.setData({ activePhotoIndex: idx, activePhoto: this.data.photos[idx] });
  },

  onCaptionInput(e) {
    this.setData({ draftCaption: (e.detail && e.detail.value) || '' });
  },

  onApplyCaption() {
    this.setData({ caption: this.data.draftCaption || '' });
    wx.showToast({ title: '文案已更新', icon: 'none' });
  },

  onGenerate() {
    wx.showLoading({ title: '生成中...' });
    setTimeout(() => {
      wx.hideLoading();
      wx.showToast({ title: '已生成新卡片', icon: 'success' });
    }, 500);
  },

  onShareMock() {
    wx.showToast({ title: 'Demo: 已触发分享', icon: 'none' });
  }
});
