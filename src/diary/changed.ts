let listener: (() => void) | null = null;
export function onDiaryChanged(fn: () => void) { listener = fn; }
export function diaryChanged() { listener?.(); }
