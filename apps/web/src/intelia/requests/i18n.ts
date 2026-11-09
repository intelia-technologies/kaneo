import { registerInteliaI18n } from "../i18n";

const en = {
  requests: {
    title: "My requests",
    description:
      "Tasks you asked of other boards, with their state. Click an open one to follow it.",
    state: {
      rejected: "Rejected",
      cancelled: "Cancelled",
    },
    task: "Task",
    project: "Project",
    status: "Status",
    requestedAt: "Asked",
    empty: "You have not asked for anything",
    emptyDescription:
      "When a team records you as the requester of a task, it shows up here.",
    loadError: "Failed to load your requests",
    detail: {
      close: "Close",
      comments: "Comments",
      noComments: "No comments yet",
      reply: "Write a comment",
      send: "Comment",
      sendError: "Failed to send the comment",
      loadError: "This request is no longer available",
      readOnly:
        "You can follow and comment on this task; its board decides the rest.",
    },
  },
};

const es = {
  requests: {
    title: "Lo que he pedido",
    description:
      "Las tareas que has pedido a otros tableros, con su estado. Haz clic en una abierta para seguirla.",
    state: {
      rejected: "Rechazada",
      cancelled: "Cancelada",
    },
    task: "Tarea",
    project: "Proyecto",
    status: "Estado",
    requestedAt: "Pedida",
    empty: "No has pedido nada",
    emptyDescription:
      "Cuando un equipo te registre como solicitante de una tarea, aparecerá aquí.",
    loadError: "No se pudieron cargar tus peticiones",
    detail: {
      close: "Cerrar",
      comments: "Comentarios",
      noComments: "Aún no hay comentarios",
      reply: "Escribe un comentario",
      send: "Comentar",
      sendError: "No se pudo enviar el comentario",
      loadError: "Esta petición ya no está disponible",
      readOnly:
        "Puedes seguir y comentar esta tarea; lo demás lo decide su tablero.",
    },
  },
};

registerInteliaI18n(en, es);
