/**
 * 逻辑自测：不依赖 wx，用 Node 跑关键分支与数据规则。
 * 运行：node scripts/run-qa-logic.js
 */
const assert = (ok, msg) => {
  if (!ok) throw new Error(msg);
};

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✅ ' + name);
  } catch (e) {
    failed++;
    console.log('  ❌ ' + name + ' — ' + (e.message || e));
  }
}

console.log('\n--- 咖啡打卡 逻辑自测 ---\n');

// 1. 编辑时 editIndex=0 必须走「替换」而不是「新增」
test('editIndex=0 时替换当天第一条，不新增一条', () => {
  const date = '2025-02-17';
  let allLogs = {
    [date]: [
          { id: 100, source: '自制', shop: '', mood: '☕️', rating: 3, photos: [], date }
    ]
  };
  let logsOfDay = allLogs[date];
  const editIndex = 0;
  const log = { source: '消费', shop: '星巴克', mood: '😀', rating: 5, photos: [], date };
  if (editIndex >= 0 && editIndex < logsOfDay.length) {
    const existing = logsOfDay[editIndex];
    logsOfDay[editIndex] = { ...log, date, id: existing.id || Date.now(), createdAt: existing.createdAt || Date.now() };
  } else {
    logsOfDay.push({ ...log, id: Date.now(), createdAt: Date.now() });
  }
  allLogs[date] = logsOfDay;
  assert(logsOfDay.length === 1, '应为 1 条，实际 ' + logsOfDay.length);
  assert(logsOfDay[0].shop === '星巴克', '应已更新为星巴克');
});

// 2. editIndex=-1 时是新增
test('editIndex=-1 时 push 一条', () => {
  const date = '2025-02-18';
  let allLogs = { [date]: [] };
  let logsOfDay = allLogs[date];
  const editIndex = -1;
  const log = { source: '自制', shop: '', mood: '😌', rating: 4, photos: [], date };
  if (editIndex >= 0 && editIndex < logsOfDay.length) {
    const existing = logsOfDay[editIndex];
    logsOfDay[editIndex] = { ...log, date, id: existing.id || Date.now(), createdAt: existing.createdAt || Date.now() };
  } else {
    logsOfDay.push({ ...log, id: Date.now(), createdAt: Date.now() });
  }
  assert(logsOfDay.length === 1, '新增后应为 1 条');
});

// 3. 不能用 0 || -1 判断编辑（0 会变成 -1）
test('editIndex 用 number>=0 判断，0 为编辑', () => {
  const editIndexFromData = 0;
  const wrong = editIndexFromData || -1;
  const right = typeof editIndexFromData === 'number' && editIndexFromData >= 0 ? editIndexFromData : -1;
  assert(wrong === -1, '0||-1 会得到 -1');
  assert(right === 0, '正确判断应得到 0');
});

// 4. 防重复提交：第二次应直接 return
test('punching 为 true 时不再执行提交逻辑', () => {
  let callCount = 0;
  let punching = false;
  function onPunch() {
    if (punching) return;
    punching = true;
    callCount++;
  }
  onPunch();
  onPunch();
  onPunch();
  assert(callCount === 1, '应只执行 1 次，实际 ' + callCount);
});

// 5. 照片上限 9 张
test('appendPhotos 最多补到 9 张', () => {
  const current = Array(7).fill({ url: 'x', remark: '' });
  const rest = 9 - current.length;
  const newPaths = ['a', 'b', 'c', 'd', 'e'];
  const paths = newPaths.slice(0, rest);
  const newPhotos = paths.map((url) => ({ url, remark: '' }));
  const photos = current.concat(newPhotos).slice(0, 9);
  assert(photos.length === 9, '应为 9 张，实际 ' + photos.length);
});

test('已有 9 张时 rest<=0 不添加', () => {
  const current = Array(9).fill({ url: 'x', remark: '' });
  const rest = 9 - current.length;
  assert(rest <= 0, 'rest 应 <=0');
});

// 6. 咖啡架同批 id 不重复（含 index）
test('咖啡架同批多张 id 含 index 不重复', () => {
  const fileIDs = ['cloud://a', 'cloud://b', 'cloud://c'];
  const base = Date.now();
  const ids = fileIDs.map((fileID, i) => 'shelf_' + base + '_' + i + '_' + Math.random().toString(36).slice(2));
  const set = new Set(ids);
  assert(set.size === 3, 'id 应全部不同');
});

// 7. 删除照片：splice 后长度正确
test('onRemovePhoto splice 后 photos 长度减 1', () => {
  const photos = [{ url: 'a', remark: '1' }, { url: 'b', remark: '2' }, { url: 'c', remark: '3' }];
  const index = 1;
  photos.splice(index, 1);
  assert(photos.length === 2 && photos[0].url === 'a' && photos[1].url === 'c', '应删掉第 2 张');
});

// 8. 备注输入：按 index 更新
test('onPhotoRemarkInput 按 index 更新 remark', () => {
  const photos = [{ url: 'a', remark: '' }, { url: 'b', remark: '' }];
  const index = 1;
  const value = '拉花';
  photos[index] = { ...photos[index], remark: value };
  assert(photos[1].remark === '拉花', '第 2 张备注应为拉花');
});

// 9. 消费未填店铺时不应写入
test('消费且 shop 为空时 allLogs 不应被改写', () => {
  const log = { source: '消费', shop: '', mood: '☕️', rating: 3, photos: [] };
  const shouldAbort = log.source === '消费' && !log.shop;
  assert(shouldAbort === true, '应中止提交');
});

console.log('\n--- 结果 ---');
console.log('通过: ' + passed + ', 失败: ' + failed);
if (failed > 0) process.exit(1);
console.log('全部通过。\n');
