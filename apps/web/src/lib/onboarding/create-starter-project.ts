import createProject from "@/fetchers/project/create-project";
import importTasks, { type TaskToImport } from "@/fetchers/task/import-tasks";
import generateProjectSlug from "@/lib/generate-project-id";

export const FALLBACK_PROJECT_SLUG = "PRJ";

export async function createStarterProject({
  workspaceId,
  name,
  tasks,
}: {
  workspaceId: string;
  name: string;
  tasks: TaskToImport[];
}) {
  const project = await createProject({
    name,
    slug: generateProjectSlug(name) || FALLBACK_PROJECT_SLUG,
    workspaceId,
    icon: "Layout",
  });
  // Onboarding sample tasks are not chosen by the person: they get the
  // factory's safe default, the same one the one-off backfill gives.
  await importTasks(project.id, tasks, {
    level: "manual",
    verification: true,
  }).catch(() => undefined);
  return project.id;
}
