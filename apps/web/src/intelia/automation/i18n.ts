import { registerInteliaI18n } from "../i18n";

// The level names are the factory's terms (design 18 §3) and read the same
// in both languages.
const levels = {
  manual: "Manual",
  arranque: "Arranque",
  completa: "Completa",
};

const en = {
  automation: {
    title: "Automation",
    level: "Level",
    verification: "Verification",
    levels,
    levelHint: {
      manual: "The orchestrator starts, merges and closes.",
      arranque: "Starts on its own once ready; the orchestrator merges.",
      completa: "Starts on its own and, once verified, merges and closes.",
    },
    yes: "Yes",
    no: "No",
    verified: "Verification",
    notVerified: "No verification",
    badgeLabel: "Automation: {{level}}, {{verification}}",
    completaNeedsVerification: "Completa requires verification.",
    required: "Choose the automation level and verification.",
    noLevel: "No level",
    setBy: "Set by {{name}} · {{date}}",
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
    saveError: "Failed to change the automation level",
    loadError: "Failed to load the automation level",
    filter: "Automation",
  },
};

const es = {
  automation: {
    title: "Automatización",
    level: "Nivel",
    verification: "Verificación",
    levels,
    levelHint: {
      manual: "El orquestador arranca, mergea y cierra.",
      arranque: "Arranca sola en cuanto está lista; el orquestador mergea.",
      completa: "Arranca sola y, verificada, se mergea y se cierra.",
    },
    yes: "Sí",
    no: "No",
    verified: "Verificación",
    notVerified: "Sin verificación",
    badgeLabel: "Automatización: {{level}}, {{verification}}",
    completaNeedsVerification: "Completa exige verificación.",
    required: "Elige el nivel de automatización y la verificación.",
    noLevel: "Sin nivel",
    setBy: "Fijado por {{name}} · {{date}}",
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
    saveError: "No se pudo cambiar el nivel de automatización",
    loadError: "No se pudo cargar el nivel de automatización",
    filter: "Automatización",
  },
};

registerInteliaI18n(en, es);
