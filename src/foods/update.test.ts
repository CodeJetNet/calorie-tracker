import { checkDue, firstOk, pickFile, type Manifest } from './update';
const m: Manifest = { schemaVersion: 1, builtAt: '2026-09-15T06:00:00Z', files: [
  { name: 'foods-US.zip', country: 'US', bytes: 80_000_000, md5: 'aaa', url: 'https://cdn/b/foods-US.zip', mirror: 'https://gh/b/foods-US.zip' },
  { name: 'foods-CA.zip', country: 'CA', bytes: 30_000_000, md5: 'bbb', url: 'https://cdn/b/foods-CA.zip', mirror: 'https://gh/b/foods-CA.zip' },
] };
test('picks the country file', () => expect(pickFile(m, 'CA', 1)?.md5).toBe('bbb'));
test('unknown country yields null', () => expect(pickFile(m, 'FR', 1)).toBeNull());
test('newer schema yields null', () => expect(pickFile({ ...m, schemaVersion: 2 }, 'US', 1)).toBeNull());

const H = 3_600_000;
test('check is due after 20 to 28 hours, jittered', () => {
  expect(checkDue(null, 0, 0.5)).toBe(true);
  expect(checkDue(0, 19 * H, 0)).toBe(false);
  expect(checkDue(0, 20 * H, 0)).toBe(true);
  expect(checkDue(0, 27 * H, 1)).toBe(false);
  expect(checkDue(0, 28 * H, 1)).toBe(true);
});

test('firstOk falls through to the next url and returns the first resolved value', async () => {
  const tried: string[] = [];
  const get = async (u: string) => { tried.push(u); if (u === 'cdn') throw new Error('down'); return u; };
  expect(await firstOk(['cdn', 'mirror', 'never'], get)).toBe('mirror');
  expect(tried).toEqual(['cdn', 'mirror']);
});
