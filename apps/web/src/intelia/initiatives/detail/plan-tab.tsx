import { useTranslation } from "react-i18next";
import { formatDateTime } from "@/lib/format";
import { getExternalWebUrl } from "@/lib/external-url";
import { resolveLabelColor } from "@/lib/label-color";
import { useExternalPlanRealtime } from "../use-external-plan-realtime";
import type { InitiativeDetail, InitiativePlan } from "../api";

export function PlanTab({
  plan,
  initiative,
  columns = [],
}: {
  plan: InitiativePlan;
  initiative: InitiativeDetail;
  columns?: { slug: string; color: string | null }[];
}) {
  useExternalPlanRealtime(plan);
  const { t } = useTranslation();
  const key = "intelia:initiatives.detail.plan";
  const date = (value: string | null) =>
    value && Number.isFinite(Date.parse(value)) ? formatDateTime(value) : "—";
  const dates = plan.tasks
    .flatMap((task) => [
      task.actualStart,
      task.actualEnd,
      task.plannedStart,
      task.plannedEnd,
      task.actualStart && !task.actualEnd && task.mark ? plan.computedAt : null,
    ])
    .filter((value): value is string => value !== null)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  const min = Math.min(...dates);
  const max = Math.max(...dates);
  const span = Math.max(max - min, 1);
  const bar = (
    start: string | null,
    end: string | null,
    kind: "actual" | "planned",
    status: string,
  ) => {
    if (!start || !end) return null;
    const from = new Date(start).getTime();
    const to = new Date(end).getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from)
      return null;
    const color = columns.find((column) => column.slug === status)?.color;
    return (
      <div
        data-testid={`${kind}-bar`}
        title={`${date(start)} – ${date(end)}`}
        className={`absolute h-3 rounded ${kind === "actual" ? "bg-primary" : "bg-primary/50"}`}
        style={{
          ...(color
            ? {
                backgroundColor: resolveLabelColor(color),
                opacity: kind === "actual" ? 1 : 0.55,
              }
            : {}),
          left: `${((from - min) / span) * 100}%`,
          width: `${Math.min(Math.max(((to - from) / span) * 100, 0.5), 100 - ((from - min) / span) * 100)}%`,
          top: kind === "actual" ? 0 : 14,
        }}
      />
    );
  };
  const summary = plan.criticalPath.summary;
  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-semibold">{t(`${key}.criticalPath`)}</h2>
        <p>
          {t(`${key}.summary`, {
            count: plan.criticalPath.taskIds.length,
            advancing: summary.advancing,
            blocked: summary.blocked,
            stalled: summary.stalled,
            waiting: summary.waiting,
            end: date(plan.estimatedEnd),
          })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t(`${key}.estimateDisclaimer`)}
        </p>
        {plan.criticalPath.partial && (
          <p role="status">{t(`${key}.partial`)}</p>
        )}
        {plan.criticalPath.cycle && <p role="alert">{t(`${key}.cycle`)}</p>}
      </div>
      {plan.tasks.length === 0 ? (
        <p>{t(`${key}.empty`)}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <h3 className="font-semibold">{t(`${key}.gantt`)}</h3>
            {dates.length > 0 && (
              <div className="grid min-w-[600px] grid-cols-[minmax(180px,1fr)_2fr] gap-4 text-xs text-muted-foreground">
                <span />
                <div className="flex justify-between">
                  <span>{date(new Date(min).toISOString())}</span>
                  <span>{date(new Date(max).toISOString())}</span>
                </div>
              </div>
            )}
            {plan.tasks.map((task) => (
              <div
                key={task.id}
                className="grid min-w-[600px] grid-cols-[minmax(180px,1fr)_2fr] items-center gap-4 border-b py-2"
              >
                <div>
                  <span>
                    {task.number != null ? `#${task.number} ` : ""}
                    {task.title}
                  </span>
                  {task.external && <span> ({t(`${key}.external`)})</span>}
                  {task.critical && <span> ◆ {t(`${key}.critical`)}</span>}
                  {task.id === plan.criticalPath.goalTaskId && (
                    <span> → {t(`${key}.goal`)}</span>
                  )}
                  {task.mark && task.critical && (
                    <div className="text-sm">
                      {t(`${key}.marks.${task.mark}`)}
                      {task.blockReason && `: ${task.blockReason}`}
                      {task.blockReasonDetail && ` — ${task.blockReasonDetail}`}
                      {task.stallReason &&
                        `: ${t(`${key}.reasons.${task.stallReason}`)}`}
                    </div>
                  )}
                </div>
                <div className="relative h-7 rounded bg-muted/30">
                  {bar(
                    task.actualStart,
                    task.actualEnd ??
                      (task.actualStart && task.mark ? plan.computedAt : null),
                    "actual",
                    task.status,
                  )}
                  {!task.actualEnd &&
                    task.plannedEnd &&
                    Number.isFinite(Date.parse(task.plannedEnd)) &&
                    Number.isFinite(
                      Date.parse(task.plannedEnd) -
                        task.remainingHours * 3_600_000,
                    ) &&
                    bar(
                      new Date(
                        Date.parse(task.plannedEnd) -
                          task.remainingHours * 3_600_000,
                      ).toISOString(),
                      task.plannedEnd,
                      "planned",
                      task.status,
                    )}
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              {t(`${key}.legend`)}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {["task", "status", "start", "end", "estimate", "plain"].map(
                    (column) => (
                      <th className="p-2 text-left" key={column}>
                        {t(`${key}.${column}`)}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {plan.tasks.map((task) => (
                  <tr className="border-t" key={task.id}>
                    <td className="p-2">
                      {task.title}
                      {task.external && ` (${t(`${key}.external`)})`}
                    </td>
                    <td className="p-2">{task.status}</td>
                    <td className="p-2">{date(task.actualStart)}</td>
                    <td className="p-2">{date(task.actualEnd)}</td>
                    <td className="p-2">
                      {task.estimate.hours} h
                      {task.estimate.source === "manual" &&
                        ` (${t(`${key}.manual`)})`}
                    </td>
                    <td className="p-2">{task.plain || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div>
        <h3 className="font-semibold">{t(`${key}.milestones`)}</h3>
        {initiative.hitos_externos?.length ? (
          <ul>
            {initiative.hitos_externos.map((milestone, index) => {
              const href = getExternalWebUrl(milestone.enlace);
              return (
                <li key={`${milestone.enlace}-${index}`}>
                  {href ? (
                    <a
                      className="underline"
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {milestone.nombre}
                    </a>
                  ) : (
                    milestone.nombre
                  )}{" "}
                  · {t(`${key}.milestoneStatus.${milestone.estado}`)}
                  {milestone.tarea && ` · ${milestone.tarea}`}
                </li>
              );
            })}
          </ul>
        ) : (
          <p>{t(`${key}.noMilestones`)}</p>
        )}
      </div>
    </section>
  );
}
