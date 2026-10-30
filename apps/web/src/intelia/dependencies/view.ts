import { Workflow } from "lucide-react";
import "./i18n";

export type InteliaView = "dependencies";

export const INTELIA_PATHS = {
  dependencies:
    "/dashboard/workspace/$workspaceId/project/$projectId/dependencies",
} as const;

export const INTELIA_VIEWS = [
  {
    id: "dependencies" as const,
    labelKey: "intelia:dependencies.title",
    icon: Workflow,
  },
] as const;
