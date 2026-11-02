import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SectionHeader } from "@/components/task/sections/section-header";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  type AutomationLevel,
  type TaskAutomationChange,
  useSetTaskAutomation,
  useTaskAutomation,
  useTaskAutomationHistory,
} from "../api";
import "../i18n";
import {
  type AutomationDraft,
  EMPTY_AUTOMATION_DRAFT,
  toAutomationInput,
} from "../levels";
import { AutomationBadge } from "./automation-badge";
import { AutomationFields } from "./automation-fields";

type Source = TaskAutomationChange["source"];

// The selector is always shown (design decision 9): the API answers 403 to
// whoever may not change the level and that is surfaced as a toast. A change
// is saved the moment the draft is complete and valid: with two radio groups
// and no preselection that is one click, and it needs no extra "Save" state.
// To go from manual + no verification to completa the person first picks
// "Yes" (saved as manual + yes) and then "Completa".
export function TaskAutomationPanel({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const { data: saved, isError } = useTaskAutomation(taskId);
  const { data: history = [] } = useTaskAutomationHistory(taskId);
  const setAutomation = useSetTaskAutomation();
  // What the person has picked and not saved yet; null follows the saved value.
  const [pending, setPending] = useState<AutomationDraft | null>(null);

  const savedDraft: AutomationDraft = saved
    ? { level: saved.level, verification: saved.verification }
    : EMPTY_AUTOMATION_DRAFT;
  const draft = pending ?? savedDraft;

  // A refetched value (own change or someone else's) replaces the draft.
  useEffect(() => {
    setPending(null);
  }, [saved?.level, saved?.verification, saved?.setAt]);

  const sourceLabel = (source: Source) =>
    t(`intelia:automation.source.${source}`);
  const who = (
    name: string | null,
    actor: string | null,
    source: Source,
  ): string => name ?? actor ?? sourceLabel(source);
  const describe = (level: AutomationLevel, verification: boolean) =>
    `${t(`intelia:automation.levels.${level}`)} · ${
      verification
        ? t("intelia:automation.verified")
        : t("intelia:automation.notVerified")
    }`;

  const change = (next: AutomationDraft) => {
    setPending(next);
    const input = toAutomationInput(next);
    if (
      !input ||
      (input.level === savedDraft.level &&
        input.verification === savedDraft.verification)
    ) {
      return;
    }
    setAutomation.mutate(
      { taskId, input },
      {
        onError: (error) => {
          setPending(null);
          toast.error(
            error instanceof Error && error.message
              ? error.message
              : t("intelia:automation.saveError"),
          );
        },
      },
    );
  };

  return (
    <section className="flex flex-col gap-1">
      <SectionHeader title={t("intelia:automation.title")} />
      <div className="flex flex-col gap-2 px-2 py-1">
        {isError && (
          <p role="alert" className="text-destructive text-xs">
            {t("intelia:automation.loadError")}
          </p>
        )}
        {saved ? (
          <div className="flex flex-wrap items-center gap-2">
            <AutomationBadge
              level={saved.level}
              verification={saved.verification}
            />
            <span className="text-muted-foreground text-xs">
              {t("intelia:automation.setBy", {
                name: who(saved.setByName, saved.setByActor, saved.source),
                date: formatDateTime(saved.setAt),
              })}
            </span>
          </div>
        ) : (
          !isError && (
            <p className="text-muted-foreground text-xs">
              {t("intelia:automation.noLevel")}
            </p>
          )
        )}

        <AutomationFields
          value={draft}
          onChange={change}
          disabled={setAutomation.isPending}
        />

        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">
            {t("intelia:automation.history")}
          </span>
          {history.length === 0 ? (
            <span className="text-muted-foreground/70 text-xs">
              {t("intelia:automation.noHistory")}
            </span>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-baseline gap-x-2 text-xs"
                >
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {formatDateTime(entry.changedAt)}
                  </span>
                  <span className="text-foreground/85">
                    {entry.previousLevel === null ||
                    entry.previousVerification === null
                      ? t("intelia:automation.firstSet", {
                          to: describe(entry.level, entry.verification),
                        })
                      : t("intelia:automation.change", {
                          from: describe(
                            entry.previousLevel,
                            entry.previousVerification,
                          ),
                          to: describe(entry.level, entry.verification),
                        })}
                  </span>
                  <span className="text-muted-foreground/70">
                    {who(
                      entry.changedByName,
                      entry.changedByActor,
                      entry.source,
                    )}
                    {entry.source !== "session" &&
                      ` · ${sourceLabel(entry.source)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
