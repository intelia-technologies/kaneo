/**
 * Where a task that arrives archived goes when its closed column is unknown
 * (imports, design 53 §3.2): the final column `done`, or else the first final
 * column. None when the board has no final column. `columns` in board order.
 */
export function archiveColumn<
  T extends { slug: string; isFinal: boolean | null },
>(columns: readonly T[]): T | undefined {
  const final = columns.filter((column) => column.isFinal);
  return final.find((column) => column.slug === "done") ?? final[0];
}
