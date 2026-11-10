import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SectionHeader } from "@/components/task/sections/section-header";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  type AutomationChangeInput,
  useSetTaskAutomation,
  useTaskAutomation,
  useTaskAutomationHistory,
} from "../api";
import { type AutomationDraft, EMPTY_AUTOMATION_DRAFT } from "../draft";
import "../i18n";
import { AutomationBadge } from "./automation-badge";
import { AutomationFields } from "./automation-fields";
import { AutomationHistory } from "./automation-history";
import { PauseReasonForm } from "./pause-reason-form";

// The selector is always shown (design decision 9): the API answers 403 to
// whoever may not change the automation and that is surfaced as a toast. A
// change is saved the moment Automática and verification are known, so each
// click is one `PUT` with the whole value (design 48 §3.2); a task without
// delivery (older tasks) keeps it empty until one is chosen. With Automática
// off, the pause reason is optional and saved on its own.
export function TaskAutomationPanel({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const { data: saved, isError } = useTaskAutomation(taskId);
  const { data: history = [] } = useTaskAutomationHistory(taskId);
  const setAutomation = useSetTaskAutomation();
  // What the person has picked and not saved yet; null follows the saved value.
  const [pending, setPending] = useState<AutomationDraft | null>(null);

  const savedDraft: AutomationDraft = saved
    ? {
        automatica: saved.automatica,
        verification: saved.verification,
        entrega: saved.entrega,
      }
    : EMPTY_AUTOMATION_DRAFT;
  const draft = pending ?? savedDraft;

  // A refetched value (own change or someone else's) replaces the draft.
  useEffect(() => {
    setPending(null);
  }, [saved?.setAt]);

  const save = (input: AutomationChangeInput) =>
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

  const change = (next: AutomationDraft) => {
    setPending(next);
    const { automatica, verification, entrega } = next;
    if (
      automatica === null ||
      verification === null ||
      (automatica === savedDraft.automatica &&
        verification === savedDraft.verification &&
        entrega === savedDraft.entrega)
    ) {
      return;
    }
    // The reason only survives while Automática stays off.
    const keepsPause = !automatica && saved?.automatica === false;
    save({
      automatica,
      verification,
      entrega,
      pausaMotivo: keepsPause ? saved.pausaMotivo : null,
    });
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
            <AutomationBadge automation={saved} />
            <span className="text-muted-foreground text-xs">
              {t("intelia:automation.setBy", {
                name:
                  saved.setByName ??
                  saved.setByActor ??
                  t(`intelia:automation.source.${saved.source}`),
                date: formatDateTime(saved.setAt),
              })}
            </span>
          </div>
        ) : (
          !isError && (
            <p className="text-muted-foreground text-xs">
              {t("intelia:automation.none")}
            </p>
          )
        )}

        <AutomationFields
          value={draft}
          onChange={change}
          disabled={setAutomation.isPending}
        />

        {saved?.automatica === false && draft.automatica === false && (
          <PauseReasonForm
            key={saved.setAt}
            saved={saved.pausaMotivo}
            disabled={setAutomation.isPending}
            onSave={(pausaMotivo) =>
              save({
                automatica: false,
                verification: saved.verification,
                entrega: saved.entrega,
                pausaMotivo,
              })
            }
          />
        )}

        <AutomationHistory history={history} />
      </div>
    </section>
  );
}
