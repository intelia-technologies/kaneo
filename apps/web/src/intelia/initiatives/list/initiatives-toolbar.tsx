import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InitiativeSort } from "../progress";
import type { InitiativesListFilter } from "../search";
import "./i18n";

type InitiativesToolbarProps = {
  query: string;
  onQueryChange: (query: string) => void;
  filter: InitiativesListFilter;
  onFilterChange: (filter: InitiativesListFilter) => void;
  sort: InitiativeSort;
  onSortChange: (sort: InitiativeSort) => void;
};

export function InitiativesToolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  sort,
  onSortChange,
}: InitiativesToolbarProps) {
  const { t } = useTranslation();

  const filterLabels: Record<InitiativesListFilter, string> = {
    all: t("intelia:initiatives.list.toolbar.filterAll"),
    blocked: t("intelia:initiatives.list.toolbar.filterBlocked"),
    added: t("intelia:initiatives.list.toolbar.filterAdded"),
  };

  const sortLabels: Record<InitiativeSort, string> = {
    blocked: t("intelia:initiatives.list.toolbar.sortBlocked"),
    name: t("intelia:initiatives.list.toolbar.sortName"),
    progress: t("intelia:initiatives.list.toolbar.sortProgress"),
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[200px] flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t("intelia:initiatives.list.toolbar.searchPlaceholder")}
          aria-label={t("intelia:initiatives.list.toolbar.searchAria")}
          className="h-9 pl-9"
        />
      </div>

      <div className="w-[180px]">
        <Select
          value={filter}
          onValueChange={(val) =>
            onFilterChange((val as InitiativesListFilter) || "all")
          }
        >
          <SelectTrigger
            size="sm"
            className="h-9 w-full"
            aria-label={t("intelia:initiatives.list.toolbar.filterLabel")}
          >
            <SelectValue>{filterLabels[filter]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("intelia:initiatives.list.toolbar.filterAll")}
            </SelectItem>
            <SelectItem value="blocked">
              {t("intelia:initiatives.list.toolbar.filterBlocked")}
            </SelectItem>
            <SelectItem value="added">
              {t("intelia:initiatives.list.toolbar.filterAdded")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="w-[190px]">
        <Select
          value={sort}
          onValueChange={(val) =>
            onSortChange((val as InitiativeSort) || "blocked")
          }
        >
          <SelectTrigger
            size="sm"
            className="h-9 w-full"
            aria-label={t("intelia:initiatives.list.toolbar.sortLabel")}
          >
            <SelectValue>{sortLabels[sort]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="blocked">
              {t("intelia:initiatives.list.toolbar.sortBlocked")}
            </SelectItem>
            <SelectItem value="name">
              {t("intelia:initiatives.list.toolbar.sortName")}
            </SelectItem>
            <SelectItem value="progress">
              {t("intelia:initiatives.list.toolbar.sortProgress")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
