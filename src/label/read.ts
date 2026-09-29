import { recognize } from '../../modules/label-text';
import { parseLabel, rows, type LabelFood } from './parse';

const count = (f: LabelFood) => Object.keys(f.nutrients).length;

/** Per-serving values from a label photo, or null if nothing on it reads as a nutrition label. */
export async function readLabel(uri: string): Promise<LabelFood | null> {
  let best: LabelFood | null = null;
  for (const rotation of [0, 90, 270]) {
    const f = parseLabel(rows(await recognize(uri, rotation)));
    if (!best || count(f) > count(best)) best = f;
    if (count(f) >= 4) break;   // a real label has at least calories and three macros
  }
  return best && count(best) > 0 ? best : null;
}
