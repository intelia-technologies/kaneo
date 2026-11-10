import { registerInteliaI18n } from "../i18n";

const en = {
  automation: {
    title: "Automation",
    automatica: "Automatic",
    verification: "Verification",
    entrega: "Delivery",
    yes: "Yes",
    no: "No",
    verified: "Verification",
    notVerified: "No verification",
    required: "Choose automatic, verification and delivery.",
    none: "No automation",
    setBy: "Set by {{name}} · {{date}}",
    pauseReason: "Pause reason",
    pauseReasonPlaceholder: "Pause reason (optional)",
    savePauseReason: "Save reason",
    filterValues: {
      automatica: "Automatic",
      manual: "Manual",
      paused: "Paused",
      none: "No automation",
    },
    history: "History",
    noHistory: "No changes yet",
    change: "{{from}} → {{to}}",
    firstSet: "Set to {{to}}",
    source: {
      session: "Kaneo",
      api_key: "API key",
      gateway: "gateway",
      migration: "migration",
    },
    unknownAuthor: "Unknown",
    saveError: "Failed to change the automation",
    loadError: "Failed to load the automation",
    duplicate: {
      title: "Choose the automation",
      description:
        "The task you are duplicating has no automation. Choose it for the copy.",
      confirm: "Duplicate",
    },
    importAppliesToAll: "Applied to every imported task.",
    importBlocked:
      "In this Kaneo every task needs its automation; this import does not ask for it yet.",
    card: {
      automatica: "Automatic",
      manual: "Manual",
      paused: "Paused: {{motivo}}",
      entrega: { pr: "PR", sin_pr: "No PR" },
      responsable: "Resp. {{id}}",
      implementador: "Impl. {{id}}",
      verificador: "Verif. {{id}}",
      columnaPrevia: "From: {{slug}}",
    },
  },
};

const es = {
  automation: {
    title: "Automatización",
    automatica: "Automática",
    verification: "Verificación",
    entrega: "Entrega",
    yes: "Sí",
    no: "No",
    verified: "Verificación",
    notVerified: "Sin verificación",
    required: "Elige automática, verificación y entrega.",
    none: "Sin automatización",
    setBy: "Fijado por {{name}} · {{date}}",
    pauseReason: "Motivo de pausa",
    pauseReasonPlaceholder: "Motivo de pausa (opcional)",
    savePauseReason: "Guardar motivo",
    filterValues: {
      automatica: "Automática",
      manual: "Manual",
      paused: "Pausada",
      none: "Sin automatización",
    },
    history: "Diario",
    noHistory: "Sin cambios todavía",
    change: "{{from}} → {{to}}",
    firstSet: "Fijado en {{to}}",
    source: {
      session: "Kaneo",
      api_key: "clave de API",
      gateway: "gateway",
      migration: "migración",
    },
    unknownAuthor: "Desconocido",
    saveError: "No se pudo cambiar la automatización",
    loadError: "No se pudo cargar la automatización",
    duplicate: {
      title: "Elige la automatización",
      description:
        "La tarea que vas a duplicar no tiene automatización. Elígela para la copia.",
      confirm: "Duplicar",
    },
    importAppliesToAll: "Se aplica a todas las tareas importadas.",
    importBlocked:
      "En este Kaneo cada tarea necesita su automatización; esta importación aún no la pide.",
    card: {
      automatica: "Automática",
      manual: "Manual",
      paused: "Pausada: {{motivo}}",
      entrega: { pr: "PR", sin_pr: "Sin PR" },
      responsable: "Resp. {{id}}",
      implementador: "Impl. {{id}}",
      verificador: "Verif. {{id}}",
      columnaPrevia: "Desde: {{slug}}",
    },
  },
};

registerInteliaI18n(en, es);
