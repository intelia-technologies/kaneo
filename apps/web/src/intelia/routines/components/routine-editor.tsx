import { useId } from "react";
import { useTranslation } from "react-i18next";
import WeekdayPicker from "@/components/task/weekday-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
} from "@/components/ui/number-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  defaultSchedule,
  MAX_EVERY_HOURS,
  SCHEDULE_KINDS,
  type Schedule,
  type ScheduleKind,
} from "../schedule";

type RoutineEditorProps = {
  value: Schedule;
  timezone: string;
  isSaving: boolean;
  onChange: (schedule: Schedule) => void;
  onSave: () => void;
  onCancel: () => void;
};

function TimeField({
  hour,
  minute,
  onChange,
}: {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-16 text-muted-foreground text-xs">
        {t("intelia:routines.panel.at")}
      </label>
      <Input
        id={id}
        type="time"
        size="sm"
        className="w-28"
        value={`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`}
        onChange={(event) => {
          const [h, m] = event.target.value.split(":").map(Number);
          if (Number.isInteger(h) && Number.isInteger(m)) onChange(h, m);
        }}
      />
    </div>
  );
}

export function RoutineEditor({
  value,
  timezone,
  isSaving,
  onChange,
  onSave,
  onCancel,
}: RoutineEditorProps) {
  const { t } = useTranslation();
  const cronId = useId();
  const canSave = value.kind !== "cron" || value.cron.trim().length > 0;

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave && !isSaving) onSave();
      }}
    >
      <div className="flex items-center gap-2">
        <span className="w-16 text-muted-foreground text-xs">
          {t("intelia:routines.panel.repeats")}
        </span>
        <Select
          value={value.kind}
          onValueChange={(kind) => {
            if (kind && kind !== value.kind)
              onChange(defaultSchedule(kind as ScheduleKind));
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-52 min-w-0"
            aria-label={t("intelia:routines.panel.repeats")}
          >
            <SelectValue>
              {t(`intelia:routines.kind.${value.kind}`)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SCHEDULE_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {t(`intelia:routines.kind.${kind}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {value.kind === "hours" && (
        <div className="flex items-center gap-2">
          <span className="w-16 text-muted-foreground text-xs">
            {t("intelia:routines.panel.every")}
          </span>
          <NumberField
            size="sm"
            className="w-16"
            min={1}
            max={MAX_EVERY_HOURS}
            step={1}
            value={value.every}
            onValueChange={(every) => {
              if (every && every >= 1 && every <= MAX_EVERY_HOURS)
                onChange({ kind: "hours", every });
            }}
          >
            <NumberFieldGroup>
              <NumberFieldInput
                aria-label={t("intelia:routines.panel.hours")}
              />
            </NumberFieldGroup>
          </NumberField>
          <span className="text-muted-foreground text-xs">
            {t("intelia:routines.panel.hours")}
          </span>
        </div>
      )}

      {value.kind === "weekdays" && (
        <div className="flex items-center gap-2">
          <span className="w-16 text-muted-foreground text-xs">
            {t("intelia:routines.panel.onDays")}
          </span>
          <div className="w-64">
            <WeekdayPicker
              value={value.days}
              onChange={(days) => onChange({ ...value, days })}
            />
          </div>
        </div>
      )}

      {(value.kind === "daily" || value.kind === "weekdays") && (
        <TimeField
          hour={value.hour}
          minute={value.minute}
          onChange={(hour, minute) => onChange({ ...value, hour, minute })}
        />
      )}

      {value.kind === "cron" && (
        <div className="flex flex-col gap-1">
          <label htmlFor={cronId} className="text-muted-foreground text-xs">
            {t("intelia:routines.panel.cron")}
          </label>
          <Input
            id={cronId}
            size="sm"
            className="font-mono"
            value={value.cron}
            spellCheck={false}
            onChange={(event) =>
              onChange({ kind: "cron", cron: event.target.value })
            }
          />
          <span className="text-muted-foreground/80 text-xs">
            {t("intelia:routines.panel.cronHint")}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="flex-1 text-muted-foreground/80 text-xs">
          {t("intelia:routines.panel.timezone", { timezone })}
        </span>
        <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
          {t("intelia:routines.panel.cancel")}
        </Button>
        <Button type="submit" size="xs" disabled={!canSave || isSaving}>
          {t("intelia:routines.panel.save")}
        </Button>
      </div>
    </form>
  );
}
