import { registerInteliaI18n } from "../i18n";

// Strings shared by the listing and the detail. Each part registers its own
// keys next to its components (`list/i18n.ts`, `detail/i18n.ts`).
const en = {
  initiatives: {
    title: "Initiatives",
    state: {
      in_flight: "In flight",
      finished: "Finished",
      no_tasks: "No tasks",
      all_cancelled: "All cancelled",
    },
    progress: {
      doneOfActive: "{{done}}/{{active}} done",
      percent: "{{percent}} %",
      cancelled_one: "{{count}} cancelled",
      cancelled_other: "{{count}} cancelled",
      none: "—",
      aria: "{{done}} of {{active}} active tasks done, {{cancelled}} cancelled",
      ariaNone: "No active tasks, {{cancelled}} cancelled",
    },
    scope: {
      plan: "{{count}} plan",
      added_one: "+ {{count}} added",
      added_other: "+ {{count}} added",
      unrecorded: "{{count}} unrecorded",
      planTitle_one: "Original plan · {{count}} task",
      planTitle_other: "Original plan · {{count}} tasks",
      addedTitle_one: "Added scope · {{count}} task",
      addedTitle_other: "Added scope · {{count}} tasks",
      unrecordedTitle_one: "Unrecorded · {{count}} task",
      unrecordedTitle_other: "Unrecorded · {{count}} tasks",
      noActive: "— · no active tasks",
      noAdded: "no added scope",
    },
    growth: {
      growth: "Gross scope: {{from}} → {{to}} tasks · +{{percent}} %",
      noBase: "No original plan · +{{count}} added",
      unrecorded:
        "No growth shown: some tasks predate the plan record (unrecorded)",
      none: "No tasks",
    },
    origin: {
      plan: "Plan",
      añadido: "Added",
      sin_registro: "Unrecorded",
    },
    blocked_one: "{{count}} Blocked",
    blocked_other: "{{count}} Blocked",
    blockReasonNone: "No detail recorded",
    unassigned: "Unassigned",
    loadError: "Could not load the initiatives",
    retry: "Retry",
    loading: "Loading initiatives…",
  },
};

const es = {
  initiatives: {
    title: "Iniciativas",
    state: {
      in_flight: "En vuelo",
      finished: "Finalizada",
      no_tasks: "Sin tareas",
      all_cancelled: "Todas canceladas",
    },
    progress: {
      doneOfActive: "{{done}}/{{active}} hechas",
      percent: "{{percent}} %",
      cancelled_one: "{{count}} cancelada",
      cancelled_other: "{{count}} canceladas",
      none: "—",
      aria: "{{done}} de {{active}} tareas activas hechas, {{cancelled}} canceladas",
      ariaNone: "Sin tareas activas, {{cancelled}} canceladas",
    },
    scope: {
      plan: "{{count}} plan",
      added_one: "+ {{count}} añadida",
      added_other: "+ {{count}} añadidas",
      unrecorded: "{{count}} sin registro",
      planTitle_one: "Plan original · {{count}} tarea",
      planTitle_other: "Plan original · {{count}} tareas",
      addedTitle_one: "Alcance añadido · {{count}} tarea",
      addedTitle_other: "Alcance añadido · {{count}} tareas",
      unrecordedTitle_one: "Sin registro · {{count}} tarea",
      unrecordedTitle_other: "Sin registro · {{count}} tareas",
      noActive: "— · sin tareas activas",
      noAdded: "sin añadido",
    },
    growth: {
      growth: "Alcance bruto: {{from}} → {{to}} tareas · +{{percent}} %",
      noBase: "Sin base original · +{{count}} añadidas",
      unrecorded:
        "Sin crecimiento: hay tareas anteriores al registro del plan (sin registro)",
      none: "Sin tareas",
    },
    origin: {
      plan: "Plan",
      añadido: "Añadida",
      sin_registro: "Sin registro",
    },
    blocked_one: "{{count}} Blocked",
    blocked_other: "{{count}} Blocked",
    blockReasonNone: "Sin detalle registrado",
    unassigned: "Sin asignar",
    loadError: "No se pudieron cargar las iniciativas",
    retry: "Reintentar",
    loading: "Cargando iniciativas…",
  },
};

registerInteliaI18n(en, es);
