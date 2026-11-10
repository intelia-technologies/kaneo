import { ListTree, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import {
  type Priority,
  type PriorityUpdate,
  useUpdatePriority,
  useWorkspacePriorities,
} from "../api";
import "../i18n";
import { buildTree } from "../tree";
import { PriorityDialog } from "./priority-dialog";
import { PriorityHistoryDialog } from "./priority-history-dialog";
import { PriorityTreeItem, type PriorityActions } from "./priority-tree-item";

type Editing =
  | { mode: "create"; parentId: string | null }
  | { mode: "edit"; priority: Priority }
  | null;

// The workspace's view of the whole tree (design 53 §3.5). Everyone reads;
// only administrators (`manageWorkspace`) get the controls that change it.
export function PrioritiesPage({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const {
    data: priorities,
    isLoading,
    isError,
  } = useWorkspacePriorities(workspaceId);
  const { data: projects } = useGetProjects({ workspaceId });
  const { canManageWorkspace } = useWorkspacePermission();
  const canEdit = canManageWorkspace();
  const update = useUpdatePriority();
  const [editing, setEditing] = useState<Editing>(null);
  const [historyOf, setHistoryOf] = useState<Priority | null>(null);
  const title = t("intelia:priorities.title");

  const tree = useMemo(() => buildTree(priorities ?? []), [priorities]);
  const titles = useMemo(
    () => new Map((priorities ?? []).map((p) => [p.id, p.title])),
    [priorities],
  );
  const projectNames = useMemo(
    () => new Map((projects ?? []).map((p) => [p.id, p.name])),
    [projects],
  );

  const save = (priority: Priority, input: PriorityUpdate) =>
    update.mutate(
      { priorityId: priority.id, input },
      { onError: () => toast.error(t("intelia:priorities.page.saveError")) },
    );

  const actions: PriorityActions = {
    onAddChild: (priority) =>
      setEditing({ mode: "create", parentId: priority.id }),
    onEdit: (priority) => setEditing({ mode: "edit", priority }),
    onHistory: setHistoryOf,
    onMove: (priority, position) => save(priority, { position }),
    onToggleStatus: (priority) =>
      save(priority, {
        status: priority.status === "active" ? "closed" : "active",
      }),
  };

  return (
    <>
      <PageTitle title={title} />
      <WorkspaceLayout title={title}>
        <div className="h-full overflow-y-auto">
          <div className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground text-sm">
                {t("intelia:priorities.page.description")}
                {canEdit ? null : ` ${t("intelia:priorities.page.readOnly")}`}
              </p>
              {canEdit ? (
                <Button
                  size="sm"
                  onClick={() => setEditing({ mode: "create", parentId: null })}
                >
                  <Plus aria-hidden />
                  {t("intelia:priorities.page.create")}
                </Button>
              ) : null}
            </div>
            {isLoading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map((row) => (
                  <Skeleton key={row} className="h-8 w-full" />
                ))}
              </div>
            ) : isError ? (
              <p role="alert" className="text-muted-foreground text-sm">
                {t("intelia:priorities.page.loadError")}
              </p>
            ) : tree.length === 0 ? (
              <Empty className="min-h-[50vh]">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ListTree />
                  </EmptyMedia>
                  <EmptyTitle>{t("intelia:priorities.page.empty")}</EmptyTitle>
                  <EmptyDescription>
                    {t("intelia:priorities.page.emptyDescription")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul aria-label={title} className="flex flex-col">
                {tree.map((node, index) => (
                  <PriorityTreeItem
                    key={node.item.id}
                    node={node}
                    siblings={tree.length}
                    index={index}
                    canEdit={canEdit}
                    busy={update.isPending}
                    actions={actions}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </WorkspaceLayout>
      {canEdit ? (
        <PriorityDialog
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          workspaceId={workspaceId}
          priorities={priorities ?? []}
          priority={editing?.mode === "edit" ? editing.priority : undefined}
          parentId={editing?.mode === "create" ? editing.parentId : null}
        />
      ) : null}
      {historyOf ? (
        <PriorityHistoryDialog
          open
          onOpenChange={(open) => {
            if (!open) setHistoryOf(null);
          }}
          priority={historyOf}
          titles={titles}
          projectNames={projectNames}
        />
      ) : null}
    </>
  );
}
