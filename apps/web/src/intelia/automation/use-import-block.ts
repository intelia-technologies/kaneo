import { useTranslation } from "react-i18next";
import "./i18n";

// Imports that create tasks without asking for an automation level (issues of
// a code host, runs from other tools). In this Kaneo every task needs a level,
// so their start action stays disabled and this is the reason to show.
export function useAutomationImportBlock(): string {
  const { t } = useTranslation();
  return t("intelia:automation.importBlocked");
}
