import { useTranslation } from "react-i18next";
import { INTELIA_VIEWS, isInteliaView } from "@/intelia/view";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { ProjectScopeLink } from "./project-scope-link";
import { type ProjectView, tasksViewFor } from "./project-views";

type ProjectScopeToggleProps = {
  workspaceId: string;
  projectId: string;
  currentView: ProjectView;
  onSelect: (view: ProjectView) => void;
};

export function ProjectScopeToggle({
  workspaceId,
  projectId,
  currentView,
  onSelect,
}: ProjectScopeToggleProps) {
  const { t } = useTranslation();
  const taskLayout = useUserPreferencesStore((state) => state.taskLayout);
  const viewMode = useUserPreferencesStore((state) => state.viewMode);
  const onBacklog = currentView === "backlog";
  // Intelia fork: Dependencies and Initiatives are links of their own here,
  // not hidden in the Display menu (design 19 §5).
  const onIntelia = isInteliaView(currentView);
  const tasksView =
    onBacklog || onIntelia ? tasksViewFor(taskLayout, viewMode) : currentView;

  return (
    <nav
      aria-label={t("tasks:view.heading")}
      className="flex h-7 shrink-0 items-center gap-0.5 rounded-lg border border-border/80 bg-background p-0.5 dark:bg-input/32"
    >
      <ProjectScopeLink
        view={tasksView}
        workspaceId={workspaceId}
        projectId={projectId}
        active={!onBacklog && !onIntelia}
        onSelect={onSelect}
      >
        {t("tasks:title")}
      </ProjectScopeLink>
      <ProjectScopeLink
        view="backlog"
        workspaceId={workspaceId}
        projectId={projectId}
        active={onBacklog}
        onSelect={onSelect}
      >
        {t("tasks:view.backlog")}
      </ProjectScopeLink>
      {INTELIA_VIEWS.map(({ id, labelKey, icon: Icon }) => (
        <ProjectScopeLink
          key={id}
          view={id}
          workspaceId={workspaceId}
          projectId={projectId}
          active={currentView === id}
          onSelect={onSelect}
        >
          <Icon className="size-3.5 sm:mr-1" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">{t(labelKey)}</span>
        </ProjectScopeLink>
      ))}
    </nav>
  );
}
