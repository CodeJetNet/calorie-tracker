// One listener slot, no unsubscribe, by design: BackupWiring is the only subscriber and lives as long as the app.
let listener: (() => void) | null = null;
export function onDiaryChanged(fn: () => void) { listener = fn; }
export function diaryChanged() { listener?.(); }
