const COLLECTION = 'user_data';

function getDb() {
  return wx.cloud ? wx.cloud.database() : null;
}

function getOpenIdSync() {
  try {
    return getApp().globalData.openid || null;
  } catch (e) {
    return null;
  }
}

/** 确保已拿到 openid（没有则请求云函数），再读写云库 */
function ensureOpenId() {
  const id = getOpenIdSync();
  if (id) return Promise.resolve(id);
  if (!wx.cloud) return Promise.resolve(null);
  return wx.cloud
    .callFunction({ name: 'getOpenId' })
    .then((res) => {
      const openid = res.result && res.result.openid;
      if (openid) {
        try {
          getApp().globalData.openid = openid;
        } catch (e) {}
      }
      return openid || null;
    })
    .catch(() => null);
}

function getCollection() {
  const db = getDb();
  if (!db) return null;
  return db.collection(COLLECTION);
}

/** 同步读本地缓存，不请求云，用于首屏秒开 */
function getJsonLocal(key) {
  try {
    const raw = wx.getStorageSync(key);
    return raw !== undefined && raw !== '' ? raw : null;
  } catch (e) {
    return null;
  }
}

function getJson(key) {
  const coll = getCollection();
  if (!coll) return Promise.resolve(null);
  return ensureOpenId().then((openid) => {
    if (!openid) return null;
    return coll
      .doc(openid)
      .get()
      .then((res) => (res && res.data && res.data[key]) || null)
      .catch(() => null);
  });
}

function setJson(key, value) {
  const coll = getCollection();
  if (!coll) return Promise.resolve();
  return ensureOpenId().then((openid) => {
    if (!openid) return;
    return coll
      .doc(openid)
      .get()
      .then((res) => {
        const data = (res && res.data) ? { ...res.data } : {};
        data[key] = value;
        return coll.doc(openid).set({ data });
      })
      .catch((getErr) => {
        // 文档不存在时 get 会报错，直接创建新文档
        return coll.doc(openid).set({ data: { [key]: value } });
      })
      .then(() => {
        console.log('[cloudStore] setJson ok', key);
      })
      .catch((err) => {
        console.error('[cloudStore] setJson fail', key, err);
        throw err;
      });
  });
}

module.exports = {
  ensureOpenId,
  getJson,
  getJsonLocal,
  setJson
};
