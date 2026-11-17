import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/fetchers/get-api-url";
import { HttpError } from "@/lib/http-error";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import { isPerTaskRelationQuery } from "@/lib/relation-query-keys";
import {
  errorErrorDependenciasSinResolver,
  rutaCancelarTarea,
  type ErrorDependenciasSinResolver,
  type PeticionCancelar,
  type ResultadoCancelar,
} from "./contract/cancelar-con-dependientes";

export type CancelOutcome =
  | { status: "cancelled"; result: ResultadoCancelar }
  | { status: "unresolved"; error: ErrorDependenciasSinResolver };

/**
 * `POST /intelia/task/{taskId}/cancel` (design 82 §4.3). A
 * `409 DEPENDENCIAS_SIN_RESOLVER` is an answer, not a failure: it carries the
 * chain the panel draws. Anything else that is not 2xx throws.
 */
export async function cancelTaskWithDependents(
  taskId: string,
  body: PeticionCancelar,
): Promise<CancelOutcome> {
  const response = await fetch(getApiUrl(rutaCancelarTarea(taskId)), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 409) {
    const text = await response.text().catch(() => "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    if (errorErrorDependenciasSinResolver(parsed) === null) {
      return {
        status: "unresolved",
        error: parsed as ErrorDependenciasSinResolver,
      };
    }
    throw await HttpError.fromResponse({
      status: response.status,
      text: async () => text,
    });
  }
  if (!response.ok) throw await HttpError.fromResponse(response);
  return {
    status: "cancelled",
    result: (await response.json()) as ResultadoCancelar,
  };
}

export function useCancelTaskWithDependents(
  taskId: string,
  { onCancelled }: { onCancelled?: (result: ResultadoCancelar) => void } = {},
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: PeticionCancelar) =>
      cancelTaskWithDependents(taskId, body),
    onSuccess: (outcome) => {
      if (outcome.status !== "cancelled") return;
      // A cascade touches tasks of several boards: refresh them all.
      invalidateMyWork(queryClient);
      queryClient.invalidateQueries({ queryKey: ["task"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["project-relations"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ predicate: isPerTaskRelationQuery });
      onCancelled?.(outcome.result);
    },
  });
}
