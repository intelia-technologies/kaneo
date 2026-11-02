import { INITIATIVE_SORTS, type InitiativeSort } from "./progress";

// The listing and the detail keep their state in the URL, so going back to
// the listing restores the search, the order, the filter and the selection.

export type InitiativesListFilter = "all" | "blocked" | "added";
const LIST_FILTERS: readonly InitiativesListFilter[] = [
  "all",
  "blocked",
  "added",
];

export type InitiativesListSearch = {
  q?: string;
  sort?: InitiativeSort;
  filter?: InitiativesListFilter;
  /** Initiative shown in the inspector. */
  selected?: string;
  /** Task open in Kaneo's task sheet (the «sin iniciativa» section). */
  taskId?: string;
};

export type InitiativeTab = "tasks" | "tree";
const TABS: readonly InitiativeTab[] = ["tasks", "tree"];

export type InitiativeDetailSearch = {
  tab?: InitiativeTab;
  /** Task open in Kaneo's task sheet. */
  taskId?: string;
  /** Tasks tab filters. */
  origin?: string;
  status?: string;
  assignee?: string;
  q?: string;
  /** Tree tab: draw the Cancelled tasks too. */
  cancelled?: boolean;
};

const text = (value: unknown) =>
  typeof value === "string" && value !== "" ? value : undefined;

const oneOf = <T extends string>(value: unknown, options: readonly T[]) =>
  options.find((option) => option === value);

export function validateInitiativesListSearch(
  search: Record<string, unknown>,
): InitiativesListSearch {
  return {
    q: text(search.q),
    sort: oneOf(search.sort, INITIATIVE_SORTS),
    filter: oneOf(search.filter, LIST_FILTERS),
    selected: text(search.selected),
    taskId: text(search.taskId),
  };
}

export function validateInitiativeDetailSearch(
  search: Record<string, unknown>,
): InitiativeDetailSearch {
  return {
    tab: oneOf(search.tab, TABS),
    taskId: text(search.taskId),
    origin: text(search.origin),
    status: text(search.status),
    assignee: text(search.assignee),
    q: text(search.q),
    cancelled:
      search.cancelled === true || search.cancelled === "true"
        ? true
        : undefined,
  };
}
