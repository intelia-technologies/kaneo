import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, ListTree } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type BoardPriority, useProjectPriorities } from "../api";
import "../i18n";

// The board's panel (design 53 §3.5): the active priorities linked with the
// project, each with its chain up to the root. Nothing while loading or when
// the project has none, so a board without priorities looks as before.
export function ProjectPrioritiesPanel({
  projectId,
  workspaceId,
}: {
  projectId: string;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const { data: priorities, isError } = useProjectPriorities(projectId);

  if (isError) {
    return (
      <p role="alert" className="px-4 py-1.5 text-muted-foreground text-xs">
        {t("intelia:priorities.panel.loadError")}
      </p>
    );
  }
  if (!priorities?.length) return null;

  return (
    <section
      aria-label={t("intelia:priorities.panel.label")}
      className="flex shrink-0 items-start gap-2 border-border/60 border-b px-4 py-1.5 text-sm"
    >
      <ListTree
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <ul className="flex min-w-0 flex-1 flex-col gap-0.5">
        {priorities.map((priority) => (
          <PanelItem key={priority.id} priority={priority} />
        ))}
      </ul>
      <Link
        to="/dashboard/workspace/$workspaceId/priorities"
        params={{ workspaceId }}
        className="shrink-0 text-muted-foreground text-xs underline-offset-2 hover:underline"
      >
        {t("intelia:priorities.panel.openTree")}
      </Link>
    </section>
  );
}

function PanelItem({ priority }: { priority: BoardPriority }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <li className="min-w-0">
      <div className="flex min-w-0 items-center gap-1">
        {priority.body ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={t(
              open
                ? "intelia:priorities.panel.hideText"
                : "intelia:priorities.panel.showText",
              { title: priority.title },
            )}
            onClick={() => setOpen((value) => !value)}
            className="shrink-0 rounded text-muted-foreground hover:text-foreground"
          >
            <Chevron aria-hidden className="size-3.5" />
          </button>
        ) : null}
        <span className="truncate">
          {priority.chain.map((ancestor) => (
            <span key={ancestor.id} className="text-muted-foreground">
              {ancestor.title}
              {" › "}
            </span>
          ))}
          <span className="font-medium">{priority.title}</span>
        </span>
      </div>
      {open ? (
        <p className="whitespace-pre-wrap py-1 pl-5 text-muted-foreground text-xs">
          {priority.body}
        </p>
      ) : null}
    </li>
  );
}
