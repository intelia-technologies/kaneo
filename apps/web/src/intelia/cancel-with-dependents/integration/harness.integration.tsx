// The web against the real API of CD-03 (design 82): the Hono app runs
// in-process over the throwaway PostgreSQL of the integration harness, with
// INTELIA_CANCEL_GUARD on, and every `fetch` of the web goes to it.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "i18next";
import type { ReactNode } from "react";
import { initReactI18next } from "react-i18next";
import { expect, vi } from "vite-plus/test";
import db, { schema } from "../../../../../api/src/database";
import { createApp } from "../../../../../api/src/index";
import { mockAuthenticatedSession } from "../../../../../../tests/api-integration/helpers/auth";
import { seedWorkspace } from "../../../../../../tests/api-integration/helpers/cancel-chain";
import { resetTestDatabase } from "../../../../../../tests/api-integration/helpers/database";
import { createWorkspaceMember } from "../../../../../../tests/api-integration/helpers/fixtures";
import { CancelPanelHost } from "../entry/cancel-panel-host";
import { useCancelPanelStore } from "../entry/cancel-panel-store";

export const REASON = "Se parte en dos tareas: la cadena ya no aplica.";

export type SeededBoard = {
  workspaceId: string;
  projectId: string;
  /** Kaneo id of a task by key. */
  id: (ticket: string) => string;
  /** Its status in the database now. */
  status: (ticket: string) => Promise<string>;
};

/**
 * Board KF: KF-1 blocks KF-2, which blocks KF-3; KF-4 has no dependents.
 * Plus a «Cancelled» column (the default board has none).
 */
export async function seedBoard(): Promise<SeededBoard> {
  await resetTestDatabase();
  vi.stubEnv("INTELIA_CANCEL_GUARD", "1");
  const { user, workspace } = await createWorkspaceMember({
    role: "owner",
    userName: "Jaime",
  });
  mockAuthenticatedSession(user);
  const seeded = await seedWorkspace(workspace.id, user.id);
  for (const ticket of ["KF-1", "KF-2", "KF-3", "KF-4"])
    await seeded.add(ticket, { titulo: `Tarea ${ticket}` });
  await seeded.relate("KF-1", "KF-2");
  await seeded.relate("KF-2", "KF-3");
  const projectId = seeded.projects.get("KF")!;
  await db.insert(schema.columnTable).values({
    projectId,
    name: "Cancelled",
    slug: "cancelled",
    position: 10,
    isFinal: true,
  });

  const { app } = createApp();
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    return app.request(url.pathname + url.search, init);
  });
  useCancelPanelStore.setState({ request: null });

  return {
    workspaceId: workspace.id,
    projectId,
    id: (ticket: string) => seeded.ids.get(ticket)!,
    status: async (ticket: string) => (await seeded.task(ticket)).status,
  };
}

export async function initI18n() {
  if (!i18n.isInitialized)
    await i18n.use(initReactI18next).init({
      lng: "es",
      fallbackLng: "es",
      interpolation: { escapeValue: false },
      resources: {},
    });
  else await i18n.changeLanguage("es");
}

/** `ui` with a fresh query client and panel D's host, as in the layout. */
export function renderApp(ui: ReactNode, queryClient = newQueryClient()) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        {ui}
        <CancelPanelHost />
      </QueryClientProvider>,
    ),
  };
}

export const newQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

/** Panel D is open on `root` with the chain of the 409. */
export async function expectPanel(root: string, chain: string[]) {
  await waitFor(() =>
    expect(useCancelPanelStore.getState().request).not.toBeNull(),
  );
  const { error } = useCancelPanelStore.getState().request!;
  expect(error.details.tarea.ticket).toBe(root);
  expect(
    error.details.cadena.map((node) => ("ticket" in node ? node.ticket : null)),
  ).toEqual(chain);
  expect(
    await screen.findByRole("heading", { name: `Cancelar ${root}` }),
  ).toBeInTheDocument();
  for (const ticket of chain) expect(chainNode(ticket)).not.toBeNull();
}

/** A node of the panel's chain: a button when it can be decided. */
export const chainNode = (ticket: string) =>
  screen.queryByRole("button", { name: new RegExp(`^${ticket} `) }) ??
  document.querySelector<HTMLElement>(`[data-ticket="${ticket}"]`);

/** «Cancelar todo» with a reason, and confirm. */
export async function cancelAllInPanel(count: number) {
  fireEvent.click(screen.getByRole("button", { name: "✕ Cancelar todo" }));
  fireEvent.change(screen.getByLabelText("Motivo"), {
    target: { value: REASON },
  });
  fireEvent.click(
    screen.getByRole("button", { name: `Cancelar ${count} tareas` }),
  );
  await waitFor(() =>
    expect(useCancelPanelStore.getState().request).toBeNull(),
  );
}
