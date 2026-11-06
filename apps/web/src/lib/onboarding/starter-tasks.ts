import type { TFunction } from "i18next";
import type { WorkspaceUsage } from "@/constants/onboarding";
import type { TaskToImport } from "@/fetchers/task/import-tasks";

export function starterTasks(
  t: TFunction,
  usage: WorkspaceUsage,
): TaskToImport[] {
  const tasks = [
    {
      title: t("auth:onboarding.starterTasks.drag.title"),
      description: t("auth:onboarding.starterTasks.drag.description"),
    },
    {
      title: t("auth:onboarding.starterTasks.details.title"),
      description: t("auth:onboarding.starterTasks.details.description"),
    },
    ...(usage === "team"
      ? [
          {
            title: t("auth:onboarding.starterTasks.invite.title"),
            description: t("auth:onboarding.starterTasks.invite.description"),
          },
        ]
      : []),
    {
      title: t("auth:onboarding.starterTasks.integrations.title"),
      description: t("auth:onboarding.starterTasks.integrations.description"),
    },
    {
      title: t("auth:onboarding.starterTasks.create.title"),
      description: t("auth:onboarding.starterTasks.create.description"),
    },
  ];

  return tasks.map((task) => ({
    ...task,
    type: "operacion" as const,
    validationInProduction: "no_aplica" as const,
    validationInProductionReason: "Onboarding guidance; no production change.",
    status: "to-do",
    priority: "no-priority",
  }));
}
