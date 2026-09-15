/** 64-bit-ish FNV-1a as hex, for stable import ids. Not for security. */
export function stableId(s: string): string {
  const h = (seed: number) => { let x = seed; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; } return x.toString(16).padStart(8, '0'); };
  return h(0x811c9dc5) + h(0x01234567);
}
