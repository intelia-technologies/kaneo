export const ticketOf = (slug: string, number: number | null) =>
  `${slug}-${number ?? 0}`;

/** `SF-2491` → `{ slug: "SF", number: 2491 }`, or null. */
export function parseTicket(ticket: string) {
  const match = /^(.+)-(\d+)$/.exec(ticket);
  return match ? { slug: match[1]!, number: Number(match[2]) } : null;
}

/** By project, then by number (`SF-99` before `SF-100`). */
export function compareTickets(a: string, b: string) {
  const pa = parseTicket(a);
  const pb = parseTicket(b);
  if (!pa || !pb) return a < b ? -1 : a > b ? 1 : 0;
  if (pa.slug !== pb.slug) return pa.slug < pb.slug ? -1 : 1;
  return pa.number - pb.number;
}
