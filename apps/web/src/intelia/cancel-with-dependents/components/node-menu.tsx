import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { NodoDecidir } from "../contract/cancelar-con-dependientes";
import { MoveTargetSearch } from "./move-target-search";
import "../i18n";

export type NodeMenuAction =
  | { type: "cancelar" }
  | { type: "cancelarRama" }
  | { type: "quitar" }
  | { type: "mover"; a: string; title: string };

export function NodeMenu({
  node,
  hasBranch,
  workspaceId,
  moveExcluded,
  onAction,
  onClose,
}: {
  node: NodoDecidir;
  /** Something of this board hangs from it. */
  hasBranch: boolean;
  workspaceId: string;
  moveExcluded: ReadonlySet<string>;
  onAction: (action: NodeMenuAction) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const p = "intelia:cancelWithDependents.menu";
  const [moving, setMoving] = useState(false);
  // The menu opens below the graph: take focus there so keyboard and screen
  // reader users land on the options of the node they just picked.
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => sectionRef.current?.focus(), []);
  const can = (accion: NodoDecidir["opciones"][number]) =>
    node.opciones.includes(accion);

  const option = (label: string, hint: string, onClick: () => void) => (
    <Button
      type="button"
      variant="outline"
      className="h-auto flex-col items-start gap-0 py-1.5 text-left"
      onClick={onClick}
    >
      <span className="text-sm">{label}</span>
      <span className="font-normal text-muted-foreground text-xs">{hint}</span>
    </Button>
  );

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-label={t(`${p}.title`, { ticket: node.ticket })}
      className="flex flex-col gap-2 rounded-lg border bg-card p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <header className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm">
          <span className="me-2 font-mono text-xs">{node.ticket}</span>
          {node.titulo}
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          {t(`${p}.close`)}
        </Button>
      </header>
      <div className="grid grid-cols-2 gap-2">
        {can("cancelar") &&
          option(t(`${p}.cancel`), t(`${p}.cancelHint`), () =>
            onAction({ type: "cancelar" }),
          )}
        {can("cancelar") &&
          hasBranch &&
          option(t(`${p}.cancelBranch`), t(`${p}.cancelBranchHint`), () =>
            onAction({ type: "cancelarRama" }),
          )}
        {can("quitar") &&
          option(t(`${p}.release`), t(`${p}.releaseHint`), () =>
            onAction({ type: "quitar" }),
          )}
        {can("mover") &&
          option(t(`${p}.move`), t(`${p}.moveHint`), () => setMoving(true))}
      </div>
      {moving && (
        <MoveTargetSearch
          workspaceId={workspaceId}
          excluded={moveExcluded}
          onPick={(a, title) => onAction({ type: "mover", a, title })}
        />
      )}
    </section>
  );
}
