const cloudStore = require('../../utils/cloudStore.js');
const cloudStorage = require('../../utils/cloudStorage.js');
const { formatDate } = require('../../utils/date.js');
const MAX_SHOP_LEN = 40;
const MAX_NOTE_LEN = 300;
const MAX_REMARK_LEN = 30;

function normalizeText(value, maxLen, keepNewline) {
  const raw = value == null ? '' : String(value);
  const noCtl = raw.replace(keepNewline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '');
  const clipped = typeof maxLen === 'number' && maxLen > 0 ? noCtl.slice(0, maxLen) : noCtl;
  return keepNewline ? clipped : clipped.replace(/\s+/g, ' ').trim();
}

Page({
  data: {
    today: '',
    log: {
      date: '',
      source: '自制',
      shop: '',
      mood: '',
      rating: 0,
      note: '',
      photos: []
    },
    todayCount: 0,
    editIndex: -1,
    punching: false,
    moodOptions: ['😀', '😌', '☕️', '😴', '😫'],
    stars: [1, 2, 3, 4, 5]
  },

  onLoad(options) {
    const passedDate = options && options.date;
    const editIndex = options.editIndex !== undefined ? parseInt(options.editIndex, 10) : -1;
    const today = passedDate || this.formatDate(new Date());
    this.setData({ editIndex: editIndex >= 0 ? editIndex : -1 });
    this.loadLog(today, editIndex);

    if (passedDate) {
      wx.setNavigationBarTitle({
        title: editIndex >= 0 ? '编辑咖啡打卡' : '咖啡打卡'
      });
    }
  },

  formatDate(date) {
    return formatDate(date);
  },

  loadLog(date, editIndex) {
    this._loadLogReqId = (this._loadLogReqId || 0) + 1;
    const reqId = this._loadLogReqId;
    try {
      const allLogs = cloudStore.getJsonLocal('coffeeLogs') || {};
      const value = allLogs[date];
      let logsOfDay = [];
      if (Array.isArray(value)) {
        logsOfDay = value;
      } else if (value) {
        logsOfDay = [value];
      }
      let log = {
        date,
        source: '自制',
        shop: '',
        mood: '',
        rating: 0,
        note: '',
        photos: []
      };
      if (editIndex >= 0 && editIndex < logsOfDay.length) {
        const entry = logsOfDay[editIndex];
        log = {
          date,
          source: entry.source || '自制',
          shop: entry.shop || '',
          mood: entry.mood || '',
          rating: entry.rating || 0,
          note: entry.note || '',
          photos: Array.isArray(entry.photos) ? entry.photos : [],
          id: entry.id,
          createdAt: entry.createdAt
        };
        if (entry.location) log.location = entry.location;
      }
      this.setData({
        today: date,
        log,
        todayCount: logsOfDay.length
      });
    } catch (e) {
      console.error('loadLog local fail', e);
      this.setData({
        today: date,
        log: { date, source: '自制', shop: '', mood: '', rating: 0, note: '', photos: [] },
        todayCount: 0
      });
    }
    cloudStore.getJsonCached('coffeeLogs').then((cloudRaw) => {
      if (reqId !== this._loadLogReqId) return;
      if (cloudRaw && typeof cloudRaw === 'object') {
        const localNow = cloudStore.getJsonLocal('coffeeLogs') || {};
        const merged = cloudStore.mergeCoffeeLogs(cloudRaw, localNow);
        wx.setStorageSync('coffeeLogs', merged);
      }
    }).catch((e) => { console.warn('[record] cloud sync fail', e); });
  },

  onSourceTap(e) {
    const value = e.currentTarget.dataset.value;
    if (!value) return;
    const update = {
      'log.source': value,
      'log.shop': value === '消费' ? this.data.log.shop : ''
    };
    if (value !== '消费') update['log.location'] = null;
    this.setData(update);
  },

  onShopInput(e) {
    const shop = normalizeText(e.detail && e.detail.value, MAX_SHOP_LEN, false);
    this.setData({
      'log.shop': shop
    });
  },

  onChooseLocation() {
    const that = this;
    const sys = wx.getSystemInfoSync();
    const isDevTools = sys.platform === 'devtools' || (sys.platform === 'windows' || sys.platform === 'mac');
    if (isDevTools) {
      wx.showToast({
        title: '选点请在手机微信中打开使用',
        icon: 'none',
        duration: 2500
      });
      return;
    }
    wx.chooseLocation({
      success(res) {
        const name = res.name || res.address || '';
        if (name) {
          const safeShop = normalizeText(name, MAX_SHOP_LEN, false);
          that.setData({
            'log.shop': safeShop,
            'log.location': {
              latitude: res.latitude,
              longitude: res.longitude,
              address: res.address
            }
          });
        }
      },
      fail(err) {
        if (err.errMsg && err.errMsg.indexOf('auth deny') !== -1) {
          wx.showToast({ title: '需要授权位置', icon: 'none' });
        } else {
          wx.showToast({ title: '选点失败，请用手机打开小程序', icon: 'none' });
        }
      }
    });
  },

  onMoodTap(e) {
    const value = e.currentTarget.dataset.value;
    if (!value) return;
    this.setData({
      'log.mood': value
    });
  },

  onRatingTap(e) {
    const score = Number(e.currentTarget.dataset.score || 0);
    if (!score) return;
    this.setData({
      'log.rating': score
    });
  },

  onAddPhoto() {
    const that = this;
    wx.showActionSheet({
      itemList: ['从相册选择', '拍照并保存到相册'],
      success(res) {
        if (res.tapIndex === 0) {
          that.chooseFromAlbum();
        } else if (res.tapIndex === 1) {
          that.takePhotoAndSave();
        }
      }
    });
  },

  chooseFromAlbum() {
    const that = this;
    wx.chooseMedia({
      count: 6,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album'],
      success(res) {
        const paths = (res.tempFiles || []).map((f) => f.tempFilePath);
        that.appendPhotos(paths);
      }
    });
  },

  takePhotoAndSave() {
    const that = this;
    wx.chooseMedia({
      count: 3,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['camera'],
      success(res) {
        const paths = (res.tempFiles || []).map((f) => f.tempFilePath);
        that.appendPhotos(paths);
      }
    });
  },

  onRemovePhoto(e) {
    const index = e.currentTarget.dataset.index;
    if (index == null) return;
    const photos = (this.data.log.photos || []).slice();
    if (index < 0 || index >= photos.length) return;
    photos.splice(index, 1);
    this.setData({ 'log.photos': photos });
  },

  appendPhotos(newPaths) {
    if (!newPaths || !newPaths.length) return;
    const that = this;
    const current = this.data.log.photos || [];
    const rest = 9 - current.length;
    if (rest <= 0) {
      wx.showToast({ title: '最多 9 张照片', icon: 'none' });
      return;
    }
    const paths = newPaths.slice(0, rest);
    wx.showLoading({ title: '上传中…' });
    Promise.all(paths.map((p) => cloudStorage.uploadImage(p)))
      .then((fileIDs) => {
        const newPhotos = fileIDs.map((fileID) => ({ url: fileID, remark: '' }));
        const photos = current.concat(newPhotos).slice(0, 9);
        that.setData({ 'log.photos': photos });
      })
      .catch((err) => {
        console.error('photo upload fail', err);
        wx.showToast({ title: '照片上传失败，请重试', icon: 'none' });
      })
      .finally(() => wx.hideLoading());
  },

  onPhotoRemarkInput(e) {
    const index = e.currentTarget.dataset.index;
    const value = normalizeText((e.detail && e.detail.value) || '', MAX_REMARK_LEN, false);
    const photos = (this.data.log.photos || []).slice();
    if (index == null || index < 0 || index >= photos.length) return;
    photos[index] = { ...photos[index], remark: value };
    this.setData({ 'log.photos': photos });
  },

  onNoteInput(e) {
    const value = normalizeText((e.detail && e.detail.value) || '', MAX_NOTE_LEN, true);
    this.setData({
      'log.note': value
    });
  },

  async onPunch() {
    if (this.data.punching) return;
    this.setData({ punching: true });
    const log = this.data.log;
    const editIndex = typeof this.data.editIndex === 'number' && this.data.editIndex >= 0 ? this.data.editIndex : -1;
    if (log.source === '消费' && !log.shop) {
      this.setData({ punching: false });
      wx.showToast({ title: '请先填写店铺', icon: 'none' });
      return;
    }
    const safeLog = {
      ...log,
      shop: normalizeText(log.shop, MAX_SHOP_LEN, false),
      note: normalizeText(log.note, MAX_NOTE_LEN, true),
      photos: Array.isArray(log.photos)
        ? log.photos.map((p) => {
          if (typeof p === 'string') return { url: p, remark: '' };
          if (!p || typeof p !== 'object') return p;
          return { ...p, remark: normalizeText(p.remark, MAX_REMARK_LEN, false) };
        })
        : []
    };
    if (!safeLog.location) delete safeLog.location;
    let allLogs = cloudStore.getJsonLocal('coffeeLogs') || {};
    const date = this.data.today;
    const value = allLogs[date];
    let logsOfDay = [];
    if (Array.isArray(value)) {
      logsOfDay = value;
    } else if (value) {
      logsOfDay = [value];
    }

    if (editIndex >= 0 && editIndex < logsOfDay.length) {
      const existing = logsOfDay[editIndex];
      logsOfDay[editIndex] = {
        ...safeLog,
        date,
        id: existing.id || Date.now(),
        createdAt: existing.createdAt || Date.now()
      };
    } else {
      const newEntry = {
        ...safeLog,
        date,
        id: log.id || Date.now(),
        createdAt: log.createdAt || Date.now()
      };
      logsOfDay.push(newEntry);
    }
    allLogs[date] = logsOfDay;
    wx.setStorageSync('coffeeLogs', allLogs);

    // 不在当前页先清空内容，避免用户感知“空闪”；直接提示后返回上页
    this.setData({
      todayCount: logsOfDay.length,
      punching: false
    });

    wx.showToast({
      title: editIndex >= 0 ? '已更新打卡' : '已记录一杯咖啡',
      icon: 'success',
      duration: 800
    });

    setTimeout(() => {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        wx.navigateBack();
      } else {
        wx.redirectTo({
          url: '/pages/history/index'
        });
      }
    }, 800);

    cloudStore.setJson('coffeeLogs', allLogs).catch((e) => {
      console.error('cloud setJson fail', e);
      try {
        const app = getApp();
        if (app) app.globalData._pendingSyncError = true;
      } catch (e2) {}
    });
  },

});
