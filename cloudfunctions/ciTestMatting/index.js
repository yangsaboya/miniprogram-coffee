const cloud = require('wx-server-sdk');
const COS = require('cos-nodejs-sdk-v5');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 从云函数环境变量读取（与 segmentImage 同一套）
const SecretId = process.env.TENCENT_SECRET_ID;
const SecretKey = process.env.TENCENT_SECRET_KEY;
const Bucket = process.env.COS_BUCKET;
const Region = process.env.COS_REGION || 'ap-guangzhou';

exports.main = async (event) => {
  const { fileID } = event || {};
  if (!fileID) {
    return { ok: false, errMsg: '缺少 fileID' };
  }
  if (!SecretId || !SecretKey || !Bucket) {
    return {
      ok: false,
      errMsg: '请先在云函数环境变量配置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY / COS_BUCKET'
    };
  }

  try {
    // 1. 从小程序云存储下载原图（Buffer）
    const downloadRes = await cloud.downloadFile({ fileID });
    const srcBuffer = downloadRes.fileContent;
    if (!srcBuffer) {
      return { ok: false, errMsg: '下载云文件失败' };
    }

    const { OPENID: openid } = cloud.getWXContext();
    const cos = new COS({ SecretId, SecretKey });

    // 2. 上传到你自己的 COS 桶，同时用 Pic-Operations 做「通用抠图」
    const srcKey = `ci-test/source/${openid || 'anon'}_${Date.now()}.jpg`;
    const dstKey = `ci-test/cutout/${openid || 'anon'}_${Date.now()}.png`;

    const PicOperations = {
      is_pic_info: 0,
      rules: [
        {
          fileid: dstKey,
          rule: 'ci-process=AIPicMatting'
        }
      ]
    };

    const putResult = await new Promise((resolve, reject) => {
      cos.putObject(
        {
          Bucket,
          Region,
          Key: srcKey,
          Body: srcBuffer,
          PicOperations: JSON.stringify(PicOperations)
        },
        (err, data) => (err ? reject(err) : resolve(data))
      );
    });

    console.log('ciTestMatting putObject result:', putResult);

    // 3. 返回 COS 上抠图结果的路径，方便去控制台预览
    const cosHost = `${Bucket}.cos.${Region}.myqcloud.com`;
    const cutoutUrl = `https://${cosHost}/${dstKey}`;

    return {
      ok: true,
      srcKey,
      dstKey,
      cutoutUrl
    };
  } catch (err) {
    console.error('ciTestMatting error', err);
    return { ok: false, errMsg: err.message || String(err) };
  }
};
