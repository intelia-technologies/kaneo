import { eq } from "drizzle-orm";
import db from "../../database";
import { boardSignalTable } from "../schema";
import type { BoardSignalsData, BoardSignalsInput } from "./schema";

/** GET …/project/{projectId}/board-signals: the last write, or empty. */
export async function getBoardSignals(projectId: string) {
  const [row] = await db
    .select()
    .from(boardSignalTable)
    .where(eq(boardSignalTable.projectId, projectId));
  if (!row) return { calculado_en: null, columnas: {}, tareas: {} };
  const signals = row.signals as BoardSignalsData;
  return {
    calculado_en: row.calculatedAt,
    columnas: signals.columnas,
    tareas: signals.tareas,
  };
}

/** PUT …/project/{projectId}/board-signals: replaces the project's signals. */
export async function putBoardSignals(
  projectId: string,
  input: BoardSignalsInput,
  userId: string,
) {
  const values = {
    signals: { columnas: input.columnas, tareas: input.tareas },
    calculatedAt: new Date(input.calculado_en),
    updatedByUserId: userId,
    updatedAt: new Date(),
  };
  await db
    .insert(boardSignalTable)
    .values({ projectId, ...values })
    .onConflictDoUpdate({ target: boardSignalTable.projectId, set: values });
  return getBoardSignals(projectId);
}
