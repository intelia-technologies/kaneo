import { Bot } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  FilterSubject,
  TaskFilterControls,
} from "@/components/project/task-filters/filter-subject";
import { countValues } from "@/lib/task-filters/count-values";
import type Task from "@/types/task";
import { useProjectAutomation } from "./api";
import { AUTOMATION_FILTER_VALUES, NO_AUTOMATION_LEVEL } from "./filter";
import "./i18n";

type BuildSubject = (
  id: string,
  fields: Pick<FilterSubject, "label" | "icon" | "options" | "selected"> &
    Partial<FilterSubject>,
) => FilterSubject;

// The "Automation" subject of the project filter bar: the three levels plus
// the tasks that have none. `build` is the filter bar's own subject builder,
// so operators, negation and clearing behave like the other fields.
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
  // would look level-less.
  const counts = automation
    ? countValues(tasks, (task) => [
        automation.get(task.id)?.level ?? NO_AUTOMATION_LEVEL,
      ])
    : {};

  return build("automation", {
    label: t("intelia:automation.title"),
    icon: <Bot />,
    options: AUTOMATION_FILTER_VALUES.map((value) => ({
      value,
      label:
        value === NO_AUTOMATION_LEVEL
          ? t("intelia:automation.noLevel")
          : t(`intelia:automation.levels.${value}`),
      count: counts[value],
    })),
    selected: controls.filters.automation ?? [],
    onToggle: (value) => controls.toggleFilter("automation", value),
    onClear: () => controls.updateFilter("automation", null),
  });
}
