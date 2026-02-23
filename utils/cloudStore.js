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

const OPENID_TIMEOUT_MS = 10000;

/** 确保已拿到 openid（没有则请求云函数），超时或失败则返回 null，不阻塞首屏 */
function ensureOpenId() {
  const id = getOpenIdSync();
  if (id) return Promise.resolve(id);
  if (!wx.cloud) return Promise.resolve(null);
  const timeoutPromise = new Promise(function (resolve) {
    setTimeout(function () { resolve(null); }, OPENID_TIMEOUT_MS);
  });
  const callPromise = wx.cloud
    .callFunction({ name: 'getOpenId' })
    .then(function (res) {
      const openid = res.result && res.result.openid;
      if (openid) {
        try {
          getApp().globalData.openid = openid;
        } catch (e) {}
      }
      return openid || null;
    })
    .catch(function () { return null; });
  return Promise.race([callPromise, timeoutPromise]);
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
