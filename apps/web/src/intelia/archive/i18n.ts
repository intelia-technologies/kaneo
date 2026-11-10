import { registerInteliaI18n } from "../i18n";

const en = {
  archive: {
    loading: "Loading archived tasks…",
    loadError: "Could not load the archived tasks.",
    retry: "Retry",
  },
};

const es = {
  archive: {
    loading: "Cargando las tareas archivadas…",
    loadError: "No se han podido cargar las tareas archivadas.",
    retry: "Reintentar",
  },
};

registerInteliaI18n(en, es);
