import type { TaskRecurrence } from "./recurrence";

type TaskLabel = {
  id: string;
  name: string;
  color: string;
};

type TaskExternalLink = {
  id: string;
  taskId: string;
  integrationId: string | null;
  resourceType: string;
  externalId: string;
  url: string;
  title: string | null;
  metadata: Record<string, unknown> | null;
};

type TaskCustomFieldValue = {
  fieldId: string;
  value: string | null;
};

type Task = {
  id: string;
  title: string;
  number: number | null;
  description: string | null;
  descriptionDeferred?: boolean;
  status: string;
  priority: string | null;
  startDate: string | null;
  dueDate: string | null;
  recurrence?: TaskRecurrence | null;
  position: number | null;
  createdAt: string;
  updatedAt?: string;
  userId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeImage?: string | null;
  projectId: string;
  columnId?: string | null;
  type?: "implementacion" | "validacion" | "operacion" | "diseno" | null;
  validationInProduction?: "requerida" | "no_aplica" | null;
  validationInProductionReason?: string | null;
  // Intelia (design 53 §3.2): archived, apart from the status.
  archivedAt?: string | null;
  blockersSummary?: {
    pendingCount: number;
    hasCancelledBlocker: boolean;
    waitingRelease: boolean;
    blockers: { id: string; ticket: string; status: string }[];
    externalCount: number;
  };
  subtaskCounts?: { completed: number; total: number };
  labels?: TaskLabel[];
  externalLinks?: TaskExternalLink[];
  customFieldValues?: TaskCustomFieldValue[];
};

export default Task;
