function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatLocalDateTimeInput(date: Date): string {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join('-') + `T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
