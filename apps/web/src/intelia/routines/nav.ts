import type { TFunction } from "i18next";
import { CalendarClock } from "lucide-react";
import "./i18n";

// The «Routines» entry of the sidebar, next to «My tasks» (nav-main.tsx).
export function routinesNavItem(t: TFunction, homeUrl: string) {
  return {
    title: t("intelia:routines.title"),
    icon: CalendarClock,
    url: `${homeUrl}/routines`,
  };
}
