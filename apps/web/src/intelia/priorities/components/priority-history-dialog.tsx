import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import { type Priority, type PriorityChange, usePriorityHistory } from "../api";

const FIELDS = [
  "title",
  "body",
  "status",
  "parentId",
  "position",
  "projectIds",
] as const;

export function PriorityHistoryDialog({
  open,
  onOpenChange,
  priority,
  titles,
  projectNames,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  priority: Priority;
  // To show parents and projects by name; an id it lacks shows as is.
  titles: ReadonlyMap<string, string>;
  projectNames: ReadonlyMap<string, string>;
}) {
  const { t, i18n } = useTranslation();
  const {
    data: changes,
    isLoading,
    isError,
  } = usePriorityHistory(priority.id, open);

  const show = (field: (typeof FIELDS)[number], value: unknown): string => {
    if (value === null || value === undefined || value === "") return "—";
    if (field === "parentId") return titles.get(String(value)) ?? String(value);
    if (field === "status") {
      return t(`intelia:priorities.status.${String(value)}`);
    }
    if (field === "projectIds" && Array.isArray(value)) {
      return (
        value
          .map((id) => projectNames.get(String(id)) ?? String(id))
          .join(", ") || "—"
      );
    }
    return String(value);
  };

  const describe = (change: PriorityChange) =>
    t(`intelia:priorities.historyDialog.${change.kind}`, {
      name:
        change.changedByName ?? t("intelia:priorities.historyDialog.unknown"),
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("intelia:priorities.historyDialog.title")} · {priority.title}
          </DialogTitle>
        </DialogHeader>
        <DialogPanel>
          {isLoading ? null : isError ? (
            <p role="alert" className="text-muted-foreground text-sm">
              {t("intelia:priorities.historyDialog.loadError")}
            </p>
          ) : !changes?.length ? (
            <p className="text-muted-foreground text-sm">
              {t("intelia:priorities.historyDialog.empty")}
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {changes.map((change) => (
                <li key={change.id} className="text-sm">
                  <p className="font-medium">
                    {describe(change)}
                    <span className="ml-2 font-normal text-muted-foreground text-xs">
                      {formatDateTime(change.changedAt, i18n.language)}
                    </span>
                  </p>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                    {FIELDS.filter((field) => field in change.value).map(
                      (field) => (
                        <div key={field} className="contents">
                          <dt className="text-muted-foreground">
                            {t(
                              `intelia:priorities.historyDialog.field.${field}`,
                            )}
                          </dt>
                          <dd className="whitespace-pre-wrap break-words">
                            {change.previous
                              ? `${show(field, change.previous[field])} → `
                              : ""}
                            {show(field, change.value[field])}
                          </dd>
                        </div>
                      ),
                    )}
                  </dl>
                </li>
              ))}
            </ol>
          )}
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            {t("intelia:priorities.historyDialog.close")}
          </DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
