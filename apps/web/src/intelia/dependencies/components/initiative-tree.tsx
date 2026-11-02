import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import "../i18n";
import { useDependenciesGraph } from "../use-dependencies-graph";
import { DependenciesView } from "./dependencies-view";

export type InitiativeTreeProps = {
  projectId: string;
  workspaceId: string;
  initiativeId: string;
  showCancelled: boolean;
  onShowCancelledChange: (value: boolean) => void;
  onOpenTask: (taskId: string) => void;
};

export function InitiativeTree({
  projectId,
  workspaceId,
  initiativeId,
  showCancelled,
  onShowCancelledChange,
  onOpenTask,
}: InitiativeTreeProps) {
  const { t } = useTranslation();
  const switchId = useId();
  const [showLoose, setShowLoose] = useState(true);

  const { graphModel, isLoading, isError, refetch } = useDependenciesGraph({
    projectId,
    workspaceId,
    initiativeId,
    showLoose,
    showCancelled,
    onOpenTask,
  });
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between border-b px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Switch
            id={switchId}
            checked={showCancelled}
            onCheckedChange={(checked) => onShowCancelledChange(checked)}
          />
          <label
            htmlFor={switchId}
            className="cursor-pointer select-none font-medium text-muted-foreground"
          >
            {t("intelia:dependencies.showCancelled")}
          </label>
        </div>

        <Link
          to="/dashboard/workspace/$workspaceId/project/$projectId/dependencies"
          params={{ workspaceId, projectId }}
          search={{ initiativeId }}
          className="inline-flex items-center gap-1 font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <span>{t("intelia:dependencies.openInDependencies")}</span>
          <ExternalLink className="size-3" />
        </Link>
      </div>

      <div className="relative min-h-0 w-full flex-1">
        <DependenciesView
          model={graphModel}
          showLoose={showLoose}
          onToggleShowLoose={() => setShowLoose(true)}
          isLoading={isLoading}
          isError={isError}
          onRetry={refetch}
        />
      </div>
    </div>
  );
}
