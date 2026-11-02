import { Flag, Workflow } from "lucide-react";
import "./dependencies/i18n";
import "./initiatives/i18n";

// Our project views, registered in upstream's `project-views.ts`. They also
// show as their own links next to Tasks and Backlog (`ProjectScopeToggle`),
// so they are not hidden in the Display menu.
export type InteliaView = "dependencies" | "initiatives";

export const INTELIA_PATHS = {
  dependencies:
    "/dashboard/workspace/$workspaceId/project/$projectId/dependencies",
  initiatives:
    "/dashboard/workspace/$workspaceId/project/$projectId/initiatives",
} as const;

export const INTELIA_VIEWS = [
  {
    id: "dependencies" as const,
    labelKey: "intelia:dependencies.title",
    icon: Workflow,
  },
  {
    id: "initiatives" as const,
    labelKey: "intelia:initiatives.title",
    icon: Flag,
  },
] as const;

export function isInteliaView(view: string): view is InteliaView {
  return Object.hasOwn(INTELIA_PATHS, view);
}
