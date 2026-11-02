export function formatTaskIdentifier(
  projectSlug: string | null | undefined,
  number: number | null | undefined,
  fallbackId?: string,
): string {
  if (projectSlug && number != null) {
    return `${projectSlug}-${number}`;
  }
  if (number != null) {
    return String(number);
  }
  return fallbackId ?? "";
}

export function formatBlockReason(
  reason: string | null | undefined,
  detail: string | null | undefined,
  fallback: string,
): string {
  if (reason && detail) return `${reason}: ${detail}`;
  if (detail) return detail;
  if (reason) return reason;
  return fallback;
}

export function resolveColumnName(
  columns:
    | readonly { id?: string; slug?: string; name: string }[]
    | null
    | undefined,
  statusSlug: string,
): string {
  if (!columns || columns.length === 0) return statusSlug;
  const match = columns.find(
    (col) => col.slug === statusSlug || col.id === statusSlug,
  );
  return match?.name ?? statusSlug;
}
