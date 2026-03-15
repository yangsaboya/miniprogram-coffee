const cloudStore = require('../../utils/cloudStore.js');

const { formatDate, parseLocalDate } = require('../../utils/date.js');

function formatWeekLabel(baseDate) {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const start = new Date(d);
  start.setDate(d.getDate() - diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${formatDate(start)} - ${formatDate(end)}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function topMood(entries) {
  const counter = {};
  entries.forEach((e) => {
    if (!e.mood) return;
    counter[e.mood] = (counter[e.mood] || 0) + 1;
  });
  let best = '';
  let bestCount = 0;
  Object.keys(counter).forEach((m) => {
    if (counter[m] > bestCount) {
      best = m;
      bestCount = counter[m];
    }
  });
  return best || '☕️';
}

function avgRating(entries) {
  if (!entries.length) return 0;
  let count = 0;
  const sum = entries.reduce((acc, e) => {
    const r = Number(e.rating || 0);
    if (r > 0) {
      count += 1;
      return acc + r;
    }
    return acc;
  }, 0);
  if (!count) return 0;
  return Math.round((sum / count) * 10) / 10;
}

function hashString(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function buildPositiveCaption(best, summary, mode) {
  const period = mode === 'weekly' ? '这一周' : '今天';
  const shop = best && best.shop ? best.shop : '这杯咖啡';
  const rating = best && best.rating ? `${best.rating}★` : '';
  const mood = summary && summary.mood ? summary.mood : '☕️';
  const cups = summary && summary.cups ? summary.cups : 0;
  const shops = summary && summary.shops ? summary.shops : 0;
  const avg = summary && summary.avgRating ? summary.avgRating : 0;
  const note = best && best.note ? String(best.note).trim() : '';
  const noteSnippet = note ? `「${note.slice(0, 24)}${note.length > 24 ? '…' : ''}」` : '';
  const shopPart = shop === '自制' ? '自己动手做的一杯' : `${shop}这杯`;
  const ratingPart = rating ? `，评分${rating}` : '';

  const templates = [
    () => `${period}${mood} ${shopPart}${ratingPart}。认真生活的人，总会被香气和努力温柔回报。`,
    () => `${period}的高光时刻：${shopPart}${ratingPart}。慢一点，也能走得更稳更远。`,
    () => `${mood}${period}喝到${shopPart}${ratingPart}，状态在线。把每一天都过成值得回味的样子。`,
    () => `${period}这杯来自${shop}${ratingPart}，刚刚好。你在坚持的路上，已经很闪亮。`,
    () => `${period}最喜欢的是${shopPart}${ratingPart}。持续积累，生活会给你加倍答案。`,
    () => `${mood}${period}的小确幸：${shopPart}${ratingPart}。愿你忙而不乱，稳稳发光。`,
    () => `${period}与咖啡的默契时刻：${shopPart}${ratingPart}。把热爱放进日常，日常就会发光。`,
    () => `${period}的这一杯${shopPart}${ratingPart}。每次认真出发，都会离理想更近一点。`,
    () => `${mood}${period}打卡${shopPart}${ratingPart}。把平凡过好，就是不平凡。`,
    () => `${period}最治愈的一口：${shopPart}${ratingPart}。保持节奏，答案会在路上出现。`,
    () => `${period}喝到${shopPart}${ratingPart}，心情拉满。继续向前，好运会偏爱行动派。`,
    () => `${mood}${period}的最佳记忆是${shopPart}${ratingPart}。愿你每一步都算数。`,
    () => `${period}这杯${shopPart}${ratingPart}，让忙碌有了回甘。你比想象中更有力量。`,
    () => `${period}收获${shopPart}${ratingPart}。把热爱坚持下去，生活会给你惊喜。`,
    () => `${mood}${period}和${shop}相遇${ratingPart}。今天的认真，会变成明天的底气。`,
    () => `${period}最佳一杯：${shopPart}${ratingPart}。慢慢来，比较快。`,
    () => `${period}已记录${cups}杯、走过${shops}家店。${shopPart}${ratingPart}尤其难忘，继续向光而行。`,
    () => `${period}平均评分${avg}分，${shopPart}${ratingPart}表现亮眼。保持热爱，所行皆坦途。`,
    () => `${period}的咖啡关键词：${mood}、${shop}${ratingPart}。心有热望，脚下就有方向。`,
    () => `${period}把日子泡进香气里：${shopPart}${ratingPart}。愿你有目标，也有松弛感。`
  ];

  const key = `${mode}|${shop}|${best && best.date ? best.date : ''}|${best && best.rating ? best.rating : 0}|${mood}|${cups}|${shops}|${avg}`;
  const idx = hashString(key) % templates.length;
  const base = templates[idx]();
  if (!noteSnippet) return base;
  return `${base} ${noteSnippet}`;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const content = text == null ? '' : String(text);
  let line = '';
  let lineCount = 0;
  for (let i = 0; i < content.length; i++) {
    const test = line + content[i];
    const w = ctx.measureText(test).width;
    if (w > maxWidth && line) {
      lineCount += 1;
      if (maxLines && lineCount >= maxLines) {
        const tail = line.slice(0, Math.max(0, line.length - 1)) + '…';
        ctx.fillText(tail, x, y + (lineCount - 1) * lineHeight);
        return lineCount;
      }
      ctx.fillText(line, x, y + (lineCount - 1) * lineHeight);
      line = content[i];
    } else {
      line = test;
    }
  }
  if (line) {
    lineCount += 1;
    ctx.fillText(line, x, y + (lineCount - 1) * lineHeight);
  }
  return lineCount;
}

function getImageInfoAsync(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src,
      success: resolve,
      fail: reject
    });
  });
}

function canvasToTempFilePathAsync(opts, that) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      ...opts,
      success: resolve,
      fail: reject
    }, that);
  });
}

function saveImageToPhotosAlbumAsync(filePath) {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: resolve,
      fail: reject
    });
  });
}

function openSettingAsync() {
  return new Promise((resolve) => {
    wx.openSetting({
      success: resolve,
      fail: () => resolve({})
    });
  });
}

Page({
  data: {
    mode: 'weekly',
    theme: 'latte',
    periodLabel: '',
    cardTitle: '本周分享瞬间',
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
    hasData: false
  },

  onLoad() {
    this._freshLoad = true;
    this.refreshStory();
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && tabBar.setData) tabBar.setData({ selected: 3 });
    if (this._freshLoad) { this._freshLoad = false; return; }
    this.refreshStory();
  },

  getFlattenedLogs(raw) {
    const out = [];
    const keys = Object.keys(raw || {}).sort();
    keys.forEach((dateKey) => {
      const value = raw[dateKey];
      const arr = Array.isArray(value) ? value : (value ? [value] : []);
      arr.forEach((entry, idx) => {
        if (!entry || typeof entry !== 'object') return;
        out.push({ ...entry, _date: dateKey, _index: idx });
      });
    });
    return out;
  },

  filterByMode(entries, mode, now) {
    const todayStart = startOfDay(now);
    if (mode === 'daily') {
      return entries.filter((e) => {
        const dt = e.date || e._date ? parseLocalDate(e.date || e._date) : now;
        return startOfDay(dt) === todayStart;
      });
    }

    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - diffToMonday);
    const ws = startOfDay(weekStart);
    const we = ws + 7 * 24 * 60 * 60 * 1000;
    return entries.filter((e) => {
      const dt = e.date || e._date ? parseLocalDate(e.date || e._date) : now;
      const ts = startOfDay(dt);
      return ts >= ws && ts < we;
    });
  },

  buildStory(entries, mode, now) {
    const sorted = entries.slice().sort((a, b) => {
      const ta = (a.date || a._date ? parseLocalDate(a.date || a._date) : now).getTime();
      const tb = (b.date || b._date ? parseLocalDate(b.date || b._date) : now).getTime();
      return ta - tb;
    });
    const shopSet = {};
    sorted.forEach((e) => {
      const shop = (e.shop || '').trim();
      if (shop && shop !== '自制') shopSet[shop] = true;
    });

    const photos = [];
    sorted.forEach((entry, idx) => {
      const arr = Array.isArray(entry.photos) ? entry.photos : [];
      arr.forEach((p) => {
        // 分享卡片默认使用原图，只有原图缺失时才回退到抠图
        const url = (p && (p.url || p.path || p.cutoutUrl)) || (typeof p === 'string' ? p : '');
        if (!url) return;
        const rating = Number(entry.rating || 0);
        const hasNote = entry.note ? 0.6 : 0;
        const recency = (sorted.length - idx) * 0.15;
        const score = rating * 1.5 + hasNote + recency;
        photos.push({
          url,
          shop: entry.shop || '自制',
          mood: entry.mood || '',
          rating,
          date: entry.date || entry._date,
          note: entry.note || '',
          score
        });
      });
    });
    photos.sort((a, b) => b.score - a.score);

    const best = photos[0] || null;
    const summary = {
      cups: sorted.length,
      shops: Object.keys(shopSet).length,
      avgRating: avgRating(sorted),
      mood: topMood(sorted)
    };
    const periodLabel = mode === 'weekly' ? formatWeekLabel(now) : formatDate(now);
    const cardTitle = mode === 'weekly' ? '本周分享瞬间' : '今日分享瞬间';
    const caption = buildPositiveCaption(best, summary, mode);

    return {
      hasData: sorted.length > 0,
      periodLabel,
      cardTitle,
      summary,
      photos,
      activePhotoIndex: 0,
      activePhoto: best,
      caption,
      draftCaption: caption
    };
  },

  refreshStory() {
    const raw = cloudStore.getJsonLocal('coffeeLogs') || {};
    const now = new Date();
    const mode = this.data.mode;
    const allEntries = this.getFlattenedLogs(raw);
    const entries = this.filterByMode(allEntries, mode, now);
    const next = this.buildStory(entries, mode, now);
    this.setData(next);

    cloudStore.getJsonCached('coffeeLogs').then((cloudRaw) => {
      if (!cloudRaw || typeof cloudRaw !== 'object') return;
      const localNow = cloudStore.getJsonLocal('coffeeLogs') || {};
      const merged = cloudStore.mergeCoffeeLogs(cloudRaw, localNow);
      wx.setStorageSync('coffeeLogs', merged);
      const cloudEntries = this.getFlattenedLogs(merged);
      const list = this.filterByMode(cloudEntries, this.data.mode, now);
      this.setData(this.buildStory(list, this.data.mode, now));
    }).catch((e) => { console.warn('[story] cloud sync fail', e); });
  },

  onModeTap(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!mode || mode === this.data.mode) return;
    this.setData({ mode }, () => this.refreshStory());
  },

  onThemeTap(e) {
    const theme = e.currentTarget.dataset.theme;
    if (!theme || theme === this.data.theme) return;
    this.setData({ theme });
  },

  onSelectPhoto(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(idx) || idx < 0 || idx >= this.data.photos.length) return;
    const activePhoto = this.data.photos[idx];
    const nextCaption = buildPositiveCaption(activePhoto, this.data.summary, this.data.mode);
    this.setData({
      activePhotoIndex: idx,
      activePhoto,
      caption: nextCaption,
      draftCaption: nextCaption
    });
  },

  onCaptionInput(e) {
    const value = (e.detail && e.detail.value) || '';
    this.setData({ draftCaption: value, caption: value });
  },

  onGenerate() {
    this.refreshStory();
    wx.showToast({ title: '已生成卡片', icon: 'none' });
  },

  onShareMock() {
    wx.showToast({ title: '请点右上角进行分享', icon: 'none' });
  },

  async resolvePosterImagePath(url) {
    if (!url) return '';
    if (String(url).startsWith('cloud://') && wx.cloud && wx.cloud.downloadFile) {
      const res = await wx.cloud.downloadFile({ fileID: url });
      return (res && res.tempFilePath) || '';
    }
    try {
      const info = await getImageInfoAsync(url);
      return info && info.path ? info.path : url;
    } catch (e) {
      return url;
    }
  },

  async generatePosterTempFile() {
    const width = 750;
    const height = 1200;
    const ctx = wx.createCanvasContext('storyPosterCanvas', this);
    const activePhoto = this.data.activePhoto;
    const imagePath = await this.resolvePosterImagePath(activePhoto && activePhoto.url);

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#fdf6ec');
    bg.addColorStop(1, '#f3eee8');
    ctx.setFillStyle(bg);
    ctx.fillRect(0, 0, width, height);

    ctx.setFillStyle('#6f4e37');
    ctx.setFontSize(48);
    ctx.fillText('分享瞬间', 56, 90);

    ctx.setFillStyle('#8b7355');
    ctx.setFontSize(26);
    ctx.fillText(this.data.periodLabel || '', 56, 132);

    ctx.setFillStyle('#ffffff');
    ctx.fillRect(40, 170, 670, 900);

    if (imagePath) {
      ctx.drawImage(imagePath, 70, 210, 610, 520);
    } else {
      ctx.setFillStyle('#efe4d8');
      ctx.fillRect(70, 210, 610, 520);
      ctx.setFillStyle('#9a846f');
      ctx.setFontSize(28);
      ctx.fillText('暂无图片', 330, 480);
    }

    ctx.setFillStyle('#2f2218');
    ctx.setFontSize(34);
    ctx.fillText(this.data.cardTitle || '本周分享瞬间', 70, 770);

    ctx.setFillStyle('#5f4a39');
    ctx.setFontSize(28);
    const summaryText = `杯数 ${this.data.summary.cups} · 店铺 ${this.data.summary.shops} · 均分 ${this.data.summary.avgRating} · 心情 ${this.data.summary.mood}`;
    ctx.fillText(summaryText, 70, 818);

    ctx.setFillStyle('#4f3a2a');
    ctx.setFontSize(30);
    wrapText(ctx, this.data.caption || '', 70, 876, 610, 42, 5);

    ctx.setFillStyle('#8b7355');
    ctx.setFontSize(24);
    ctx.fillText('来自「啡点集」小程序', 70, 1040);

    await new Promise((resolve) => ctx.draw(false, resolve));
    const temp = await canvasToTempFilePathAsync({
      canvasId: 'storyPosterCanvas',
      x: 0,
      y: 0,
      width,
      height,
      destWidth: width,
      destHeight: height,
      fileType: 'png',
      quality: 1
    }, this);
    return temp && temp.tempFilePath ? temp.tempFilePath : '';
  },

  async onSavePoster() {
    if (this._savingPoster) return;
    this._savingPoster = true;
    wx.showLoading({ title: '生成海报中...' });
    try {
      const tempFilePath = await this.generatePosterTempFile();
      if (!tempFilePath) throw new Error('poster generate fail');
      await saveImageToPhotosAlbumAsync(tempFilePath);
      wx.showToast({ title: '已保存到相册', icon: 'success' });
    } catch (err) {
      const msg = (err && err.errMsg) || '';
      if (msg.indexOf('auth deny') !== -1 || msg.indexOf('authorize') !== -1) {
        wx.showModal({
          title: '需要相册权限',
          content: '请在设置中允许保存到相册后重试',
          confirmText: '去设置',
          success: async (res) => {
            if (!res.confirm) return;
            await openSettingAsync();
          }
        });
      } else {
        wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      }
    } finally {
      wx.hideLoading();
      this._savingPoster = false;
    }
  },

  onShareAppMessage() {
    return {
      title: this.data.caption || '我的分享瞬间',
      path: '/pages/story/index'
    };
  }
});
