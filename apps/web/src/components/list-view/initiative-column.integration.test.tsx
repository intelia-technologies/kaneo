// KF-23 (d): loading the list of a board with 150 tasks, every one in an
// initiative, against the real API. The «Iniciativa» column rides on the
// board's own read: the list makes exactly the API requests it makes with the
// column hidden (the list before the column existed), and the board itself
// is still read in its two pages of 100.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import ListView from "@/components/list-view";
import { tasksQueryOptions } from "@/hooks/queries/task/tasks-query-options";
import {
  initI18n,
  renderApp,
} from "@/intelia/cancel-with-dependents/integration/harness.integration";
import useProjectStore from "@/store/project";
import { useUserPreferencesStore } from "@/store/user-preferences";
import db, { schema } from "../../../../api/src/database";
import { createApp } from "../../../../api/src/index";
import {
  initiativeTable,
  taskInitiativeTable,
} from "../../../../api/src/intelia/schema";
import { mockAuthenticatedSession } from "../../../../../tests/api-integration/helpers/auth";
import { resetTestDatabase } from "../../../../../tests/api-integration/helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "../../../../../tests/api-integration/helpers/fixtures";

const TASKS = 150;
const STATUSES = ["to-do", "in-progress", "in-review", "done"];

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string;
    params: Record<string, string>;
    children: ReactNode;
  }) => (
    <a
      href={to.replace(/\$(\w+)/g, (_, key: string) => params[key] ?? "")}
      {...props}
    >
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  useRouter: () => ({ preloadRoute: () => Promise.resolve() }),
}));
vi.mock("@/components/shared/modals/create-task-modal", () => ({
  default: () => null,
}));

/** The list page: the tasks query feeds the project store, as the route does. */
function List({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { data } = useQuery(tasksQueryOptions(queryClient, projectId));
  const project = useProjectStore((state) => state.project);
  const setProject = useProjectStore((state) => state.setProject);
  useEffect(() => {
    if (data) setProject(data);
  }, [data, setProject]);
  return project?.id === projectId ? <ListView project={project} /> : null;
}

let projectId = "";
let projectSlug = "";
let requests: string[] = [];

beforeAll(initI18n);

beforeEach(async () => {
  await resetTestDatabase();
  localStorage.clear();
  const { user, workspace } = await createWorkspaceMember({ role: "owner" });
  mockAuthenticatedSession(user);
  const { project: kf } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Fork de Kaneo",
    slug: "KF",
  });
  const { project: sf } = await createProjectFixture({
    workspaceId: workspace.id,
    name: "Software Factory",
    slug: "SF",
  });
  projectId = kf.id;
  projectSlug = kf.slug;
  // Half in an initiative of the board, half in one of another project.
  const initiatives = await db
    .insert(initiativeTable)
    .values([
      {
        projectId: kf.id,
        name: "Tableros",
        nameKey: "tableros",
        source: "session",
      },
      {
        projectId: sf.id,
        name: "Trabajo entre tableros",
        nameKey: "trabajo entre tableros",
        source: "session",
      },
    ])
    .returning();
  const tasks = await db
    .insert(schema.taskTable)
    .values(
      Array.from({ length: TASKS }, (_, i) => ({
        projectId: kf.id,
        title: `Tarea ${i + 1}`,
        description: "",
        status: STATUSES[i % STATUSES.length]!,
        number: i + 1,
        position: i + 1,
      })),
    )
    .returning();
  await db.insert(taskInitiativeTable).values(
    tasks.map((task, i) => ({
      taskId: task.id,
      initiativeId: initiatives[i % 2]!.id,
      origin: "plan" as const,
      source: "session" as const,
    })),
  );

  const { app } = createApp();
  requests = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push(`${init?.method ?? "GET"} ${url.pathname}`);
    return app.request(url.pathname + url.search, init);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useProjectStore.setState({ project: undefined });
  useUserPreferencesStore.getState().resetDisplayPreferences();
});

/** Loads the whole list and returns the API requests it made, by path. */
async function loadList(showInitiative: boolean) {
  useUserPreferencesStore.setState({ showInitiative });
  requests = [];
  const { queryClient } = renderApp(<List projectId={projectId} />);
  await waitFor(
    () =>
      expect(document.querySelectorAll("[data-task-id]")).toHaveLength(TASKS),
    { timeout: 30_000 },
  );
  // Let any request a row starts after mounting go out and settle.
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  const made = [...requests].sort();
  cleanup();
  useProjectStore.setState({ project: undefined });
  return made;
}

describe(`the list of ${TASKS} tasks with the «Iniciativa» column`, () => {
  it("makes the same API requests as the list without it, and reads the board in two pages", async () => {
    const without = await loadList(false);
    expect(screen.queryAllByRole("link")).toHaveLength(0);

    const withColumn = await loadList(true);
    expect(withColumn).toEqual(without);
    expect(withColumn.filter((r) => r.includes("/api/task/tasks/"))).toEqual([
      `GET /api/task/tasks/${projectId}`,
      `GET /api/task/tasks/${projectId}`,
    ]);
    // No request about initiatives at all: the data came with the board.
    expect(withColumn.filter((r) => r.includes("initiative"))).toEqual([]);
  });

  it("shows every row's initiative, of this project or another, in every status group", async () => {
    useUserPreferencesStore.setState({ showInitiative: true });
    renderApp(<List projectId={projectId} />);
    await waitFor(
      () =>
        expect(document.querySelectorAll("[data-task-id]")).toHaveLength(TASKS),
      { timeout: 30_000 },
    );
    const own = screen.getAllByRole("link", { name: "Tableros" });
    const other = screen.getAllByRole("link", {
      name: "Trabajo entre tableros",
    });
    expect(own).toHaveLength(TASKS / 2);
    expect(other).toHaveLength(TASKS / 2);
    for (const status of STATUSES) {
      const rows = [...document.querySelectorAll("[data-task-id]")].filter(
        (row) =>
          Number(
            row.textContent?.match(new RegExp(`${projectSlug}-(\\d+)`))?.[1],
          ) %
            STATUSES.length ===
          (STATUSES.indexOf(status) + 1) % STATUSES.length,
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.querySelector("a")).not.toBeNull();
    }
  });
});
