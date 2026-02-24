// 云函数：批量对当前用户咖啡架历史图片做一次「通用抠图」，仅用于自测
// 说明：
// - 不改前端交互，不提供按钮入口
// - 只处理「咖啡架从相册添加」的照片（id 以 shelf_ 开头，且还没有 cutoutUrl）
// - 调用已存在的 segmentImage 云函数，为每张图写入 cutoutUrl

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const COLLECTION = 'user_data';
const SHELF_ITEMS_KEY = 'shelfItems';

exports.main = async () => {
  const db = cloud.database();
  const { OPENID: openid } = cloud.getWXContext();
  if (!openid) {
    return { ok: false, errMsg: '未获取到 openid' };
  }

  const coll = db.collection(COLLECTION);

  try {
    const docRes = await coll.doc(openid).get();
    const data = docRes && docRes.data ? docRes.data : {};
    let items = Array.isArray(data[SHELF_ITEMS_KEY]) ? data[SHELF_ITEMS_KEY] : [];

    // 仅处理 shelf_ 开头、已有 url 且尚未有 cutoutUrl 的项
    const targets = items.filter(
      (p) =>
        p &&
        typeof p === 'object' &&
        p.id &&
        typeof p.id === 'string' &&
        p.id.startsWith('shelf_') &&
        p.url &&
        !p.cutoutUrl
    );

    if (!targets.length) {
      return { ok: true, total: items.length, processed: 0, success: 0, failed: 0, msg: '无待处理项' };
    }

    let success = 0;
    let failed = 0;

    // 顺序处理，避免同时大量调用抠图服务
    for (const target of targets) {
      try {
        const res = await cloud.callFunction({
          name: 'segmentImage',
          data: { fileID: target.url }
        });
        const result = (res && res.result) || {};
        if (result.ok && result.fileID) {
          // 回写到原 items 数组
          items = items.map((p) =>
            p && p.id === target.id
              ? { ...p, cutoutUrl: result.fileID }
              : p
          );
          success += 1;
        } else {
          console.error('batchSegmentShelf segmentImage fail', target.id, result.errMsg);
          failed += 1;
        }
      } catch (err) {
        console.error('batchSegmentShelf segmentImage error', target.id, err);
        failed += 1;
      }
    }

    // 保存回云数据库
    data[SHELF_ITEMS_KEY] = items;
    await coll.doc(openid).set({ data });

    return {
      ok: true,
      total: items.length,
      processed: targets.length,
      success,
      failed
    };
  } catch (err) {
    console.error('batchSegmentShelf main error', err);
    return { ok: false, errMsg: err.message || String(err) };
  }
};

