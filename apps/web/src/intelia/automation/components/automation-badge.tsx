import {
  Bot,
  GitPullRequest,
  GitPullRequestClosed,
  Hand,
  PauseCircle,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { TaskAutomation } from "../api";
import "../i18n";

// Automática (or the pause and its reason), verification and delivery in
// words, each with its own icon: the colour only repeats what the text says
// (design 18 §5.1).
export function AutomationBadge({
  automation,
  className,
}: {
  automation: Pick<
    TaskAutomation,
    "automatica" | "pausaMotivo" | "verification" | "entrega"
  >;
  className?: string;
}) {
  const { t } = useTranslation();
  const { automatica, pausaMotivo, verification, entrega } = automation;
  const paused = !automatica && Boolean(pausaMotivo);
  const AutomaticaIcon = automatica ? Bot : paused ? PauseCircle : Hand;
  const VerificationIcon = verification ? ShieldCheck : ShieldOff;
  const EntregaIcon = entrega === "pr" ? GitPullRequest : GitPullRequestClosed;
  const automaticaText = automatica
    ? t("intelia:automation.card.automatica")
    : paused
      ? t("intelia:automation.card.paused", { motivo: pausaMotivo })
      : t("intelia:automation.card.manual");
  const verificationText = verification
    ? t("intelia:automation.verified")
    : t("intelia:automation.notVerified");
  const entregaText = entrega
    ? t(`intelia:automation.card.entrega.${entrega}`)
    : null;

  return (
    <Badge
      variant={automatica ? "info" : paused ? "warning" : "outline"}
      size="sm"
      className={cn("min-w-0 max-w-full gap-1", className)}
      data-automation-automatica={automatica}
      data-automation-paused={paused || undefined}
      data-automation-verification={verification}
      data-automation-entrega={entrega ?? undefined}
      title={[automaticaText, verificationText, entregaText]
        .filter(Boolean)
        .join(" · ")}
    >
      <AutomaticaIcon aria-hidden="true" />
      <span className="truncate">{automaticaText}</span>
      <span aria-hidden="true">·</span>
      <VerificationIcon aria-hidden="true" />
      <span>{verificationText}</span>
      {entregaText && (
        <>
          <span aria-hidden="true">·</span>
          <EntregaIcon aria-hidden="true" />
          <span>{entregaText}</span>
        </>
      )}
    </Badge>
  );
}
