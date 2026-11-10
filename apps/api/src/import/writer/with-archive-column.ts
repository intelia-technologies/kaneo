import type { ImportedColumn, ImportedTask } from "@kaneo/importers";

// Not a source key: sources key columns by their own ids or slugs.
const ARCHIVE_COLUMN_KEY = "\u0000intelia-archive";

export const ARCHIVE_COLUMN_WARNING =
  'Added a final column "Done" for the archived tasks.';

/**
 * Intelia (design 53 §3.2): archived tasks come in closed, with the archive
 * mark. A source board without a final column (Trello) gets a final "Done" at
 * the end for them. A source without columns keeps the project's defaults.
 */
export function withArchiveColumn(
  columns: readonly ImportedColumn[],
  tasks: readonly ImportedTask[],
): { columns: readonly ImportedColumn[]; added: boolean } {
  const needed =
    columns.length > 0 &&
    !columns.some((column) => column.isFinal) &&
    tasks.some((task) => task.archived);
  return needed
    ? {
        columns: [
          ...columns,
          { key: ARCHIVE_COLUMN_KEY, name: "Done", isFinal: true },
        ],
        added: true,
      }
    : { columns, added: false };
}
