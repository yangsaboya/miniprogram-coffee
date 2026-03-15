function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 安全解析 YYYY-MM-DD 字符串为本地时间 Date 对象。
 * 避免 new Date("YYYY-MM-DD") 按 UTC 解析导致时区偏移。
 * 如果传入 Date 对象则直接返回，非法值返回 new Date()。
 */
function parseLocalDate(input) {
  if (input instanceof Date) return input;
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const parts = input.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }
  if (typeof input === 'string' && input) {
    const parts = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (parts) return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  }
  return new Date();
}

module.exports = { formatDate, parseLocalDate };
