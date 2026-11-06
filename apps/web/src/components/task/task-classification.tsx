import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import updateTaskClassification from "@/fetchers/task/update-task-classification";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import type Task from "@/types/task";

export function TaskClassification({ task }: { task: Task }) {
  const [type, setType] = useState<NonNullable<Task["type"]> | "">(
    task.type ?? "",
  );
  const [validation, setValidation] = useState<
    NonNullable<Task["validationInProduction"]> | ""
  >(task.validationInProduction ?? "");
  const [reason, setReason] = useState(task.validationInProductionReason ?? "");
  const { canUpdateTasks } = useWorkspacePermission();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      updateTaskClassification(task.id, {
        type: type as NonNullable<Task["type"]>,
        validationInProduction: needsValidation ? validation || null : null,
        validationInProductionReason:
          needsValidation && validation === "no_aplica" ? reason.trim() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", task.id] });
      queryClient.invalidateQueries({ queryKey: ["tasks", task.projectId] });
    },
  });
  const needsValidation = type === "implementacion" || type === "operacion";
  const valid =
    !!type &&
    (!needsValidation ||
      (!!validation &&
        (validation !== "no_aplica" ||
          (!!reason.trim() && !/[\r\n]/.test(reason)))));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) mutation.mutate();
      }}
      className="flex flex-col gap-2 py-4"
    >
      <label>
        Tipo de tarea
        <select
          aria-label="Tipo de tarea"
          disabled={!canUpdateTasks() || mutation.isPending}
          value={type}
          onChange={(e) => {
            setType(e.target.value as typeof type);
            setValidation("");
            setReason("");
          }}
          className="block w-full rounded border p-2"
        >
          <option value="">Seleccionar</option>
          <option value="implementacion">Implementación</option>
          <option value="validacion">Validación</option>
          <option value="operacion">Operación</option>
          <option value="diseno">Diseño</option>
        </select>
      </label>
      {needsValidation && (
        <label>
          Validación en producción
          <select
            aria-label="Validación en producción"
            disabled={!canUpdateTasks() || mutation.isPending}
            value={validation}
            onChange={(e) => setValidation(e.target.value as typeof validation)}
            className="block w-full rounded border p-2"
          >
            <option value="">Seleccionar</option>
            <option value="requerida">Requerida</option>
            <option value="no_aplica">No aplica</option>
          </select>
        </label>
      )}
      {needsValidation && validation === "no_aplica" && (
        <label>
          Motivo
          <input
            aria-label="Motivo"
            disabled={!canUpdateTasks() || mutation.isPending}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="block w-full rounded border p-2"
          />
        </label>
      )}
      {canUpdateTasks() && (
        <button type="submit" disabled={!valid || mutation.isPending}>
          Guardar clasificación
        </button>
      )}
      {mutation.isError && (
        <p role="alert">No se pudo guardar la clasificación.</p>
      )}
    </form>
  );
}
