import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { ScopePause, ScopePauseChange } from "./api";
import "./i18n";

export function initEnglish() {
  if (!i18n.isInitialized) {
    i18n.use(initReactI18next).init({
      lng: "en",
      fallbackLng: "en",
      interpolation: { escapeValue: false },
      resources: {},
    });
  } else {
    i18n.changeLanguage("en");
  }
}

export function projectPause(fields: Partial<ScopePause> = {}): ScopePause {
  return {
    id: "pause-project",
    workspaceId: "ws",
    scopeType: "project",
    projectId: "p-sf",
    initiativeId: null,
    scopeName: "Software Factory",
    motivo: "Esperando la decisión de Jaime sobre el alcance",
    revisarEl: "2026-11-20",
    pausedByUserId: "u-forja",
    pausedByName: "Forja",
    pausedByActor: "agent:forja",
    pausedAt: "2026-11-17T08:00:00.000Z",
    resumedByUserId: null,
    resumedByName: null,
    resumedByActor: null,
    resumedAt: null,
    notaReanudar: null,
    ...fields,
  };
}

export function initiativePause(fields: Partial<ScopePause> = {}): ScopePause {
  return projectPause({
    id: "pause-initiative",
    scopeType: "initiative",
    projectId: "p-sf",
    initiativeId: "ini-81",
    scopeName: "Pausa por iniciativa o proyecto",
    taskIds: ["task-kf-15", "task-sf-2491"],
    motivo: "Reordenando el plan",
    revisarEl: "2026-11-24",
    pausedByName: "Dédalo",
    pausedByActor: null,
    ...fields,
  });
}

export function pauseChange(
  fields: Partial<ScopePauseChange> &
    Pick<ScopePauseChange, "id" | "kind" | "value">,
): ScopePauseChange {
  return {
    pauseId: "pause-project",
    previous: null,
    userId: "u-forja",
    userName: "Forja",
    actor: "agent:forja",
    source: "api_key",
    createdAt: "2026-11-17T08:00:00.000Z",
    ...fields,
  };
}
