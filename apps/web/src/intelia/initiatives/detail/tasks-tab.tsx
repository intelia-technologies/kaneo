import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import type { InitiativeDetail, InitiativeTask } from "../api";
import { GrowthLine, ScopeBreakdown } from "../components/initiative-progress";
import type { InitiativeDetailSearch } from "../search";

type TasksTabProps = {
  initiative: InitiativeDetail;
  projectSlug: string;
  projectColumnsMap: Record<string, string>;
  search: InitiativeDetailSearch;
  onFilterChange: (filters: Partial<InitiativeDetailSearch>) => void;
  onOpenTask: (taskId: string) => void;
};

export function TasksTab({
  initiative,
  projectSlug,
  projectColumnsMap,
  search,
  onFilterChange,
  onOpenTask,
}: TasksTabProps) {
  const { t } = useTranslation();

  const tasksMap = useMemo(() => {
    const map = new Map<string, InitiativeTask>();
    for (const task of initiative.tasks) {
      map.set(task.id, task);
    }
    return map;
  }, [initiative.tasks]);

  const externalTasksMap = useMemo(() => {
    const map = new Map<string, (typeof initiative.externalTasks)[number]>();
    for (const ext of initiative.externalTasks) {
      map.set(ext.id, ext);
    }
    return map;
  }, [initiative.externalTasks]);

  // Options for filter selects built from initiative.tasks
  const { availableStatuses, availableAssignees, hasUnassigned } =
    useMemo(() => {
      const statusSet = new Set<string>();
      const assigneeMap = new Map<string, string>();
      let foundUnassigned = false;

      for (const task of initiative.tasks) {
        statusSet.add(task.status);
        if (task.assignee?.id) {
          assigneeMap.set(
            task.assignee.id,
            task.assignee.name || task.assignee.id,
          );
        } else {
          foundUnassigned = true;
        }
      }

      return {
        availableStatuses: Array.from(statusSet).map((slug) => ({
          slug,
          name: projectColumnsMap[slug] || slug,
        })),
        availableAssignees: Array.from(assigneeMap.entries()).map(
          ([id, name]) => ({ id, name }),
        ),
        hasUnassigned: foundUnassigned,
      };
    }, [initiative.tasks, projectColumnsMap]);

  // Filter tasks based on URL search params
  const q = search.q ?? "";
  const origin = search.origin ?? "all";
  const status = search.status ?? "all";
  const assignee = search.assignee ?? "all";

  const isFiltered = Boolean(
    q.trim() ||
    (origin && origin !== "all") ||
    (status && status !== "all") ||
    (assignee && assignee !== "all"),
  );

  const filteredTasks = useMemo(() => {
    return initiative.tasks.filter((task) => {
      if (origin !== "all" && task.origin !== origin) {
        return false;
      }
      if (status !== "all" && task.status !== status) {
        return false;
      }
      if (assignee !== "all") {
        if (assignee === "unassigned") {
          if (task.assignee?.id) return false;
        } else if (task.assignee?.id !== assignee) {
          return false;
        }
      }
      if (q.trim()) {
        const term = q.trim().toLowerCase();
        const taskKey = `${projectSlug}-${task.number ?? ""}`.toLowerCase();
        const numStr = String(task.number ?? "");
        const title = task.title.toLowerCase();
        const id = task.id.toLowerCase();
        if (
          !taskKey.includes(term) &&
          !numStr.includes(term) &&
          !title.includes(term) &&
          !id.includes(term)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [initiative.tasks, origin, status, assignee, q, projectSlug]);

  const renderOriginTag = (originValue: InitiativeTask["origin"]) => {
    if (originValue === "plan") {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground">
          <span aria-hidden="true">▤</span>{" "}
          {t("intelia:initiatives.origin.plan")}
        </span>
      );
    }
    if (originValue === "añadido") {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-400">
          <span aria-hidden="true">+</span>{" "}
          {t("intelia:initiatives.origin.añadido")}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/20 px-2 py-0.5 text-xs font-medium text-muted-foreground">
        {t("intelia:initiatives.origin.sin_registro")}
      </span>
    );
  };

  const renderDependenciesOrReason = (task: InitiativeTask) => {
    const isBlocked = task.status.toLowerCase() === "blocked";
    if (isBlocked) {
      let reasonText = t("intelia:initiatives.blockReasonNone");
      if (task.blockReason && task.blockReasonDetail) {
        reasonText = `${task.blockReason}: ${task.blockReasonDetail}`;
      } else if (task.blockReasonDetail) {
        reasonText = task.blockReasonDetail;
      } else if (task.blockReason) {
        reasonText = task.blockReason;
      }

      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
          <span aria-hidden="true">⊘</span>
          <span>{reasonText}</span>
        </span>
      );
    }

    if (task.dependsOn.length > 0) {
      const depLabels = task.dependsOn.map((id) => {
        const local = tasksMap.get(id);
        if (local) {
          return `${projectSlug}-${local.number ?? ""}`;
        }
        const ext = externalTasksMap.get(id);
        if (ext) {
          return `${ext.projectSlug}-${ext.number ?? ""} (${ext.projectName})`;
        }
        return id;
      });

      return (
        <span className="text-xs text-muted-foreground">
          ← {depLabels.join(", ")}
        </span>
      );
    }

    return (
      <span className="text-xs text-muted-foreground/60">
        {t("intelia:initiatives.detail.table.noPredecessors")}
      </span>
    );
  };

  // Edge state: no_tasks
  if (initiative.tasks.length === 0) {
    return (
      <div className="space-y-6 pt-2">
        <ScopeBreakdown counters={initiative.counters} />
        <GrowthLine counters={initiative.counters} />
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <h3 className="text-base font-semibold text-foreground">
            {t("intelia:initiatives.detail.noTasksTitle")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("intelia:initiatives.detail.noTasksDescription")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2">
      <ScopeBreakdown counters={initiative.counters} />
      <GrowthLine counters={initiative.counters} />

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-64">
          <Input
            aria-label={t("intelia:initiatives.detail.filters.searchAria")}
            placeholder={t(
              "intelia:initiatives.detail.filters.searchPlaceholder",
            )}
            value={q}
            onChange={(e) => onFilterChange({ q: e.target.value })}
            className="h-8.5 text-xs sm:text-xs"
          />
        </div>

        <select
          aria-label={t("intelia:initiatives.detail.filters.originAria")}
          value={origin}
          onChange={(e) => onFilterChange({ origin: e.target.value })}
          className="h-8.5 rounded-lg border border-input bg-background px-3 text-xs text-foreground shadow-xs/5 outline-none focus-visible:border-ring focus-visible:ring-2"
        >
          <option value="all">
            {t("intelia:initiatives.detail.filters.allOrigins")}
          </option>
          <option value="plan">{t("intelia:initiatives.origin.plan")}</option>
          <option value="añadido">
            {t("intelia:initiatives.origin.añadido")}
          </option>
          <option value="sin_registro">
            {t("intelia:initiatives.origin.sin_registro")}
          </option>
        </select>

        <select
          aria-label={t("intelia:initiatives.detail.filters.statusAria")}
          value={status}
          onChange={(e) => onFilterChange({ status: e.target.value })}
          className="h-8.5 rounded-lg border border-input bg-background px-3 text-xs text-foreground shadow-xs/5 outline-none focus-visible:border-ring focus-visible:ring-2"
        >
          <option value="all">
            {t("intelia:initiatives.detail.filters.allStatuses")}
          </option>
          {availableStatuses.map((st) => (
            <option key={st.slug} value={st.slug}>
              {st.name}
            </option>
          ))}
        </select>

        <select
          aria-label={t("intelia:initiatives.detail.filters.assigneeAria")}
          value={assignee}
          onChange={(e) => onFilterChange({ assignee: e.target.value })}
          className="h-8.5 rounded-lg border border-input bg-background px-3 text-xs text-foreground shadow-xs/5 outline-none focus-visible:border-ring focus-visible:ring-2"
        >
          <option value="all">
            {t("intelia:initiatives.detail.filters.allAssignees")}
          </option>
          {availableAssignees.map((asgn) => (
            <option key={asgn.id} value={asgn.id}>
              {asgn.name}
            </option>
          ))}
          {hasUnassigned && (
            <option value="unassigned">
              {t("intelia:initiatives.unassigned")}
            </option>
          )}
        </select>
      </div>

      {/* Filtered count */}
      {isFiltered && (
        <div className="text-xs text-muted-foreground">
          {t("intelia:initiatives.detail.filteredCount", {
            count: filteredTasks.length,
            total: initiative.tasks.length,
          })}
        </div>
      )}

      {/* Table */}
      <div className="relative max-h-[600px] overflow-auto rounded-lg border border-border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background shadow-xs">
            <TableRow>
              <TableHead className="w-28 text-xs font-semibold">
                {t("intelia:initiatives.detail.table.origin")}
              </TableHead>
              <TableHead className="min-w-64 text-xs font-semibold">
                {t("intelia:initiatives.detail.table.task")}
              </TableHead>
              <TableHead className="w-32 text-xs font-semibold">
                {t("intelia:initiatives.detail.table.status")}
              </TableHead>
              <TableHead className="w-36 text-xs font-semibold">
                {t("intelia:initiatives.detail.table.assignee")}
              </TableHead>
              <TableHead className="w-44 text-xs font-semibold">
                {t("intelia:initiatives.detail.table.statusSince")}
              </TableHead>
              <TableHead className="min-w-56 text-xs font-semibold">
                {t("intelia:initiatives.detail.table.dependenciesOrReason")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTasks.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-xs text-muted-foreground"
                >
                  {t("intelia:initiatives.detail.table.noResults")}
                </TableCell>
              </TableRow>
            ) : (
              filteredTasks.map((task) => {
                const isCancelled =
                  task.status.toLowerCase() === "cancelled" ||
                  task.status.toLowerCase() === "canceled";

                return (
                  <TableRow
                    key={task.id}
                    className={`transition-colors ${
                      isCancelled
                        ? "opacity-60 text-muted-foreground bg-muted/10"
                        : ""
                    }`}
                  >
                    <TableCell className="align-top py-2.5">
                      {renderOriginTag(task.origin)}
                    </TableCell>

                    <TableCell className="align-top py-2.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {projectSlug
                            ? `${projectSlug}-${task.number ?? ""}`
                            : `#${task.number ?? ""}`}
                        </span>
                        <button
                          id={`task-btn-${task.id}`}
                          type="button"
                          onClick={() => onOpenTask(task.id)}
                          className="cursor-pointer text-left font-medium text-foreground text-xs hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        >
                          {task.title}
                        </button>
                      </div>
                    </TableCell>

                    <TableCell className="align-top py-2.5 text-xs">
                      {projectColumnsMap[task.status] || task.status}
                    </TableCell>

                    <TableCell className="align-top py-2.5 text-xs">
                      {task.assignee?.name ||
                        t("intelia:initiatives.unassigned")}
                    </TableCell>

                    <TableCell className="align-top py-2.5 text-xs text-muted-foreground">
                      <time
                        dateTime={task.statusSince}
                        title={formatDateTime(task.statusSince)}
                      >
                        {formatRelativeTime(task.statusSince)}
                      </time>
                    </TableCell>

                    <TableCell className="align-top py-2.5">
                      {renderDependenciesOrReason(task)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
