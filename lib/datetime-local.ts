// Formats an ISO timestamp as the 'YYYY-MM-DDTHH:mm' shape an HTML
// datetime-local input expects — in LOCAL time. Using toISOString() here
// is a trap: it renders UTC wall-clock, the input's onBlur save path then
// re-parses that as local, and the stored time silently shifts by the UTC
// offset (an hour, during BST) on every touch.
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
