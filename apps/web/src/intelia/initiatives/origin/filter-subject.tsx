import type { TFunction } from "i18next";
import { Milestone } from "lucide-react";
import type {
  FilterSubject,
  TaskFilterControls,
} from "@/components/project/task-filters/filter-subject";
import { countValues } from "@/lib/task-filters/count-values";
import type Task from "@/types/task";
import "../i18n";
import { TASK_ORIGINS, type TaskOrigins } from "./origin";

type BuildSubject = (
  id: string,
  fields: Pick<FilterSubject, "label" | "icon" | "options" | "selected"> &
    Partial<FilterSubject>,
) => FilterSubject;

// The «Origen» subject of the initiative tab's filter bar. `build` is the
// filter bar's own subject builder, so operators, negation and clearing
// behave like the other fields.
export function originFilterSubject({
  origins,
  controls,
  tasks,
  build,
  t,
}: {
  origins: TaskOrigins;
  controls: TaskFilterControls;
  tasks: Task[];
  build: BuildSubject;
  t: TFunction;
}): FilterSubject {
  const counts = countValues(tasks, (task) => [origins.get(task.id)]);

  return build("origin", {
    label: t("intelia:initiatives.originFilter"),
    icon: <Milestone />,
    options: TASK_ORIGINS.map((origin) => ({
      value: origin,
      label: t(`intelia:initiatives.origin.${origin}`),
      count: counts[origin],
    })),
    selected: controls.filters.origin ?? [],
    onToggle: (value) => controls.toggleFilter("origin", value),
    onClear: () => controls.updateFilter("origin", null),
  });
}
