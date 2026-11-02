import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { InitiativeCounters } from "../api";
import "../i18n";
import { type Growth, growthOf, percentOf } from "../progress";

type Tally = { active: number; done: number };

/**
 * Bar of Done over active tasks. Without active tasks it draws an empty
 * dashed track: never 0 % nor 100 %.
 */
export function ProgressBar({
  tally,
  className,
}: {
  tally: Tally;
  className?: string;
}) {
  const percent = percentOf(tally);
  return (
    <div
      aria-hidden="true"
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-muted",
        percent === null && "border border-border border-dashed bg-transparent",
        className,
      )}
    >
      {percent !== null && (
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${percent}%` }}
        />
      )}
    </div>
  );
}

/**
 * The percentage is never shown alone (design 19 §5): it always goes with
 * «done / active» and the cancelled tasks. Use this for any figure of
 * progress of a whole initiative.
 */
export function ProgressFigures({
  counters,
  className,
  showPercent = true,
}: {
  counters: Pick<InitiativeCounters, "active" | "done" | "cancelled">;
  className?: string;
  showPercent?: boolean;
}) {
  const { t } = useTranslation();
  const percent = percentOf(counters);
  const cancelled = t("intelia:initiatives.progress.cancelled", {
    count: counters.cancelled,
  });
  const label =
    percent === null
      ? t("intelia:initiatives.progress.ariaNone", {
          cancelled: counters.cancelled,
        })
      : t("intelia:initiatives.progress.aria", {
          done: counters.done,
          active: counters.active,
          cancelled: counters.cancelled,
        });

  return (
    <span
      role="img"
      aria-label={label}
      className={cn("inline-flex flex-wrap items-baseline gap-x-2", className)}
    >
      <span aria-hidden="true" className="font-semibold tabular-nums">
        {percent === null
          ? t("intelia:initiatives.progress.none")
          : showPercent
            ? t("intelia:initiatives.progress.percent", { percent })
            : null}
      </span>
      {percent !== null && (
        <span aria-hidden="true" className="tabular-nums">
          {t("intelia:initiatives.progress.doneOfActive", {
            done: counters.done,
            active: counters.active,
          })}
        </span>
      )}
      <span aria-hidden="true" className="text-muted-foreground tabular-nums">
        {cancelled}
      </span>
    </span>
  );
}

export function growthText(growth: Growth, t: TFunction): string {
  switch (growth.kind) {
    case "growth":
      return t("intelia:initiatives.growth.growth", growth);
    case "no_base":
      return t("intelia:initiatives.growth.noBase", { count: growth.added });
    case "unrecorded":
      return t("intelia:initiatives.growth.unrecorded");
    case "none":
      return t("intelia:initiatives.growth.none");
  }
}

/** «8 → 12 tareas · +50 %», or why there is no growth to show. */
export function GrowthLine({
  counters,
  className,
}: {
  counters: InitiativeCounters;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <p className={cn("text-muted-foreground text-xs", className)}>
      {growthText(growthOf(counters), t)}
    </p>
  );
}

/**
 * Plan and added side by side, each with its own Done / active, plus the
 * migrated tasks when there are any. Cancelled ones keep their origin in the
 * totals.
 */
export function ScopeBreakdown({
  counters,
  className,
}: {
  counters: InitiativeCounters;
  className?: string;
}) {
  const { t } = useTranslation();
  const parts = [
    {
      key: "plan",
      title: t("intelia:initiatives.scope.planTitle", {
        count: counters.plan.total,
      }),
      tally: counters.plan,
      empty: t("intelia:initiatives.scope.noActive"),
      accent: "border-border",
    },
    {
      key: "added",
      title: t("intelia:initiatives.scope.addedTitle", {
        count: counters.added.total,
      }),
      tally: counters.added,
      empty:
        counters.added.total === 0
          ? t("intelia:initiatives.scope.noAdded")
          : t("intelia:initiatives.scope.noActive"),
      accent: "border-amber-500/60 border-dashed",
    },
    ...(counters.unrecorded.total > 0
      ? [
          {
            key: "unrecorded",
            title: t("intelia:initiatives.scope.unrecordedTitle", {
              count: counters.unrecorded.total,
            }),
            tally: counters.unrecorded,
            empty: t("intelia:initiatives.scope.noActive"),
            accent: "border-border border-dotted",
          },
        ]
      : []),
  ];

  return (
    <div className={cn("grid gap-2 sm:grid-cols-2", className)}>
      {parts.map((part) => {
        const percent = percentOf(part.tally);
        return (
          <div
            key={part.key}
            className={cn("rounded-md border p-2.5", part.accent)}
          >
            <p className="text-muted-foreground text-xs">{part.title}</p>
            {percent === null ? (
              <p className="mt-1 font-medium text-sm">{part.empty}</p>
            ) : (
              <p className="mt-1 font-medium text-sm tabular-nums">
                {t("intelia:initiatives.progress.doneOfActive", {
                  done: part.tally.done,
                  active: part.tally.active,
                })}{" "}
                <span className="text-muted-foreground text-xs">
                  · {t("intelia:initiatives.progress.percent", { percent })}
                </span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
