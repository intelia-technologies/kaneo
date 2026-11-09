import { isRequestedStatus } from "@/intelia/requests/status";

type WorkflowColumn = { slug: string; isFinal: boolean };

export function getInitialTaskColumn<T extends WorkflowColumn>(
  columns: T[] | undefined,
  status?: string,
): T | undefined {
  if (status) return columns?.find((column) => column.slug === status);
  const counts = new Map<string, number>();
  for (const column of columns ?? []) {
    counts.set(column.slug, (counts.get(column.slug) ?? 0) + 1);
  }
  // Creation accepts slugs, so an ambiguous legacy slug cannot pick a column.
  // Intelia: «Pedida» is first but never a default (design 52 §3.2).
  return columns?.find(
    (column) =>
      !column.isFinal &&
      !isRequestedStatus(column.slug) &&
      counts.get(column.slug) === 1,
  );
}
