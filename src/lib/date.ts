const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const dhakaDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dhakaTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

export function formatDateInputValue(value: string | number | readonly string[] | undefined) {
  if (typeof value !== 'string') return '';
  const match = DATE_ONLY_PATTERN.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

export function formatAppDate(value: string | Date | null | undefined) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = DATE_ONLY_PATTERN.exec(value);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dhakaDateFormatter.format(date);
}

export function formatAppDateTime(value: string | Date | null | undefined) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${dhakaDateFormatter.format(date)}, ${dhakaTimeFormatter.format(date).toUpperCase()}`;
}
