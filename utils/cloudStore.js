const COLLECTION = 'user_data';
let openIdPromise = null;
let callPromiseRef = null;
const SAFE_KEY_RE = /^[A-Za-z0-9_]{1,64}$/;

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

function ensureOpenId() {
  const id = getOpenIdSync();
  if (id) return Promise.resolve(id);
  if (!wx.cloud) return Promise.resolve(null);
  if (openIdPromise) return openIdPromise;
  if (!callPromiseRef) {
    callPromiseRef = wx.cloud
      .callFunction({ name: 'getOpenId' })
      .then(function (res) {
        const openid = res.result && res.result.openid;
        if (openid) {
          try { getApp().globalData.openid = openid; } catch (e) {}
        }
        return openid || null;
      })
      .catch(function () { return null; })
      .finally(function () { callPromiseRef = null; });
  }
  const timeoutPromise = new Promise(function (resolve) {
    setTimeout(function () { resolve(null); }, OPENID_TIMEOUT_MS);
  });
  openIdPromise = Promise.race([callPromiseRef, timeoutPromise]).finally(function () {
    openIdPromise = null;
  });
  return openIdPromise;
}

function getCollection() {
  const db = getDb();
  if (!db) return null;
  return db.collection(COLLECTION);
}

function isSafeKey(key) {
  if (!key || typeof key !== 'string') return false;
  if (key === '__proto__' || key === 'prototype' || key === 'constructor') return false;
  return SAFE_KEY_RE.test(key);
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
  if (!isSafeKey(key)) return Promise.resolve(null);
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
  if (!isSafeKey(key)) return Promise.reject(new Error('invalid key'));
  const coll = getCollection();
  if (!coll) return Promise.resolve();
  return ensureOpenId().then((openid) => {
    if (!openid) return;
    const patch = {};
    patch[key] = value;
    return coll
      .doc(openid)
      .update({ data: patch })
      .catch(() => {
        // 更新失败时回退到“读取并合并”后 set，避免覆盖其他字段
        return coll.doc(openid).get()
          .then((res) => {
            const data = (res && res.data) ? { ...res.data, ...patch } : patch;
            return coll.doc(openid).set({ data });
          })
          .catch((getErr) => {
            const code = getErr && (getErr.errCode || (getErr.result && getErr.result.errCode));
            const msg = (getErr && getErr.message) || '';
            if (code === -502005 || msg.indexOf('not exist') !== -1 || msg.indexOf('does not exist') !== -1) {
              return coll.doc(openid).set({ data: patch });
            }
            throw getErr;
          });
      })
      .then(() => {
        invalidateCache(key);
        console.log('[cloudStore] setJson ok', key);
      })
      .catch((err) => {
        console.error('[cloudStore] setJson fail', key, err);
        throw err;
      });
  });
}

/** 合并云端 coffeeLogs 与本地，保留本地 cutoutUrl 和本地独有条目 */
function mergeCoffeeLogs(cloudRaw, localRaw) {
  const out = {};
  const dates = [...new Set([...Object.keys(cloudRaw || {}), ...Object.keys(localRaw || {})])];
  dates.forEach((date) => {
    const cDay = cloudRaw[date];
    const lDay = localRaw[date];
    const cArr = Array.isArray(cDay) ? cDay : (cDay ? [cDay] : []);
    const lArr = Array.isArray(lDay) ? lDay : (lDay ? [lDay] : []);
    if (cArr.length === 0) { out[date] = lArr; return; }
    out[date] = cArr.map((log, i) => {
      const loc = lArr[i] || null;
      const photos = Array.isArray(log.photos) ? log.photos : [];
      const mp = photos.map((p, pi) => {
        const lp = loc && loc.photos && loc.photos[pi] ? loc.photos[pi] : null;
        if (lp && lp.cutoutUrl) return { ...p, cutoutUrl: lp.cutoutUrl };
        return p;
      });
      return { ...log, photos: mp };
    });
    if (lArr.length > cArr.length) {
      out[date] = out[date].concat(lArr.slice(cArr.length));
    }
  });
  return out;
}

const CLOUD_CACHE = {};
const CLOUD_CACHE_TTL = 15000;

/** 带 TTL 缓存的 getJson，15 秒内重复请求同一 key 直接返回缓存 */
function getJsonCached(key) {
  const now = Date.now();
  const cached = CLOUD_CACHE[key];
  if (cached && now - cached.ts < CLOUD_CACHE_TTL) {
    return Promise.resolve(cached.data);
  }
  return getJson(key).then((data) => {
    CLOUD_CACHE[key] = { data, ts: Date.now() };
    return data;
  });
}

/** setJson 成功后使对应 key 的缓存失效 */
function invalidateCache(key) {
  delete CLOUD_CACHE[key];
}

module.exports = {
  ensureOpenId,
  getJson,
  getJsonCached,
  getJsonLocal,
  setJson,
  mergeCoffeeLogs,
  invalidateCache
};
