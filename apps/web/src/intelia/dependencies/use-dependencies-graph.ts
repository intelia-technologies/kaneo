import { useCallback, useMemo } from "react";
import {
  useProjectTaskView,
  type ProjectTaskView,
} from "@/components/project/toolbar/use-project-task-view";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import {
  useInitiative,
  useProjectInitiatives,
  type InitiativeDetail,
  type InitiativeSummary,
} from "@/intelia/initiatives/api";
import type { ProjectWithTasks } from "@/types/project";
import { useGetProjectRelations } from "./api";
import {
  buildGraphModel,
  type FrontierTask,
  type GraphModelResult,
  type GraphScope,
} from "./graph-model";
import { useBurstValue } from "./realtime";
import type { ProjectRelation, ProjectRelationsResponse } from "./types";

export type UseDependenciesGraphOptions = {
  projectId: string;
  workspaceId: string;
  initiativeId?: string;
  showLoose: boolean;
  showCancelled?: boolean;
  filteredTaskIds?: Set<string>;
  onOpenTask: (taskId: string) => void;
};

export type UseDependenciesGraphResult = {
  project: ProjectWithTasks | null | undefined;
  relationsData: ProjectRelationsResponse | undefined;
  graphModel: GraphModelResult;
  view: ProjectTaskView;
  initiativeNames: Map<string, string>;
  projectInitiatives: InitiativeSummary[];
  selectedInitiative: InitiativeDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<void>;
};

export function useDependenciesGraph({
  projectId,
  workspaceId,
  initiativeId,
  showLoose,
  showCancelled,
  filteredTaskIds,
  onOpenTask,
}: UseDependenciesGraphOptions): UseDependenciesGraphResult {
  const {
    data: liveProject,
    isLoading: isProjectLoading,
    isError: isProjectError,
    refetch: refetchProject,
  } = useGetTasks(projectId);

  const {
    data: liveRelations,
    isLoading: isRelationsLoading,
    isError: isRelationsError,
    refetch: refetchRelations,
  } = useGetProjectRelations(projectId);

  const { data: projectInitiativesData, isLoading: isInitiativesLoading } =
    useProjectInitiatives(projectId);

  const {
    data: initiativeData,
    isLoading: isInitiativeLoading,
    isError: isInitiativeError,
    refetch: refetchInitiative,
  } = useInitiative(projectId, initiativeId ?? "");

  const live = useMemo(
    () => ({ project: liveProject, relationsData: liveRelations }),
    [liveProject, liveRelations],
  );
  const { project, relationsData } = useBurstValue(live, (shown) =>
    Boolean(shown.project && shown.relationsData),
  );

  const view = useProjectTaskView({
    project,
    projectId,
    workspaceId,
    scope: "schedule",
  });

  const allTasks = useMemo(
    () => [
      ...(project?.columns.flatMap((column) => column.tasks) ?? []),
      ...(project?.plannedTasks ?? []),
    ],
    [project],
  );

  const initiativeNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const init of projectInitiativesData?.initiatives ?? []) {
      map.set(init.id, init.name);
    }
    return map;
  }, [projectInitiativesData]);

  // Combine project relations with edges returned from initiative tasks
  const allRelations = useMemo(() => {
    const rels: ProjectRelation[] = [...(relationsData?.relations ?? [])];
    if (initiativeData?.tasks) {
      const existing = new Set(
        rels.map((r) => `${r.sourceTaskId}->${r.targetTaskId}`),
      );
      for (const t of initiativeData.tasks) {
        for (const depId of t.dependsOn) {
          const key = `${depId}->${t.id}`;
          if (!existing.has(key)) {
            existing.add(key);
            rels.push({
              id: key,
              sourceTaskId: depId,
              targetTaskId: t.id,
              relationType: "blocks",
            });
          }
        }
        for (const blockId of t.blocks) {
          const key = `${t.id}->${blockId}`;
          if (!existing.has(key)) {
            existing.add(key);
            rels.push({
              id: key,
              sourceTaskId: t.id,
              targetTaskId: blockId,
              relationType: "blocks",
            });
          }
        }
      }
    }
    return rels;
  }, [relationsData, initiativeData]);

  const scope = useMemo<GraphScope | undefined>(() => {
    if (!initiativeId || !initiativeData) return undefined;
    const frontier: FrontierTask[] = initiativeData.externalTasks.map(
      (ext) => ({
        id: ext.id,
        number: ext.number,
        title: ext.title,
        status: ext.status,
        projectId: ext.projectId,
        projectSlug: ext.projectSlug,
        projectName: ext.projectName,
        initiativeId: ext.initiativeId,
        initiativeName: ext.initiativeId
          ? (initiativeNames.get(ext.initiativeId) ?? null)
          : null,
      }),
    );
    return {
      taskIds: new Set(initiativeData.tasks.map((t) => t.id)),
      frontier,
      initiativeNames,
    };
  }, [initiativeId, initiativeData, initiativeNames]);

  const effectiveFilteredTaskIds = useMemo(() => {
    if (filteredTaskIds) return filteredTaskIds;
    const filteredProject = view.filters.filteredProject;
    if (filteredProject) {
      return new Set([
        ...filteredProject.columns.flatMap((col) => col.tasks.map((t) => t.id)),
        ...(filteredProject.plannedTasks ?? []).map((t) => t.id),
      ]);
    }
    return new Set(allTasks.map((t) => t.id));
  }, [filteredTaskIds, view.filters.filteredProject, allTasks]);

  const graphModel = useMemo(() => {
    return buildGraphModel({
      tasks: allTasks,
      columns: project?.columns ?? [],
      filteredTaskIds: effectiveFilteredTaskIds,
      relations: allRelations,
      externalTasks: relationsData?.externalTasks ?? [],
      showLoose,
      showCancelled,
      projectSlug: project?.slug ?? "",
      workspaceId,
      onOpenTask,
      scope,
    });
  }, [
    allTasks,
    project?.columns,
    effectiveFilteredTaskIds,
    allRelations,
    relationsData?.externalTasks,
    showLoose,
    showCancelled,
    project?.slug,
    workspaceId,
    onOpenTask,
    scope,
  ]);

  const isLoading =
    isProjectLoading ||
    isRelationsLoading ||
    isInitiativesLoading ||
    (Boolean(initiativeId) && isInitiativeLoading);

  const isError =
    isProjectError ||
    isRelationsError ||
    (Boolean(initiativeId) && isInitiativeError);

  const refetch = useCallback(async () => {
    await Promise.all([
      refetchProject(),
      refetchRelations(),
      initiativeId ? refetchInitiative() : Promise.resolve(),
    ]);
  }, [refetchProject, refetchRelations, initiativeId, refetchInitiative]);

  return {
    project,
    relationsData,
    graphModel,
    view,
    initiativeNames,
    projectInitiatives: projectInitiativesData?.initiatives ?? [],
    selectedInitiative: initiativeData,
    isLoading,
    isError,
    refetch,
  };
}
