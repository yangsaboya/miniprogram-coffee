/**
 * 云存储图片本地缓存：把 cloud:// fileID 下载到 USER_DATA_PATH，下次直接用本地路径，减少重复下载。
 * 带简单 LRU，超过 MAX_ENTRIES 删最久未用的。
 * 对于非 cloud:// 的 url，直接原样返回，便于统一调用。
 */
const CACHE_STORAGE_KEY = 'imageCacheMap';
const CACHE_DIR = 'img';
const MAX_ENTRIES = 80;
const inflight = {};
let state = null;

function getFs() {
  return wx.getFileSystemManager && wx.getFileSystemManager();
}

function getCacheDir() {
  if (!wx.env || !wx.env.USER_DATA_PATH) return '';
  return `${wx.env.USER_DATA_PATH}/${CACHE_DIR}`;
}

function safeKey(fileID) {
  let h1 = 0, h2 = 5381;
  const s = String(fileID);
  for (let i = 0; i < s.length; i++) {
    h1 = ((h1 << 5) - h1 + s.charCodeAt(i)) | 0;
    h2 = ((h2 << 5) + h2 + s.charCodeAt(i)) | 0;
  }
  return (h1 >>> 0).toString(36) + '_' + (h2 >>> 0).toString(36);
}

function loadPersisted() {
  try {
    const raw = wx.getStorageSync(CACHE_STORAGE_KEY);
    if (raw && raw.map && Array.isArray(raw.list)) return { map: raw.map, list: raw.list };
  } catch (e) {}
  return { map: {}, list: [] };
}

function getState() {
  if (!state) state = loadPersisted();
  return state;
}

function savePersisted(map, list) {
  try {
    wx.setStorageSync(CACHE_STORAGE_KEY, { map, list });
  } catch (e) {
    console.warn('[imageCache] persist failed, evicting half', e);
    const fs = getFs();
    const half = Math.floor(list.length / 2);
    for (let i = 0; i < half; i++) {
      const oldId = list.shift();
      const oldPath = map[oldId];
      if (oldPath && fs) { try { fs.unlinkSync(oldPath); } catch (e2) {} }
      delete map[oldId];
    }
    try { wx.setStorageSync(CACHE_STORAGE_KEY, { map, list }); } catch (e2) {}
  }
}

function saveState() {
  const s = getState();
  savePersisted(s.map, s.list);
}

function ensureDir(fs, dir) {
  try {
    fs.accessSync(dir);
  } catch (e) {
    try {
      fs.mkdirSync(dir, true);
    } catch (e2) {}
  }
}

/**
 * 只缓存云存储 fileID（cloud:// 开头）
 */
function isCloudFileId(url) {
  return url && String(url).startsWith('cloud://');
}

/** 是否为本地文件路径（用于避免 url→本地 的重复 setData 导致闪烁） */
function isLocalPath(path) {
  if (!path || typeof path !== 'string') return false;
  const ud = wx.env && wx.env.USER_DATA_PATH;
  if (ud && path.indexOf(ud) === 0) return true;
  if (path.indexOf('wxfile://') === 0) return true;
  return false;
}

/**
 * 同步取已缓存的本地路径，用于首帧渲染，避免先空白再弹出。
 * 未命中或文件不存在返回 null。
 */
function getSync(fileID) {
  if (!fileID || !isCloudFileId(fileID)) return null;
  const fs = getFs();
  if (!fs) return null;
  const { map } = getState();
  const localPath = map && map[fileID];
  if (!localPath) return null;
  try {
    fs.accessSync(localPath);
    return localPath;
  } catch (e) {
    return null;
  }
}

/**
 * 获取展示用的本地路径；若未缓存则先返回原 url，后台下载完成后需调用方自行更新展示（如通过组件 setData）
 * @param {string} fileID - cloud:// 开头的 fileID
 * @returns {Promise<string>} 解析后用本地路径，失败或非 cloud 则返回原 fileID
 */
function get(fileID) {
  if (!fileID) return Promise.resolve('');
  if (!isCloudFileId(fileID)) return Promise.resolve(fileID);
  if (!wx.cloud || !wx.cloud.downloadFile) return Promise.resolve(fileID);

  const fs = getFs();
  const baseDir = getCacheDir();
  if (!fs || !baseDir) return Promise.resolve(fileID);

  const s = getState();
  let map = s.map;
  let list = s.list;
  const localPath = map[fileID];
  if (localPath) {
    try {
      fs.accessSync(localPath);
      list = list.filter((id) => id !== fileID);
      list.push(fileID);
      s.list = list;
      saveState();
      return Promise.resolve(localPath);
    } catch (e) {
      delete map[fileID];
      list = list.filter((id) => id !== fileID);
      s.map = map;
      s.list = list;
      saveState();
    }
  }

  ensureDir(fs, baseDir);
  const key = safeKey(fileID);
  const destPath = `${baseDir}/${key}`;

  if (inflight[fileID]) return inflight[fileID];

  inflight[fileID] = wx.cloud
    .downloadFile({ fileID })
    .then((res) => {
      const tempPath = res.tempFilePath;
      if (!tempPath) return fileID;
      fs.copyFileSync(tempPath, destPath);
      const cur = getState();
      const curMap = cur.map;
      let curList = cur.list.filter((id) => id !== fileID);
      curList.push(fileID);
      while (curList.length > MAX_ENTRIES) {
        const oldId = curList.shift();
        const oldPath = curMap[oldId];
        if (oldPath) {
          try { fs.unlinkSync(oldPath); } catch (e2) {}
          delete curMap[oldId];
        }
      }
      curMap[fileID] = destPath;
      cur.map = curMap;
      cur.list = curList;
      saveState();
      return destPath;
    })
    .catch(() => fileID)
    .finally(() => {
      delete inflight[fileID];
    });

  return inflight[fileID];
}

function prefetch(fileIDs, concurrency) {
  const list = (Array.isArray(fileIDs) ? fileIDs : [])
    .filter((id) => isCloudFileId(id));
  if (!list.length) return Promise.resolve();
  const limit = Math.max(1, Number(concurrency) || 4);
  let index = 0;

  function worker() {
    if (index >= list.length) return Promise.resolve();
    const id = list[index++];
    return get(id).then(() => worker());
  }

  const workers = [];
  const count = Math.min(limit, list.length);
  for (let i = 0; i < count; i++) workers.push(worker());
  return Promise.all(workers).then(() => {});
}

module.exports = {
  get,
  getSync,
  prefetch,
  isCloudFileId,
  isLocalPath
};
