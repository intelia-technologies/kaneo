import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import "../i18n";

export function PanelFooter({
  pending,
  reasonOk,
  cancelCount,
  canSubmit,
  isSubmitting,
  onSubmit,
}: {
  pending: number;
  reasonOk: boolean;
  cancelCount: number;
  canSubmit: boolean;
  isSubmitting: boolean;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const p = "intelia:cancelWithDependents.footer";
  const status =
    pending > 0
      ? t(`${p}.missing`, { count: pending })
      : reasonOk
        ? t(`${p}.allDecided`)
        : t(`${p}.reasonMissing`);

  return (
    <div className="flex items-center justify-between gap-3 border-t bg-muted/72 px-6 py-4">
      <p aria-live="polite" className="text-sm">
        {status}
      </p>
      <Button
        type="button"
        variant="destructive"
        disabled={!canSubmit}
        onClick={onSubmit}
      >
        {isSubmitting
          ? t(`${p}.submitting`)
          : t(`${p}.submit`, { count: cancelCount })}
      </Button>
    </div>
  );
}
