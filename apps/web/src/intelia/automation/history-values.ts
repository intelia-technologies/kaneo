import type { TaskAutomationChange } from "./api";

export type DiaryValue = Pick<
  TaskAutomationChange,
  "automatica" | "pausaMotivo" | "verification" | "entrega"
>;

// The value before and after each change of the diary (newest first). A row
// carries its previous `automatica` and verification but not the previous
// delivery or pause: those come from the row before it, the next one in the
// list. The oldest row of the page has none to read, so they are taken as
// unchanged there. `from` is null for the first value a task got.
export function diaryValues(
  history: readonly TaskAutomationChange[],
): { entry: TaskAutomationChange; from: DiaryValue | null; to: DiaryValue }[] {
  return history.map((entry, index) => {
    const older = history[index + 1];
    const to = {
      automatica: entry.automatica,
      pausaMotivo: entry.pausaMotivo,
      verification: entry.verification,
      entrega: entry.entrega,
    };
    if (
      entry.previousVerification === null ||
      entry.previousAutomatica === null
    ) {
      return { entry, from: null, to };
    }
    const previousAutomatica = entry.previousAutomatica;
    return {
      entry,
      from: {
        automatica: previousAutomatica,
        pausaMotivo: previousAutomatica
          ? null
          : older
            ? older.pausaMotivo
            : entry.pausaMotivo,
        verification: entry.previousVerification,
        entrega: older ? older.entrega : entry.entrega,
      },
      to,
    };
  });
}
