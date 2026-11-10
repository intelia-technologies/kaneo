import {
  Bot,
  GitPullRequest,
  GitPullRequestClosed,
  Hand,
  PauseCircle,
  ShieldCheck,
  ShieldOff,
  Undo2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type Task from "@/types/task";
import { type TaskAutomation, useProjectAutomation } from "../api";
import "../i18n";

const ROLES = ["responsable", "implementador", "verificador"] as const;

// Every card reads the project's shared query: the request is deduplicated
// (one per project) and a task without a row shows nothing.
export function TaskCardAutomation({
  task,
}: {
  task: Pick<Task, "id" | "projectId">;
}) {
  const { data } = useProjectAutomation(task.projectId);
  const automation = data?.get(task.id);
  if (!automation) return null;

  return <TaskCardAutomationFields automation={automation} />;
}

// The task's fields in words, each with its own icon: `automatica` is the
// primary mark (design 48 §3.2). Null fields render nothing.
function TaskCardAutomationFields({
  automation,
}: {
  automation: TaskAutomation;
}) {
  const { t } = useTranslation();
  const AutomaticaIcon = automation.automatica ? Bot : Hand;
  const VerificationIcon = automation.verification ? ShieldCheck : ShieldOff;
  const paused = !automation.automatica && automation.pausaMotivo;
  const pausedText = paused
    ? t("intelia:automation.card.paused", { motivo: automation.pausaMotivo })
    : null;
  const EntregaIcon =
    automation.entrega === "pr" ? GitPullRequest : GitPullRequestClosed;
  const roles = ROLES.flatMap((role) => {
    const id = automation[role];
    return id
      ? [{ role, text: t(`intelia:automation.card.${role}`, { id }) }]
      : [];
  });

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <Badge
          variant={automation.automatica ? "info" : "outline"}
          size="sm"
          className="gap-1"
          data-automation-automatica={automation.automatica}
        >
          <AutomaticaIcon aria-hidden="true" />
          <span>
            {automation.automatica
              ? t("intelia:automation.card.automatica")
              : t("intelia:automation.card.manual")}
          </span>
        </Badge>
        {pausedText && (
          <Badge
            variant="warning"
            size="sm"
            className="min-w-0 max-w-48 gap-1"
            title={pausedText}
            data-automation-paused
          >
            <PauseCircle aria-hidden="true" />
            <span className="truncate">{pausedText}</span>
          </Badge>
        )}
        <Badge
          variant="outline"
          size="sm"
          className="gap-1"
          data-automation-verification={automation.verification}
        >
          <VerificationIcon aria-hidden="true" />
          <span>
            {automation.verification
              ? t("intelia:automation.verified")
              : t("intelia:automation.notVerified")}
          </span>
        </Badge>
        {automation.entrega && (
          <Badge
            variant="outline"
            size="sm"
            className="gap-1"
            data-automation-entrega={automation.entrega}
          >
            <EntregaIcon aria-hidden="true" />
            <span>
              {t(`intelia:automation.card.entrega.${automation.entrega}`)}
            </span>
          </Badge>
        )}
        {automation.columnaPrevia && (
          <Badge
            variant="outline"
            size="sm"
            className="gap-1"
            data-automation-columna-previa={automation.columnaPrevia}
          >
            <Undo2 aria-hidden="true" />
            <span>
              {t("intelia:automation.card.columnaPrevia", {
                slug: automation.columnaPrevia,
              })}
            </span>
          </Badge>
        )}
      </div>
      {roles.length > 0 && (
        <p
          className="truncate text-muted-foreground text-xs"
          title={roles.map(({ text }) => text).join(" · ")}
          data-automation-roles
        >
          {roles.map(({ role, text }, index) => (
            <span key={role} data-automation-role={role}>
              {index > 0 && <span aria-hidden="true"> · </span>}
              {text}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
