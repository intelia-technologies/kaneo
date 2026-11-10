import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import "../i18n";

/**
 * What the archived section shows while its tasks load or when they fail: a
 * failed load must not read as "no archived tasks".
 */
export function ArchivedTasksStatus({
  isError,
  onRetry,
}: {
  isError: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (!isError)
    return (
      <p
        role="status"
        className="py-6 px-4 text-center text-xs text-muted-foreground"
      >
        {t("intelia:archive.loading")}
      </p>
    );
  return (
    <div
      role="alert"
      className="flex items-center justify-center gap-2 py-6 px-4 text-xs text-destructive"
    >
      <span>{t("intelia:archive.loadError")}</span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        {t("intelia:archive.retry")}
      </Button>
    </div>
  );
}
