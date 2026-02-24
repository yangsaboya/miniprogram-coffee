// 云函数：腾讯云数据万象「通用抠图」AIPicMatting（上传时处理），结果上传回微信云存储
// 流程：下载微信云文件 → 上传到你的 COS 并触发抠图 → 从 COS 拉取抠图结果 → 上传回微信云
const cloud = require('wx-server-sdk');
const COS = require('cos-nodejs-sdk-v5');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { fileID } = event || {};
  if (!fileID) {
    return { ok: false, errMsg: '缺少 fileID' };
  }

  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;
  const bucket = process.env.COS_BUCKET;
  const region = process.env.COS_REGION || 'ap-guangzhou';

  if (!secretId || !secretKey || !bucket) {
    return {
      ok: false,
      errMsg: '未配置腾讯云密钥或 COS 桶，请在云函数环境变量中配置 TENCENT_SECRET_ID、TENCENT_SECRET_KEY、COS_BUCKET'
    };
  }

  try {
    const { OPENID: openid } = cloud.getWXContext();
    const cos = new COS({ SecretId: secretId, SecretKey: secretKey });

    // 1. 从小程序云存储下载原图
    const downloadRes = await cloud.downloadFile({ fileID });
    const srcBuffer = downloadRes.fileContent;
    if (!srcBuffer) {
      return { ok: false, errMsg: '下载云文件失败' };
    }

    // 2. 上传到你的 COS 桶，同时用 Pic-Operations 做「通用抠图」（与 ciTestMatting 相同方式）
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2);
    const srcKey = `segment/source/${openid}_${ts}_${rand}.jpg`;
    const dstKey = `segment/cutout/${openid}_${ts}_${rand}.png`;
    // fileid 以 / 开头表示桶内绝对路径，否则会相对原图目录写入，getObject 会找不到
    const fileidAbsolute = `/${dstKey}`;

    const PicOperations = {
      is_pic_info: 0,
      rules: [{ fileid: fileidAbsolute, rule: 'ci-process=AIPicMatting' }]
    };

    await new Promise((resolve, reject) => {
      cos.putObject(
        {
          Bucket: bucket,
          Region: region,
          Key: srcKey,
          Body: srcBuffer,
          PicOperations: JSON.stringify(PicOperations)
        },
        (err, data) => (err ? reject(err) : resolve(data))
      );
    });

    // 3. 从 COS 拉取抠图结果
    const getResult = await new Promise((resolve, reject) => {
      cos.getObject(
        { Bucket: bucket, Region: region, Key: dstKey },
        (err, data) => (err ? reject(err) : resolve(data))
      );
    });

    const body = getResult.Body;
    if (!body) {
      return { ok: false, errMsg: '抠图结果为空' };
    }
    const pngBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body);

    // 4. 上传抠图结果到微信云存储
    const cloudPath = `cutout/${openid}/${ts}_${rand}.png`;
    const uploadRes = await cloud.uploadFile({
      cloudPath,
      fileContent: pngBuffer
    });

    if (!uploadRes.fileID) {
      return { ok: false, errMsg: '抠图结果上传失败' };
    }

    return { ok: true, fileID: uploadRes.fileID };
  } catch (err) {
    const msg = err.message || err.errMsg || String(err);
    console.error('segmentImage error', err);
    return { ok: false, errMsg: msg };
  }
};
