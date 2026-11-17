import { registerInteliaI18n } from "../i18n";

const en = {
  cancelWithDependents: {
    title: "Cancel {{ticket}}",
    hint: "Click a node to decide what happens to it.",
    reason: "Reason",
    reasonPlaceholder: "Why is this task cancelled?",
    reasonHelp:
      "Required, at least {{min}} characters. Every affected task gets it in a comment.",
    cancelAll: "✕ Cancel all",
    releaseAll: "✓ Release all",
    counters: {
      cancelled: "Cancelled: {{count}}",
      released: "Released: {{count}}",
      moved: "Moved: {{count}}",
      otherBoards: "Other boards: {{count}}",
      missing: "Left: {{count}}",
    },
    graphLabel: "Dependency chain of {{ticket}}",
    menu: {
      title: "{{ticket}}",
      cancel: "✕ Cancel",
      cancelHint: "then decide what hangs from it",
      cancelBranch: "✕ Cancel with its branch",
      cancelBranchHint: "also cancels everything below it on this board",
      release: "✓ Remove dependency",
      releaseHint: "stays alive; its branch is untouched",
      move: "↪ Move to…",
      moveHint: "its dependency passes to another task",
      close: "Close",
    },
    search: {
      label: "Task the dependency moves to",
      placeholder: "Search by key or title…",
      empty: "No open task matches",
      minChars: "Type at least {{min}} characters",
      loading: "Searching…",
    },
    node: {
      undecided: "¿?",
      hidden: "Task on a board you cannot see",
      owner: "Owner: {{owner}}",
      noOwner: "No owner",
      changed: "New",
      inProgress: "In progress",
      hangs: "{{count}} below",
      root: "Cancelling",
      cancelar: "Cancelled",
      quitar: "Released",
      mover: "Moved",
      otroTablero: "Other board",
      destino: "New blocker",
      untouched: "Untouched",
    },
    legend: {
      title: "Legend",
      root: "Task being cancelled",
      cancel: "Cancelled too",
      release: "Released (✂ arrow cut)",
      move: "Moved (new blue arrow)",
      otherBoard: "Other board: automatic",
      undecided: "To decide",
      untouched: "Not touched",
    },
    otherBoards: {
      title: "Other boards are touched (not decided here)",
      item: "{{ticket}}: dependency removed, automation off, {{owner}} is notified.",
      itemNoOwner:
        "{{ticket}}: dependency removed, automation off, its project leads are notified.",
      hidden:
        "A task on {{board}} you cannot see: same treatment, its owner is notified.",
    },
    summary: {
      title: "What will happen",
      cancelled: "Cancelled",
      released: "Dependency removed",
      moved: "Dependency moved",
      movedItem: "{{ticket}}: from {{from}} to {{to}}",
      otherBoards: "Other boards",
      nothing: "Nothing decided yet.",
      comments:
        "Each affected task gets a comment with who, why and the choice.",
    },
    problems: {
      title: "The server rejected part of the decisions",
      changed:
        "The chain changed since you opened it. New or changed tasks are marked; your decisions that still hold are kept.",
    },
    truncated:
      "This chain has {{total}} tasks and only the first {{shown}} are shown. Resolve it in parts or by hand.",
    footer: {
      missing_one: "{{count}} left to decide",
      missing_other: "{{count}} left to decide",
      allDecided: "All decided",
      reasonMissing: "Write the reason",
      submit_one: "Cancel {{count}} task",
      submit_other: "Cancel {{count}} tasks",
      submitting: "Cancelling…",
    },
    error: "Could not cancel: {{message}}",
  },
};

const es = {
  cancelWithDependents: {
    title: "Cancelar {{ticket}}",
    hint: "Pincha un nodo para decidir.",
    reason: "Motivo",
    reasonPlaceholder: "¿Por qué se cancela esta tarea?",
    reasonHelp:
      "Obligatorio, al menos {{min}} caracteres. Cada tarea afectada lo recibe en un comentario.",
    cancelAll: "✕ Cancelar todo",
    releaseAll: "✓ Liberar todo",
    counters: {
      cancelled: "Se cancelan: {{count}}",
      released: "Se liberan: {{count}}",
      moved: "Se mueven: {{count}}",
      otherBoards: "Otros tableros: {{count}}",
      missing: "Faltan: {{count}}",
    },
    graphLabel: "Cadena de dependencias de {{ticket}}",
    menu: {
      title: "{{ticket}}",
      cancel: "✕ Cancelar",
      cancelHint: "luego decides lo que cuelga",
      cancelBranch: "✕ Cancelar con su rama",
      cancelBranchHint:
        "cancela también todo lo que cuelga de ella en este tablero",
      release: "✓ Quitar dependencia",
      releaseHint: "sigue viva; su rama no se toca",
      move: "↪ Mover a…",
      moveHint: "su dependencia pasa a otra tarea",
      close: "Cerrar",
    },
    search: {
      label: "Tarea a la que pasa la dependencia",
      placeholder: "Busca por clave o título…",
      empty: "Ninguna tarea abierta coincide",
      minChars: "Escribe al menos {{min}} caracteres",
      loading: "Buscando…",
    },
    node: {
      undecided: "¿?",
      hidden: "Tarea de un tablero que no ves",
      owner: "Responsable: {{owner}}",
      noOwner: "Sin responsable",
      changed: "Nueva",
      inProgress: "En curso",
      hangs: "{{count}} debajo",
      root: "Se cancela",
      cancelar: "Se cancela",
      quitar: "Se libera",
      mover: "Se mueve",
      otroTablero: "Otro tablero",
      destino: "Nuevo bloqueo",
      untouched: "No se toca",
    },
    legend: {
      title: "Leyenda",
      root: "Tarea que se cancela",
      cancel: "Se cancela también",
      release: "Se libera (flecha cortada ✂)",
      move: "Se mueve (flecha azul nueva)",
      otherBoard: "Otro tablero: automático",
      undecided: "Por decidir",
      untouched: "No se toca",
    },
    otherBoards: {
      title: "Se tocan otros tableros (no se decide aquí)",
      item: "{{ticket}}: se quita la dependencia, se apaga su automática y se avisa a {{owner}}.",
      itemNoOwner:
        "{{ticket}}: se quita la dependencia, se apaga su automática y se avisa a los responsables de su proyecto.",
      hidden:
        "Una tarea de {{board}} que no ves: mismo tratamiento, se avisa a su responsable.",
    },
    summary: {
      title: "Qué va a pasar",
      cancelled: "Se cancelan",
      released: "Se quita la dependencia",
      moved: "Se mueve la dependencia",
      movedItem: "{{ticket}}: de {{from}} a {{to}}",
      otherBoards: "Otros tableros",
      nothing: "Aún no has decidido nada.",
      comments:
        "Cada tarea afectada recibe un comentario con quién, el motivo y lo elegido.",
    },
    problems: {
      title: "El servidor ha rechazado parte de las decisiones",
      changed:
        "La cadena ha cambiado desde que la abriste. Las tareas nuevas o cambiadas van marcadas; se conservan tus decisiones que siguen valiendo.",
    },
    truncated:
      "Esta cadena tiene {{total}} tareas y solo se ven las {{shown}} primeras. Resuélvela por partes o a mano.",
    footer: {
      missing_one: "Falta {{count}} por decidir",
      missing_other: "Faltan {{count}} por decidir",
      allDecided: "Todo decidido",
      reasonMissing: "Escribe el motivo",
      submit_one: "Cancelar {{count}} tarea",
      submit_other: "Cancelar {{count}} tareas",
      submitting: "Cancelando…",
    },
    error: "No se ha podido cancelar: {{message}}",
  },
};

registerInteliaI18n(en, es);
