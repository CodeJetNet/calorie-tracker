/** One piece of recognized text. Coordinates are fractions of the image, y down. */
export type Fragment = { text: string; x: number; y: number; w: number; h: number };

const mid = (f: Fragment) => f.y + f.h / 2;

/** Fragments whose vertical centers are within half a line height of a row's first fragment join that row. */
export function rows(frags: Fragment[]): string[] {
  const out: Fragment[][] = [];
  for (const f of [...frags].sort((a, b) => mid(a) - mid(b))) {
    const row = out[out.length - 1];
    if (row && Math.abs(mid(f) - mid(row[0])) < Math.min(f.h, row[0].h) / 2) row.push(f);
    else out.push([f]);
  }
  return out.map(r => r.sort((a, b) => a.x - b.x).map(f => f.text).join(' '));
}
