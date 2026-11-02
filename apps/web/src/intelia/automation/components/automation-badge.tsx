import { Bot, Hand, ShieldCheck, ShieldOff, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { AutomationLevel } from "../api";
import "../i18n";

const LEVEL_ICON = { manual: Hand, arranque: Zap, completa: Bot } as const;

// The level and the verification mark in words, each with its own icon: the
// colour only repeats what the text says (design 18 §5.1).
export function AutomationBadge({
  level,
  verification,
  className,
}: {
  level: AutomationLevel;
  verification: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const LevelIcon = LEVEL_ICON[level];
  const VerificationIcon = verification ? ShieldCheck : ShieldOff;
  const levelText = t(`intelia:automation.levels.${level}`);
  const verificationText = verification
    ? t("intelia:automation.verified")
    : t("intelia:automation.notVerified");

  return (
    <Badge
      variant={level === "manual" ? "outline" : "info"}
      size="sm"
      className={cn("gap-1", className)}
      data-automation-level={level}
      data-automation-verification={verification}
      title={t("intelia:automation.badgeLabel", {
        level: levelText,
        verification: verificationText,
      })}
    >
      <LevelIcon aria-hidden="true" />
      <span>{levelText}</span>
      <span aria-hidden="true">·</span>
      <VerificationIcon aria-hidden="true" />
      <span>{verificationText}</span>
    </Badge>
  );
}
