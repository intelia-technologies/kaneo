import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type Task from "@/types/task";
import { TaskClassification } from "./task-classification";

const save = vi.hoisted(() => vi.fn());
vi.mock("@/fetchers/task/update-task-classification", () => ({
  default: save,
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canUpdateTasks: () => true }),
}));

afterEach(cleanup);

function renderClassification(task: Partial<Task>) {
  const value = { id: "t1", projectId: "p1", ...task } as Task;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TaskClassification task={value} />
    </QueryClientProvider>,
  );
  return value;
}

describe("TaskClassification", () => {
  it("requires a valid declaration for a legacy task and saves it", async () => {
    save.mockReset().mockResolvedValue({});
    renderClassification({
      title: "stale",
      description: "stale",
      priority: "high",
    });
    const button = screen.getByRole("button", {
      name: "Guardar clasificación",
    });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Tipo de tarea"), {
      target: { value: "implementacion" },
    });
    fireEvent.change(screen.getByLabelText("Validación en producción"), {
      target: { value: "no_aplica" },
    });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo"), {
      target: { value: "  Cubierto  " },
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith("t1", {
        type: "implementacion",
        validationInProduction: "no_aplica",
        validationInProductionReason: "Cubierto",
      }),
    );
  });

  it("clears the production declaration when changing to diseño", async () => {
    save.mockReset().mockResolvedValue({});
    renderClassification({
      type: "operacion",
      validationInProduction: "requerida",
    });
    fireEvent.change(screen.getByLabelText("Tipo de tarea"), {
      target: { value: "diseno" },
    });
    expect(screen.queryByLabelText("Validación en producción")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar clasificación" }),
    );
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith("t1", {
        type: "diseno",
        validationInProduction: null,
        validationInProductionReason: null,
      }),
    );
  });
});
