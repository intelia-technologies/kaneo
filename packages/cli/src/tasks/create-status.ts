import { Result } from "effect";
import type { Column } from "../api/schemas.js";
import { InvalidArgument } from "../errors/errors.js";
import { matchColumn } from "./match-column.js";

export const FALLBACK_STATUS = "to-do";

export function createStatus(
  columns: ReadonlyArray<Column>,
  wanted: string | undefined,
  projectName: string,
): Result.Result<Column | null, InvalidArgument> {
  const ordered = [...columns].sort((a, b) => a.position - b.position);
  // Intelia: «Pedida» is first but never a default (design 52 §3.2).
  if (wanted === undefined)
    return Result.succeed(
      ordered.find((column) => column.slug !== "pedida") ?? ordered[0] ?? null,
    );
  const match = matchColumn(ordered, wanted);
  if (match) return Result.succeed(match);
  return Result.fail(
    new InvalidArgument({
      message: `${projectName} has no column "${wanted}".`,
      ...(ordered.length > 0
        ? {
            hint: `Pass -s with one of: ${ordered.map((column) => column.slug).join(", ")}.`,
          }
        : {}),
    }),
  );
}
