import type { TFunction } from "i18next";
import { Send } from "lucide-react";
import "./i18n";

// The «My requests» entry of the sidebar, next to «Routines» (nav-main.tsx).
export function requestsNavItem(t: TFunction, homeUrl: string) {
  return {
    title: t("intelia:requests.title"),
    icon: Send,
    url: `${homeUrl}/requests`,
  };
}
