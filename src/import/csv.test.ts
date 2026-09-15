import { parseCsv } from './csv';
test('quoted fields, escaped quotes, CRLF, BOM', () => {
  expect(parseCsv('﻿a,b\r\n1,"x, ""y"""\r\n2,\r\n')).toEqual([['a', 'b'], ['1', 'x, "y"'], ['2', '']]);
});
test('newline inside quotes', () => {
  expect(parseCsv('a\n"line1\nline2"')).toEqual([['a'], ['line1\nline2']]);
});
