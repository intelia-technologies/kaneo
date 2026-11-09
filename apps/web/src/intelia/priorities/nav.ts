import type { TFunction } from "i18next";
import { ListTree } from "lucide-react";
import "./i18n";

// The «Priorities» entry of the sidebar, after «Routines» (nav-main.tsx).
export function prioritiesNavItem(t: TFunction, homeUrl: string) {
  return {
    title: t("intelia:priorities.title"),
    icon: ListTree,
    url: `${homeUrl}/priorities`,
  };
}
