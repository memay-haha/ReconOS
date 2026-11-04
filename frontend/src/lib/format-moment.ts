const MOMENT = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  // Pinned so the text does not depend on the machine: the readers are operators in Vietnam.
  timeZone: 'Asia/Ho_Chi_Minh',
});

/** The locale puts the clock first; the project writes dd/mm/yyyy HH:mm. */
export function formatMoment(value: string): string {
  const part = Object.fromEntries(
    MOMENT.formatToParts(new Date(value)).map((p) => [p.type, p.value]),
  );
  return `${part.day}/${part.month}/${part.year} ${part.hour}:${part.minute}`;
}
