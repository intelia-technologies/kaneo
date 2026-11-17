import { formatDateMedium } from "@/lib/format";

// Through the gateway the session or key is the factory's: the graph id it
// declares (`actor`) names who really did it, so it goes first.
export function pauseAuthor(
  name: string | null,
  actor: string | null,
): string | null {
  return actor ?? name;
}

// `revisarEl` is a calendar day (YYYY-MM-DD): read it as local midnight so it
// shows the same day in every time zone.
export function formatReviewDate(revisarEl: string): string {
  return formatDateMedium(new Date(`${revisarEl}T00:00:00`));
}
