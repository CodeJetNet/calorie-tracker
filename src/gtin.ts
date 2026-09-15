export function valid(d: string): boolean {
  if (!/^\d{13}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(d[i]) * (i % 2 ? 3 : 1);
  return (10 - (s % 10)) % 10 === Number(d[12]);
}

export function expandUpcE(d: string): string {
  const n = d[0], c = d[7];
  const [a, b, cc, dd, e, f] = d.slice(1, 7);
  const body =
    '012'.includes(f) ? `${a}${b}${f}0000${cc}${dd}${e}` :
    f === '3' ? `${a}${b}${cc}00000${dd}${e}` :
    f === '4' ? `${a}${b}${cc}${dd}00000${e}` :
    `${a}${b}${cc}${dd}${e}0000${f}`;
  return n + body + c;
}

/** Any scanned or typed barcode to GTIN-13, or null if it is not a valid GTIN. */
export function normalize(code: string, symbology?: string): string | null {
  let d = code.replace(/\D/g, '');
  if (symbology === 'upc_e' && d.length === 8) d = expandUpcE(d);
  if (d.length === 14 && d[0] === '0') d = d.slice(1);
  if (d.length === 8 || d.length === 12) d = d.padStart(13, '0');
  return valid(d) ? d : null;
}
