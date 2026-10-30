import { GitFork, SearchX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  totalTasks: number;
  filteredTasksCount: number;
  showLoose: boolean;
  onToggleShowLoose: () => void;
};

export function EmptyState({
  totalTasks,
  filteredTasksCount,
  showLoose,
  onToggleShowLoose,
}: EmptyStateProps) {
  const { t } = useTranslation();

  if (totalTasks === 0) {
    return (
      <div className="flex h-full min-h-[360px] flex-col items-center justify-center p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <GitFork className="size-6 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-sm font-semibold text-foreground">
          {t("intelia:dependencies.noTasks")}
        </h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          {t("intelia:dependencies.noTasksDescription")}
        </p>
      </div>
    );
  }

  if (filteredTasksCount === 0) {
    return (
      <div className="flex h-full min-h-[360px] flex-col items-center justify-center p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <SearchX className="size-6 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-sm font-semibold text-foreground">
          {t("intelia:dependencies.noTasksFound")}
        </h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          {t("tasks:filterBar.noMatches")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[360px] flex-col items-center justify-center p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <GitFork className="size-6 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-foreground">
        {t("intelia:dependencies.noDependencies")}
      </h3>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        {t("intelia:dependencies.noDependenciesDescription")}
      </p>
      {!showLoose && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={onToggleShowLoose}
        >
          {t("intelia:dependencies.showLoose")}
        </Button>
      )}
    </div>
  );
}
