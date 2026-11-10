import { Bot } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  FilterSubject,
  TaskFilterControls,
} from "@/components/project/task-filters/filter-subject";
import { countValues } from "@/lib/task-filters/count-values";
import type Task from "@/types/task";
import { useProjectAutomation } from "./api";
import { AUTOMATION_FILTER_VALUES, automationFilterValue } from "./filter";
import "./i18n";

type BuildSubject = (
  id: string,
  fields: Pick<FilterSubject, "label" | "icon" | "options" | "selected"> &
    Partial<FilterSubject>,
) => FilterSubject;

// The "Automation" subject of the project filter bar: automatic, manual,
// paused and the tasks that have no automation. `build` is the filter bar's
// own subject builder, so operators, negation and clearing behave like the
// other fields.
export function useAutomationFilterSubject({
  projectId,
  controls,
  tasks,
  build,
}: {
  projectId: string | undefined;
  controls: TaskFilterControls;
  tasks: Task[];
  build: BuildSubject;
}): FilterSubject {
  const { t } = useTranslation();
  const { data: automation } = useProjectAutomation(projectId);
  // Counts only make sense once the map is known: before that every task
  // would look like it has no automation.
  const counts = automation
    ? countValues(tasks, (task) => [
        automationFilterValue(automation.get(task.id)),
      ])
    : {};

  return build("automation", {
    label: t("intelia:automation.title"),
    icon: <Bot />,
    options: AUTOMATION_FILTER_VALUES.map((value) => ({
      value,
      label: t(`intelia:automation.filterValues.${value}`),
      count: counts[value],
    })),
    selected: controls.filters.automation ?? [],
    onToggle: (value) => controls.toggleFilter("automation", value),
    onClear: () => controls.updateFilter("automation", null),
  });
}
