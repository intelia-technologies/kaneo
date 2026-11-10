import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import "../i18n";

// The API's limit for `pausaMotivo`; one line is what an input holds.
const MAX_LENGTH = 500;

// The optional reason of a task with `automatica` off: with one it is paused.
// Saving it empty clears it. Remount (key) to follow a newly saved value.
export function PauseReasonForm({
  saved,
  disabled,
  onSave,
}: {
  saved: string | null;
  disabled?: boolean;
  onSave: (reason: string | null) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState(saved ?? "");
  const next = reason.trim() || null;

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (next !== saved) onSave(next);
      }}
    >
      <Input
        size="sm"
        aria-label={t("intelia:automation.pauseReason")}
        placeholder={t("intelia:automation.pauseReasonPlaceholder")}
        value={reason}
        maxLength={MAX_LENGTH}
        onChange={(event) => setReason(event.target.value)}
        disabled={disabled}
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={disabled || next === saved}
      >
        {t("intelia:automation.savePauseReason")}
      </Button>
    </form>
  );
}
