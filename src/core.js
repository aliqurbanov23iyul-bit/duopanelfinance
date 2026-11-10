export const day = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Baku'}).format(date);
export function minor(input) {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(input)) throw Error('Məbləği iki onluq rəqəmlə daxil edin.');
  const [whole, fraction = ''] = input.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!result) throw Error('Məbləğ sıfırdan böyük olmalıdır.');
  return result;
}
export function money(value) {
  const cents = BigInt(value);
  const abs = cents < 0n ? -cents : cents;
  return (cents < 0n ? '−' : '') + (abs / 100n).toLocaleString('az-AZ') + ',' + String(abs % 100n).padStart(2,'0') + ' ₼';
}
export const sum = rows => rows.reduce((total, row) => total + BigInt(row.amount_minor), 0n);
export function balance(expenses, settlements, user) {
  return expenses.filter(row => row.shared).reduce((total, row) => {
    const otherShare = BigInt(row.amount_minor) / 2n;
    return total + (row.owner_id === user ? otherShare : -otherShare);
  }, 0n) + settlements.reduce((total,row) => total + BigInt(row.amount_minor) * (row.owner_id === user ? 1n : -1n), 0n);
}
export function csvCell(value) {
  const text = String(value ?? '');
  return '"' + (/^\s*[=+@-]|^[\t\r\n]/.test(text) ? "'" + text : text).replaceAll('"','""') + '"';
}
export const safeLink = input => {
  try { const url = new URL(input); return ['https:','http:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
};