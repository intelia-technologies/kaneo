import { registerInteliaI18n } from "../i18n";

const en = {
  scopePause: {
    notice: {
      project: "This project is paused",
      initiative: "This initiative is paused",
      pausedBy: "Paused by {{who}} on {{date}}",
      review: "Review on {{date}}",
      explanation:
        "The factory does not move or launch its tasks, and their routines skip, until someone resumes it.",
    },
    chip: {
      project: "Project paused",
      initiative: "Initiative paused",
      title:
        "{{scope}}: «{{name}}». Paused by {{who}}: {{motivo}}. Review on {{date}}.",
    },
    history: {
      title: "Pause history",
      loading: "Loading history…",
      loadError: "Failed to load the history",
      empty: "No changes recorded",
      kind: {
        created: "Paused",
        updated: "Changed",
        resumed: "Resumed",
      },
      field: {
        motivo: "Reason",
        revisarEl: "Review on",
        notaReanudar: "Note",
      },
      source: {
        session: "Kaneo",
        api_key: "API key",
      },
    },
    unknownAuthor: "unknown",
  },
};

const es = {
  scopePause: {
    notice: {
      project: "Este proyecto está en pausa",
      initiative: "Esta iniciativa está en pausa",
      pausedBy: "Pausado por {{who}} el {{date}}",
      review: "Revisar el {{date}}",
      explanation:
        "La fábrica no mueve ni lanza sus tareas, y sus rutinas se saltan, hasta que alguien la reanude.",
    },
    chip: {
      project: "Proyecto en pausa",
      initiative: "Iniciativa en pausa",
      title:
        "{{scope}}: «{{name}}». Pausado por {{who}}: {{motivo}}. Revisar el {{date}}.",
    },
    history: {
      title: "Historial de la pausa",
      loading: "Cargando el historial…",
      loadError: "No se ha podido cargar el historial",
      empty: "Sin cambios registrados",
      kind: {
        created: "Pausada",
        updated: "Cambiada",
        resumed: "Reanudada",
      },
      field: {
        motivo: "Motivo",
        revisarEl: "Revisar el",
        notaReanudar: "Nota",
      },
      source: {
        session: "Kaneo",
        api_key: "clave de API",
      },
    },
    unknownAuthor: "desconocido",
  },
};

registerInteliaI18n(en, es);
