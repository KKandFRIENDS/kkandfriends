/**
 * Display a database date without leaking its transport timestamp.
 * The first calendar date is preserved exactly, avoiding timezone shifts.
 */
export function dateOnly(value) {
  const text = String(value ?? '');
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : text;
}

export function displayDate(value) {
  const match = dateOnly(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}. ${Number(match[2])}. ${Number(match[3])}.` : String(value ?? '');
}
