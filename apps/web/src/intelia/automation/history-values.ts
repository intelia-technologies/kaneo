import type { TaskAutomationChange } from "./api";

// Rows of the diary shown. The API is asked for one more: see `diaryValues`.
export const HISTORY_LIMIT = 50;

export type DiaryValue = Pick<
  TaskAutomationChange,
  "automatica" | "pausaMotivo" | "verification" | "entrega"
>;

// The value before and after each of the first HISTORY_LIMIT changes of the diary
// (newest first). A row carries its previous `automatica` and verification but
// not the previous delivery or pause: those come from the row before it, the
// next one in the list, so `history` brings one row more than is shown. Only
// a row with no earlier one in the diary at all keeps its own values there.
// `from` is null for the first value a task got.
export function diaryValues(
  history: readonly TaskAutomationChange[],
): { entry: TaskAutomationChange; from: DiaryValue | null; to: DiaryValue }[] {
  return history.slice(0, HISTORY_LIMIT).map((entry, index) => {
    const older = history[index + 1] ?? entry;
    const to = {
      automatica: entry.automatica,
      pausaMotivo: entry.pausaMotivo,
      verification: entry.verification,
      entrega: entry.entrega,
    };
    const { previousAutomatica, previousVerification } = entry;
    if (previousVerification === null || previousAutomatica === null) {
      return { entry, from: null, to };
    }
    return {
      entry,
      from: {
        automatica: previousAutomatica,
        pausaMotivo: previousAutomatica ? null : older.pausaMotivo,
        verification: previousVerification,
        entrega: older.entrega,
      },
      to,
    };
  });
}
