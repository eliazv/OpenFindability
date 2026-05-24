export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateKey(date);
}

export function dateRange(days: number): string[] {
  const dates: string[] = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    dates.push(daysAgo(index));
  }
  return dates;
}

export function nowIso(): string {
  return new Date().toISOString();
}
