import {
  ArrowDown,
  ArrowUp,
  Archive,
  ArchiveRestore,
  History,
  Pencil,
  Plus,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Priority } from "../api";
import type { TreeNode } from "../tree";

export type PriorityActions = {
  onAddChild: (priority: Priority) => void;
  onEdit: (priority: Priority) => void;
  onHistory: (priority: Priority) => void;
  onMove: (priority: Priority, position: number) => void;
  onToggleStatus: (priority: Priority) => void;
};

export function PriorityTreeItem({
  node,
  siblings,
  index,
  canEdit,
  busy,
  actions,
}: {
  node: TreeNode<Priority>;
  siblings: number;
  index: number;
  canEdit: boolean;
  busy: boolean;
  actions: PriorityActions;
}) {
  const { t } = useTranslation();
  const { item: priority, children } = node;
  const title = priority.title;
  const closed = priority.status === "closed";

  return (
    <li className="flex flex-col">
      <div className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                closed ? "text-muted-foreground line-through" : "font-medium"
              }
            >
              {title}
            </span>
            {closed ? (
              <Badge variant="outline">
                {t("intelia:priorities.status.closed")}
              </Badge>
            ) : null}
            {priority.projects.map((project) => (
              <Badge key={project.id} variant="secondary">
                {project.name}
              </Badge>
            ))}
          </div>
          {priority.body ? (
            <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground text-sm">
              {priority.body}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={t("intelia:priorities.page.history", { title })}
            onClick={() => actions.onHistory(priority)}
          >
            <History aria-hidden />
          </Button>
          {canEdit ? (
            <>
              <Button
                size="icon-xs"
                variant="ghost"
                disabled={busy || index === 0}
                aria-label={t("intelia:priorities.page.moveUp", { title })}
                onClick={() => actions.onMove(priority, index - 1)}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                disabled={busy || index === siblings - 1}
                aria-label={t("intelia:priorities.page.moveDown", { title })}
                onClick={() => actions.onMove(priority, index + 1)}
              >
                <ArrowDown aria-hidden />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                disabled={busy}
                aria-label={t("intelia:priorities.page.addChild", { title })}
                onClick={() => actions.onAddChild(priority)}
              >
                <Plus aria-hidden />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                disabled={busy}
                aria-label={t("intelia:priorities.page.edit", { title })}
                onClick={() => actions.onEdit(priority)}
              >
                <Pencil aria-hidden />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                disabled={busy}
                aria-label={t(
                  closed
                    ? "intelia:priorities.page.reopen"
                    : "intelia:priorities.page.close",
                  { title },
                )}
                onClick={() => actions.onToggleStatus(priority)}
              >
                {closed ? (
                  <ArchiveRestore aria-hidden />
                ) : (
                  <Archive aria-hidden />
                )}
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {children.length > 0 ? (
        <ul className="ml-4 border-border/60 border-l pl-2">
          {children.map((child, childIndex) => (
            <PriorityTreeItem
              key={child.item.id}
              node={child}
              siblings={children.length}
              index={childIndex}
              canEdit={canEdit}
              busy={busy}
              actions={actions}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
