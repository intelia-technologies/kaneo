import { useTranslation } from "react-i18next";
import type { InitiativeSummary } from "../api";
import "./i18n";
import { statsOf } from "../progress";

export function InitiativeStatsBar({
  initiatives,
}: {
  initiatives: readonly InitiativeSummary[];
}) {
  const { t } = useTranslation();
  const stats = statsOf(initiatives);

  const addedVsPlanSub =
    stats.planned > 0
      ? t("intelia:initiatives.list.stats.addedVsPlanSub", {
          percent: Math.round((stats.added / stats.planned) * 100),
          inFlight: stats.inFlight,
        })
      : stats.added > 0
        ? t("intelia:initiatives.list.stats.addedVsPlanNoPlan", {
            added: stats.added,
          })
        : undefined;

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-xs md:grid-cols-4">
      <div className="flex flex-col justify-between bg-card p-4 sm:p-5">
        <span className="text-muted-foreground text-xs">
          {t("intelia:initiatives.list.stats.inFlight")}
        </span>
        <strong className="mt-1 font-semibold text-2xl text-foreground tracking-tight tabular-nums sm:text-3xl">
          {stats.inFlight}
        </strong>
      </div>

      <div className="flex flex-col justify-between bg-card p-4 sm:p-5">
        <span className="text-muted-foreground text-xs">
          {t("intelia:initiatives.list.stats.withBlocked")}
        </span>
        <strong className="mt-1 font-semibold text-2xl text-foreground tracking-tight tabular-nums sm:text-3xl">
          {stats.withBlocked}
        </strong>
      </div>

      <div className="flex flex-col justify-between bg-card p-4 sm:p-5">
        <span className="text-muted-foreground text-xs">
          {t("intelia:initiatives.list.stats.addedVsPlan")}
        </span>
        <strong className="mt-1 font-semibold text-2xl text-foreground tracking-tight tabular-nums sm:text-3xl">
          {stats.added} / {stats.planned}
        </strong>
        {addedVsPlanSub && (
          <span className="mt-1 text-muted-foreground text-xs">
            {addedVsPlanSub}
          </span>
        )}
      </div>

      <div className="flex flex-col justify-between bg-card p-4 sm:p-5">
        <span className="text-muted-foreground text-xs">
          {t("intelia:initiatives.list.stats.cancelled")}
        </span>
        <strong className="mt-1 font-semibold text-2xl text-foreground tracking-tight tabular-nums sm:text-3xl">
          {stats.cancelled}
        </strong>
        <span className="mt-1 text-muted-foreground text-xs">
          {t("intelia:initiatives.list.stats.cancelledSub")}
        </span>
      </div>
    </div>
  );
}
