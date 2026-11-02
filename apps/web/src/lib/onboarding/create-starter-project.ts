import createProject from "@/fetchers/project/create-project";
import importTasks, { type TaskToImport } from "@/fetchers/task/import-tasks";
import { createInitiative } from "@/intelia/initiatives/api";
import "@/intelia/initiatives/i18n";
import generateProjectSlug from "@/lib/generate-project-id";
import { i18n } from "@/lib/i18n";

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
  try {
    const initiativeName = i18n.t("intelia:initiative.starterName", {
      defaultValue: "Getting started",
    });
    const initiative = await createInitiative(project.id, initiativeName);
    await importTasks(
      project.id,
      tasks,
      {
        level: "manual",
        verification: true,
      },
      initiative.id,
    );
  } catch {
    // If starter task creation fails, still return the created project.
  }
  return project.id;
}
