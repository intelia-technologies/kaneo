import { registerInteliaI18n } from "../i18n";

const en = {
  dependencies: {
    title: "Dependencies",
    showLoose: "Show loose tasks",
    hideLoose: "Hide loose tasks",
    looseTasks: "Loose tasks",
    looseTasksDescription: "Show tasks without dependencies in the graph",
    cycleWarning: "Dependency cycle detected involving: {{tasks}}",
    criticalPath: "Critical path",
    blocked: "Blocked",
    done: "Done",
    cancelled: "Cancelled",
    externalTask: "External",
    externalProject: "Project {{name}}",
    noTasks: "No tasks yet",
    noTasksDescription:
      "Create tasks in this project to see their dependency graph.",
    noTasksFound: "No tasks match your filters",
    noDependencies: "No dependencies to show",
    noDependenciesDescription:
      'Visible tasks have no dependencies between them. Turn on "Show loose tasks" to view them all.',
    unassigned: "Unassigned",
    openExternal: "Open {{task}} in {{project}}",
    loadError: "Failed to load dependencies",
    loadErrorDescription: "Could not retrieve task relations for this project.",
    retry: "Retry",
    loading: "Loading dependencies...",
    initiative: "Initiative",
    allInitiatives: "All",
    withoutInitiative: "Without initiative",
    showCancelled: "Show cancelled tasks",
    hideCancelled: "Hide cancelled tasks",
    cancelledTasks: "Cancelled tasks",
    longestPendingChain: "Longest pending chain",
    chainBadge: "Chain",
    openInDependencies: "Open in Dependencies",
  },
};

const es = {
  dependencies: {
    title: "Dependencias",
    showLoose: "Mostrar tareas sueltas",
    hideLoose: "Ocultar tareas sueltas",
    looseTasks: "Tareas sueltas",
    looseTasksDescription: "Mostrar tareas sin dependencias en el grafo",
    cycleWarning: "Ciclo de dependencias detectado entre: {{tasks}}",
    criticalPath: "Ruta crítica",
    blocked: "Bloqueada",
    done: "Completada",
    cancelled: "Cancelada",
    externalTask: "Externa",
    externalProject: "Proyecto {{name}}",
    noTasks: "No hay tareas",
    noTasksDescription:
      "Crea tareas en el proyecto para ver su grafo de dependencias.",
    noTasksFound: "No se encontraron tareas",
    noDependencies: "Sin dependencias que mostrar",
    noDependenciesDescription:
      "Las tareas visibles no tienen dependencias entre sí. Activa «Tareas sueltas» para verlas todas.",
    unassigned: "Sin asignar",
    openExternal: "Abrir {{task}} en {{project}}",
    loadError: "Error al cargar las dependencias",
    loadErrorDescription:
      "No se pudieron obtener las relaciones entre tareas de este proyecto.",
    retry: "Reintentar",
    loading: "Cargando dependencias...",
    initiative: "Iniciativa",
    allInitiatives: "Todas",
    withoutInitiative: "Sin iniciativa",
    showCancelled: "Mostrar canceladas",
    hideCancelled: "Ocultar canceladas",
    cancelledTasks: "Tareas canceladas",
    longestPendingChain: "Cadena pendiente más larga",
    chainBadge: "Cadena",
    openInDependencies: "Abrir en Dependencias",
  },
};

registerInteliaI18n(en, es);
