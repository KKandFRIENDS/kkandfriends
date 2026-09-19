import { dateKey } from './core.js';

export function mondayOf(date) {
  const day = new Date(`${date}T00:00:00Z`);
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return dateKey(day);
}

export function weeklyReadiness(date, rows, minimum = 3) {
  const start = mondayOf(date);
  const published = rows.filter(row => row.edition_date >= start && row.edition_date <= date);
  return { date, start, minimum, published, count: published.length, ready: published.length >= minimum, missing: Math.max(0, minimum - published.length) };
}
