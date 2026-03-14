const SHELF_ITEMS_KEY = 'shelfItems';
const SHELF_HIDDEN_LOG_IDS = 'shelfHiddenLogIds'; // 从打卡同步来的图在架上隐藏，不删打卡记录
const cloudStore = require('../../utils/cloudStore.js');
const cloudStorage = require('../../utils/cloudStorage.js');
const imageCache = require('../../utils/imageCache.js');

const { formatDate } = require('../../utils/date.js');

function jsonEquals(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (e) {
    return false;
  }
}

function canCallCloud() {
  return !!(wx.cloud && wx.cloud.callFunction);
}

const mergeCoffeeLogsPreserveCutout = cloudStore.mergeCoffeeLogs;

Page({
  data: {
    items: [],
    rows: [],
    coffeeCount: 0
  },

  onLoad() {
    this._freshLoad = true;
    this.loadShelf();
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && tabBar.setData) tabBar.setData({ selected: 2 });
    if (this._freshLoad) { this._freshLoad = false; return; }
    this.loadShelf();
  },

  _debouncedLoadShelf() {
    if (this._loadShelfTimer) clearTimeout(this._loadShelfTimer);
    this._loadShelfTimer = setTimeout(() => { this.loadShelf(); }, 500);
  },

  collectPhotosFromRaw(raw) {
    const list = [];
    const dates = Object.keys(raw).sort().reverse();
    dates.forEach((date) => {
      const value = raw[date];
      const arr = Array.isArray(value) ? value : (value ? [value] : []);
      arr.forEach((log, logIndex) => {
        const photos = log.photos;
        if (!photos || !photos.length) return;
        photos.forEach((p, photoIndex) => {
          const url = p.url || p.path || (typeof p === 'string' ? p : '');
          if (url) {
            list.push({
              url,
              cutoutUrl: p.cutoutUrl || '',
              remark: p.remark || p.note || '',
              date,
              shop: log.shop || '',
              source: 'log',
              logIndex,
              photoIndex
            });
          }
        });
      });
    });
    return list;
  },

  loadShelf(fromCloudSync) {
    this._shelfReqId = (this._shelfReqId || 0) + 1;
    const reqId = this._shelfReqId;
    const localCoffee = cloudStore.getJsonLocal('coffeeLogs') || {};
    let added = cloudStore.getJsonLocal(SHELF_ITEMS_KEY);
    if (!Array.isArray(added)) added = [];
    let hiddenLogIds = cloudStore.getJsonLocal(SHELF_HIDDEN_LOG_IDS);
    if (!Array.isArray(hiddenLogIds)) hiddenLogIds = [];
    const needMigrate = added.some((p) => !p.id);
    if (needMigrate && added.length) {
      added = added.map((p) => (p.id ? p : { ...p, id: 'shelf_' + Date.now() + '_' + Math.random().toString(36).slice(2) }));
      wx.setStorageSync(SHELF_ITEMS_KEY, added);
      cloudStore.setJson(SHELF_ITEMS_KEY, added).catch((e) => { console.warn('[shelf]', e); });
    }
    let fromLogs = this.collectPhotosFromRaw(localCoffee);
    fromLogs = fromLogs.map((p) => ({
      ...p,
      id: 'log_' + (p.date || '') + '_' + (p.logIndex ?? 0) + '_' + (p.photoIndex ?? 0)
    }));
    const hiddenSet = new Set(hiddenLogIds);
    fromLogs = fromLogs.filter((p) => !hiddenSet.has(p.id));
    const addedItems = added;
    const combined = [
      ...fromLogs,
      ...addedItems.map((p) => ({
        id: p.id || 'shelf_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        url: p.url || p.path || p,
        cutoutUrl: p.cutoutUrl || '',
        remark: p.remark || p.note || '',
        date: p.date || '',
        source: 'shelf'
      }))
    ];
    const rows = this.toRows(combined, 4);
    // 仅当列表「指纹」变化时才 setData，避免切 tab / 云端回调导致无意义重绘和闪烁
    const fingerprint = combined.map((p) => `${p.id}\n${p.cutoutUrl || p.url || ''}`).join('\n');
    if (this._shelfFingerprint !== fingerprint) {
      this._shelfFingerprint = fingerprint;
      this._items = combined;
      this.setData({ rows, coffeeCount: combined.length });
    } else {
      this._items = combined;
    }
    const prefetchUrls = combined
      .slice(0, 24)
      .map((p) => p.cutoutUrl || p.url)
      .filter((u) => u && String(u).startsWith('cloud://'));
    const prefetchFingerprint = prefetchUrls.join('\n');
    if (prefetchFingerprint && this._prefetchFingerprint !== prefetchFingerprint) {
      this._prefetchFingerprint = prefetchFingerprint;
      imageCache.prefetch(prefetchUrls, 4).catch((e) => { console.warn('[shelf]', e); });
    }

    // 仅首次进入/刷新时触发打卡图后台抠图，云端同步回调里不触发，避免反复抠同一张
    if (!fromCloudSync) {
      const logNeedCutout = combined.filter(
        (p) => p.source === 'log' && p.url && String(p.url).startsWith('cloud://') && !p.cutoutUrl
      );
      if (logNeedCutout.length) this.runBackgroundCutoutLog(logNeedCutout.map((p) => p.id));
    }

    Promise.all([
      cloudStore.getJsonCached('coffeeLogs'),
      cloudStore.getJsonCached(SHELF_ITEMS_KEY),
      cloudStore.getJsonCached(SHELF_HIDDEN_LOG_IDS)
    ]).then(([cloudCoffee, cloudAdded, cloudHidden]) => {
      if (reqId !== this._shelfReqId) return;
      let updated = false;
      if (cloudCoffee && typeof cloudCoffee === 'object') {
        const localNow = cloudStore.getJsonLocal('coffeeLogs') || {};
        const merged = mergeCoffeeLogsPreserveCutout(cloudCoffee, localNow);
        if (!jsonEquals(localNow, merged)) {
          wx.setStorageSync('coffeeLogs', merged);
          updated = true;
        }
      }
      if (Array.isArray(cloudAdded)) {
        const localNow = cloudStore.getJsonLocal(SHELF_ITEMS_KEY) || [];
        const merged = cloudAdded.map((c) => {
          const loc = localNow.find((x) => x && x.id === c.id);
          if (loc && loc.cutoutUrl) return { ...c, cutoutUrl: loc.cutoutUrl };
          return c;
        });
        if (!jsonEquals(localNow, merged)) {
          wx.setStorageSync(SHELF_ITEMS_KEY, merged);
          updated = true;
        }
      }
      if (Array.isArray(cloudHidden)) {
        const localHidden = cloudStore.getJsonLocal(SHELF_HIDDEN_LOG_IDS) || [];
        const mergedHidden = [...new Set([...(Array.isArray(localHidden) ? localHidden : []), ...cloudHidden])];
        if (!jsonEquals(localHidden, mergedHidden)) {
          wx.setStorageSync(SHELF_HIDDEN_LOG_IDS, mergedHidden);
          updated = true;
        }
      }
      if (updated) this.loadShelf(true);
    }).catch((e) => { console.warn('[shelf]', e); });
  },

  toRows(items, perRow) {
    const rows = [];
    for (let i = 0; i < items.length; i += perRow) {
      const chunk = items.slice(i, i + perRow);
      chunk.rowKey = chunk.map((p) => p.id).join('_');
      rows.push(chunk);
    }
    return rows;
  },

  addFromAlbum() {
    const that = this;
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album'],
      success(res) {
        const paths = (res.tempFiles || []).map((f) => f.tempFilePath);
        if (!paths.length) return;
        wx.showLoading({ title: '上传中…' });
        Promise.all(paths.map((p) => cloudStorage.uploadImage(p)))
          .then((fileIDs) => {
            let added = cloudStore.getJsonLocal(SHELF_ITEMS_KEY);
            if (!Array.isArray(added)) added = [];
            const next = added.slice();
            const base = Date.now();
            const today = formatDate(new Date());
            const newIds = [];
            fileIDs.forEach((fileID, i) => {
              const id = 'shelf_' + base + '_' + i + '_' + Math.random().toString(36).slice(2);
              next.push({ id, url: fileID, remark: '', date: today });
              newIds.push(id);
            });
            wx.setStorageSync(SHELF_ITEMS_KEY, next);
            return cloudStore.setJson(SHELF_ITEMS_KEY, next).then(() => newIds);
          })
          .then((newIds) => {
            that.loadShelf();
            wx.showToast({ title: '已加入咖啡架', icon: 'none' });
            that.runBackgroundCutout(newIds);
          })
          .catch((err) => {
            console.error('shelf photo upload fail', err);
            wx.showToast({ title: '照片上传失败，请重试', icon: 'none' });
          })
          .finally(() => { wx.hideLoading(); });
      }
    });
  },

  onPreview(e) {
    const raw = e.currentTarget.dataset.cutoutUrl || e.currentTarget.dataset.url;
    const items = this._items || [];
    const urls = items.map((i) => {
      const src = i.cutoutUrl || i.url;
      return imageCache.getSync(src) || src;
    });
    if (!raw || !urls.length) return;
    const current = imageCache.getSync(raw) || raw;
    wx.previewImage({ current, urls });
  },

  /** 根据 id 从咖啡架移除一张「从相册添加」的照片，并同步删除云存储里的原图与抠图 */
  removeFromShelfById(id) {
    if (!id || !id.startsWith('shelf_')) return;
    let added = cloudStore.getJsonLocal(SHELF_ITEMS_KEY);
    if (!Array.isArray(added)) added = [];
    const item = added.find((p) => p.id === id);
    const fileIDs = [];
    if (item) {
      if (item.url && String(item.url).startsWith('cloud://')) fileIDs.push(item.url);
      if (item.cutoutUrl && String(item.cutoutUrl).startsWith('cloud://')) fileIDs.push(item.cutoutUrl);
    }
    if (fileIDs.length) cloudStorage.deleteCloudFiles(fileIDs).catch((e) => { console.warn('[shelf]', e); });

    const next = added.filter((p) => p.id !== id);
    wx.setStorageSync(SHELF_ITEMS_KEY, next);
    cloudStore.setJson(SHELF_ITEMS_KEY, next).catch((e) => { console.warn('[shelf]', e); });
    this.loadShelf();
    wx.showToast({ title: '已从架上移除', icon: 'none' });
  },

  /** 打卡图后台自动抠图：对需要抠图的 log id 依次调用，避免重复触发 */
  runBackgroundCutoutLog(ids) {
    if (!ids || !ids.length) return;
    if (!canCallCloud()) return;
    this._logCutoutPending = this._logCutoutPending || new Set();
    const runOne = (id) => {
      if (this._logCutoutPending.has(id)) return Promise.resolve();
      const parsed = this.parseLogId(id);
      if (!parsed) return Promise.resolve();
      const allLogs = cloudStore.getJsonLocal('coffeeLogs') || {};
      const { date, logIndex, photoIndex } = parsed;
      const logsOfDay = allLogs[date];
      if (!Array.isArray(logsOfDay) || !logsOfDay[logIndex] || !logsOfDay[logIndex].photos || !logsOfDay[logIndex].photos[photoIndex]) return Promise.resolve();
      const photo = logsOfDay[logIndex].photos[photoIndex];
      const fileID = photo.url || photo.path;
      if (!fileID || !String(fileID).startsWith('cloud://')) return Promise.resolve();
      if (photo.cutoutUrl) return Promise.resolve();
      this._logCutoutPending.add(id);
      return wx.cloud
        .callFunction({ name: 'segmentImage', data: { fileID } })
        .then((res) => {
          const result = res && res.result ? res.result : {};
          if (!result.ok || !result.fileID) return;
          const logs = cloudStore.getJsonLocal('coffeeLogs') || {};
          let day = logs[date];
          if (!Array.isArray(day) || !day[logIndex] || !day[logIndex].photos || !day[logIndex].photos[photoIndex]) return;
          day = day.slice();
          day[logIndex] = { ...day[logIndex], photos: day[logIndex].photos.slice() };
          day[logIndex].photos[photoIndex] = { ...day[logIndex].photos[photoIndex], cutoutUrl: result.fileID };
          logs[date] = day;
          wx.setStorageSync('coffeeLogs', logs);
          cloudStore.setJson('coffeeLogs', logs).catch((e) => { console.warn('[shelf]', e); });
          this._debouncedLoadShelf();
        })
        .catch((e) => { console.warn('[shelf]', e); })
        .finally(() => {
          this._logCutoutPending.delete(id);
        });
    };
    let p = Promise.resolve();
    ids.forEach((id) => {
      p = p.then(() => runOne(id));
    });
  },

  /** 后台自动抠图：对指定 shelf id 列表依次调用抠图，完成后更新展示 */
  runBackgroundCutout(ids) {
    if (!ids || !ids.length) return;
    if (!canCallCloud()) return;
    const runOne = (id) => {
      let added = cloudStore.getJsonLocal(SHELF_ITEMS_KEY);
      if (!Array.isArray(added)) added = [];
      const idx = added.findIndex((p) => p.id === id);
      if (idx < 0) return Promise.resolve();
      const item = added[idx];
      if (item.cutoutUrl || !item.url || !String(item.url).startsWith('cloud://')) return Promise.resolve();
      return wx.cloud
        .callFunction({ name: 'segmentImage', data: { fileID: item.url } })
        .then((res) => {
          const result = res && res.result ? res.result : {};
          if (!result.ok || !result.fileID) return;
          added = cloudStore.getJsonLocal(SHELF_ITEMS_KEY) || [];
          const i = added.findIndex((p) => p.id === id);
          if (i < 0) return;
          added = added.slice();
          added[i] = { ...added[i], cutoutUrl: result.fileID };
          wx.setStorageSync(SHELF_ITEMS_KEY, added);
          cloudStore.setJson(SHELF_ITEMS_KEY, added).catch((e) => { console.warn('[shelf]', e); });
          this._debouncedLoadShelf();
        })
        .catch((e) => { console.warn('[shelf]', e); });
    };
    let p = Promise.resolve();
    ids.forEach((id) => {
      p = p.then(() => runOne(id));
    });
  },

  /** 长按槽位：shelf 可恢复原图或再次抠图；log 可抠图或恢复原图 */
  onSlotLongPress(e) {
    const d = e.currentTarget.dataset;
    const photo = {
      id: d.id,
      url: d.url,
      source: d.source,
      cutoutUrl: d.cutoutUrl
    };
    if (!photo.id) return;
    const hasCutout = !!photo.cutoutUrl;
    const url = photo.url || '';
    const canSegment = url && String(url).startsWith('cloud://');

    if (photo.source === 'shelf') {
      if (!canSegment) {
        wx.showToast({ title: '仅支持云存储照片抠图', icon: 'none' });
        return;
      }
      const items = hasCutout
        ? ['恢复原图', '抠图展示咖啡杯', '从架上移除']
        : ['抠图展示咖啡杯', '从架上移除'];
      wx.showActionSheet({
        itemList: items,
        success: (res) => {
          if (hasCutout) {
            if (res.tapIndex === 0) this.doRestoreCutout(photo);
            else if (res.tapIndex === 1) this.doSegment(photo);
            else if (res.tapIndex === 2) this.removeFromShelfById(photo.id);
          } else {
            if (res.tapIndex === 0) this.doSegment(photo);
            else if (res.tapIndex === 1) this.removeFromShelfById(photo.id);
          }
        }
      });
      return;
    }

    if (photo.source === 'log') {
      if (!canSegment) {
        wx.showToast({ title: '仅支持云存储照片抠图', icon: 'none' });
        return;
      }
      const items = hasCutout
        ? ['恢复原图', '抠图展示咖啡杯', '从架上移除']
        : ['抠图展示咖啡杯', '从架上移除'];
      wx.showActionSheet({
        itemList: items,
        success: (res) => {
          if (hasCutout) {
            if (res.tapIndex === 0) this.doRestoreCutoutLog(photo);
            else if (res.tapIndex === 1) this.doSegmentLog(photo);
            else if (res.tapIndex === 2) this.removeLogFromShelf(photo);
          } else {
            if (res.tapIndex === 0) this.doSegmentLog(photo);
            else if (res.tapIndex === 1) this.removeLogFromShelf(photo);
          }
        }
      });
    }
  },

  /** 打卡同步来的图：仅在架上隐藏，不删打卡记录 */
  removeLogFromShelf(photo) {
    if (!photo.id || !photo.id.startsWith('log_')) return;
    let hidden = cloudStore.getJsonLocal(SHELF_HIDDEN_LOG_IDS);
    if (!Array.isArray(hidden)) hidden = [];
    if (hidden.includes(photo.id)) return;
    hidden = hidden.concat(photo.id);
    if (hidden.length > 500) hidden = hidden.slice(hidden.length - 500);
    wx.setStorageSync(SHELF_HIDDEN_LOG_IDS, hidden);
    cloudStore.setJson(SHELF_HIDDEN_LOG_IDS, hidden).catch((e) => { console.warn('[shelf]', e); });
    this.loadShelf();
    wx.showToast({ title: '已从架上移除', icon: 'none' });
  },

  /** 恢复原图：清除该项的 cutoutUrl */
  doRestoreCutout(photo) {
    const id = photo.id;
    if (!id || !id.startsWith('shelf_')) return;
    let added = cloudStore.getJsonLocal(SHELF_ITEMS_KEY);
    if (!Array.isArray(added)) added = [];
    const idx = added.findIndex((p) => p.id === id);
    if (idx < 0) return;
    added = added.slice();
    const item = added[idx];
    added[idx] = { ...item, cutoutUrl: '' };
    delete added[idx].cutoutUrl;
    wx.setStorageSync(SHELF_ITEMS_KEY, added);
    cloudStore.setJson(SHELF_ITEMS_KEY, added).catch((e) => { console.warn('[shelf]', e); });
    this.loadShelf();
    wx.showToast({ title: '已恢复原图', icon: 'none' });
  },

  /** 调用云端分割 API，得到抠图 fileID 后写入 shelf 项并刷新（手动触发用，shelf 默认走后台自动抠图） */
  doSegment(photo) {
    const id = photo.id;
    if (!id || !id.startsWith('shelf_')) return;
    if (!canCallCloud()) {
      wx.showToast({ title: '云能力不可用', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '抠图中…' });
    wx.cloud
      .callFunction({ name: 'segmentImage', data: { fileID: photo.url } })
      .then((res) => {
        const result = res && res.result ? res.result : {};
        if (!result.ok || !result.fileID) {
          wx.showToast({ title: result.errMsg || '抠图失败', icon: 'none' });
          throw new Error(result.errMsg || 'segmentImage logical fail');
        }
        let added = cloudStore.getJsonLocal(SHELF_ITEMS_KEY);
        if (!Array.isArray(added)) added = [];
        const idx = added.findIndex((p) => p.id === id);
        if (idx < 0) {
          wx.showToast({ title: '未找到该照片', icon: 'none' });
          throw new Error('shelf item not found');
        }
        added = added.slice();
        added[idx] = { ...added[idx], cutoutUrl: result.fileID };
        wx.setStorageSync(SHELF_ITEMS_KEY, added);
        return cloudStore.setJson(SHELF_ITEMS_KEY, added);
      })
      .then(() => {
        this.loadShelf();
        wx.showToast({ title: '已切换为抠图展示', icon: 'none' });
      })
      .catch((err) => {
        console.error('segmentImage call fail', err);
        wx.showToast({ title: '抠图失败，请重试', icon: 'none' });
      })
      .finally(() => wx.hideLoading());
  },

  /** 解析 log 项 id：log_date_logIndex_photoIndex */
  parseLogId(id) {
    if (!id || !id.startsWith('log_')) return null;
    const parts = id.split('_');
    if (parts.length < 4) return null;
    const date = parts[1];
    const logIndex = parseInt(parts[2], 10);
    const photoIndex = parseInt(parts[3], 10);
    if (date === undefined || isNaN(logIndex) || isNaN(photoIndex)) return null;
    return { date, logIndex, photoIndex };
  },

  /** 打卡记录照片抠图：写入 coffeeLogs 对应条目的 photos[].cutoutUrl */
  doSegmentLog(photo) {
    const parsed = this.parseLogId(photo.id);
    if (!parsed) return;
    if (!canCallCloud()) {
      wx.showToast({ title: '云能力不可用', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '抠图中…' });
    wx.cloud
      .callFunction({ name: 'segmentImage', data: { fileID: photo.url } })
      .then((res) => {
        const result = res && res.result ? res.result : {};
        if (!result.ok || !result.fileID) {
          wx.showToast({ title: result.errMsg || '抠图失败', icon: 'none' });
          throw new Error(result.errMsg || 'segmentImage logical fail');
        }
        const allLogs = cloudStore.getJsonLocal('coffeeLogs') || {};
        const { date, logIndex, photoIndex } = parsed;
        let logsOfDay = allLogs[date];
        if (Array.isArray(logsOfDay) && logsOfDay[logIndex] && logsOfDay[logIndex].photos && logsOfDay[logIndex].photos[photoIndex]) {
          logsOfDay = logsOfDay.slice();
          logsOfDay[logIndex] = { ...logsOfDay[logIndex], photos: logsOfDay[logIndex].photos.slice() };
          logsOfDay[logIndex].photos[photoIndex] = {
            ...logsOfDay[logIndex].photos[photoIndex],
            cutoutUrl: result.fileID
          };
          allLogs[date] = logsOfDay;
          wx.setStorageSync('coffeeLogs', allLogs);
          return cloudStore.setJson('coffeeLogs', allLogs);
        }
        wx.showToast({ title: '未找到该照片', icon: 'none' });
        throw new Error('log photo not found');
      })
      .then(() => {
        this.loadShelf();
        wx.showToast({ title: '已切换为抠图展示', icon: 'none' });
      })
      .catch((err) => {
        if (err && err.message !== 'log photo not found') console.error('segmentImage log fail', err);
        wx.showToast({ title: '抠图失败，请重试', icon: 'none' });
      })
      .finally(() => wx.hideLoading());
  },

  /** 打卡记录照片恢复原图：清除 coffeeLogs 对应条目的 photos[].cutoutUrl */
  doRestoreCutoutLog(photo) {
    const parsed = this.parseLogId(photo.id);
    if (!parsed) return;
    const allLogs = cloudStore.getJsonLocal('coffeeLogs') || {};
    const { date, logIndex, photoIndex } = parsed;
    let logsOfDay = allLogs[date];
    if (!Array.isArray(logsOfDay) || !logsOfDay[logIndex] || !logsOfDay[logIndex].photos || !logsOfDay[logIndex].photos[photoIndex]) return;
    logsOfDay = logsOfDay.slice();
    logsOfDay[logIndex] = { ...logsOfDay[logIndex], photos: logsOfDay[logIndex].photos.slice() };
    const p = logsOfDay[logIndex].photos[photoIndex];
    logsOfDay[logIndex].photos[photoIndex] = { ...p, cutoutUrl: '' };
    delete logsOfDay[logIndex].photos[photoIndex].cutoutUrl;
    allLogs[date] = logsOfDay;
    wx.setStorageSync('coffeeLogs', allLogs);
    cloudStore.setJson('coffeeLogs', allLogs).catch((e) => { console.warn('[shelf]', e); });
    this.loadShelf();
    wx.showToast({ title: '已恢复原图', icon: 'none' });
  }
});
