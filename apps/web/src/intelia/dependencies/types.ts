export type ProjectRelation = {
  id: string;
  sourceTaskId: string;
  targetTaskId: string;
  relationType: string;
};

export type ProjectRelationExternalTask = {
  id: string;
  number: number | null;
  title: string;
  status: string;
  isCompleted: boolean;
  projectId: string;
  projectSlug: string;
  projectName: string;
};

export type ProjectRelationsResponse = {
  relations: ProjectRelation[];
  externalTasks: ProjectRelationExternalTask[];
};

export type TaskNodeData = {
  id: string;
  number: number | null;
  title: string;
  status: string;
  statusLabel: string;
  columnColor: string | null;
  assigneeName: string | null;
  assigneeImage?: string | null;
  projectSlug: string;
  isBlocked: boolean;
  isDone: boolean;
  isCancelled: boolean;
  isCritical: boolean;
  onOpen: (taskId: string) => void;
};

export type ExternalNodeData = {
  id: string;
  number: number | null;
  title: string;
  status: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  isCompleted: boolean;
  isCritical: boolean;
  workspaceId: string;
};

export type GraphColumn = {
  id: string;
  slug: string;
  name: string;
  isFinal: boolean;
  color?: string | null;
};
