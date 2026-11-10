import { registerInteliaI18n } from "../i18n";

const en = {
  priorities: {
    title: "Priorities",
    status: { active: "Active", closed: "Closed" },
    panel: {
      label: "Priorities of this project",
      showText: "Show text of {{title}}",
      hideText: "Hide text of {{title}}",
      openTree: "All priorities",
      loadError: "Failed to load the priorities",
    },
    page: {
      description:
        "The workspace's priorities, from the top down. Each board shows the ones linked with its project.",
      readOnly: "Only workspace administrators can change priorities.",
      empty: "No priorities yet",
      emptyDescription:
        "Administrators write the top priorities here and hang the derived ones under them.",
      loadError: "Failed to load the priorities",
      create: "New priority",
      addChild: "Add priority under {{title}}",
      edit: "Edit {{title}}",
      history: "History of {{title}}",
      moveUp: "Move {{title}} up",
      moveDown: "Move {{title}} down",
      close: "Close {{title}}",
      reopen: "Reopen {{title}}",
      noProjects: "Not linked with any project",
      saveError: "Failed to save the priority",
      cycle: "A priority cannot hang from itself or from one under it.",
      forbidden: "Only workspace administrators can change priorities.",
    },
    dialog: {
      createTitle: "New priority",
      editTitle: "Edit priority",
      description: "Title, text, parent and linked projects.",
      titleLabel: "Title",
      bodyLabel: "Text",
      parentLabel: "Parent",
      noParent: "None (top level)",
      projectsLabel: "Linked projects",
      titleRequired: "The title is required.",
      cancel: "Cancel",
      save: "Save",
      saving: "Saving…",
    },
    historyDialog: {
      title: "History",
      empty: "No changes",
      loadError: "Failed to load the history",
      created: "Created by {{name}}",
      updated: "Changed by {{name}}",
      unknown: "someone",
      field: {
        title: "Title",
        body: "Text",
        status: "Status",
        parentId: "Parent",
        position: "Position",
        projectIds: "Projects",
      },
      close: "Close",
    },
  },
};

const es = {
  priorities: {
    title: "Prioridades",
    status: { active: "Activa", closed: "Cerrada" },
    panel: {
      label: "Prioridades de este proyecto",
      showText: "Ver el texto de {{title}}",
      hideText: "Ocultar el texto de {{title}}",
      openTree: "Todas las prioridades",
      loadError: "No se pudieron cargar las prioridades",
    },
    page: {
      description:
        "Las prioridades del espacio de trabajo, de arriba abajo. Cada tablero enseña las enlazadas con su proyecto.",
      readOnly:
        "Solo los administradores del espacio de trabajo cambian las prioridades.",
      empty: "Todavía no hay prioridades",
      emptyDescription:
        "Los administradores escriben aquí las prioridades de arriba y cuelgan de ellas las que se derivan.",
      loadError: "No se pudieron cargar las prioridades",
      create: "Nueva prioridad",
      addChild: "Añadir una prioridad bajo {{title}}",
      edit: "Editar {{title}}",
      history: "Historial de {{title}}",
      moveUp: "Subir {{title}}",
      moveDown: "Bajar {{title}}",
      close: "Cerrar {{title}}",
      reopen: "Reabrir {{title}}",
      noProjects: "Sin proyectos enlazados",
      saveError: "No se pudo guardar la prioridad",
      cycle:
        "Una prioridad no puede colgar de sí misma ni de una que cuelgue de ella.",
      forbidden:
        "Solo los administradores del espacio de trabajo cambian las prioridades.",
    },
    dialog: {
      createTitle: "Nueva prioridad",
      editTitle: "Editar prioridad",
      description: "Título, texto, padre y proyectos enlazados.",
      titleLabel: "Título",
      bodyLabel: "Texto",
      parentLabel: "Padre",
      noParent: "Ninguno (arriba del todo)",
      projectsLabel: "Proyectos enlazados",
      titleRequired: "El título es obligatorio.",
      cancel: "Cancelar",
      save: "Guardar",
      saving: "Guardando…",
    },
    historyDialog: {
      title: "Historial",
      empty: "Sin cambios",
      loadError: "No se pudo cargar el historial",
      created: "Creada por {{name}}",
      updated: "Cambiada por {{name}}",
      unknown: "alguien",
      field: {
        title: "Título",
        body: "Texto",
        status: "Estado",
        parentId: "Padre",
        position: "Posición",
        projectIds: "Proyectos",
      },
      close: "Cerrar",
    },
  },
};

registerInteliaI18n(en, es);
