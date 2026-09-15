const pad = (n: number) => String(n).padStart(2, '0');
export function toDay(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function today(): string { return toDay(new Date()); }
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return toDay(new Date(y, m - 1, d + n));
}
