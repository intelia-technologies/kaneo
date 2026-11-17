import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import {
  CHAIN_NODE_HEIGHT,
  CHAIN_NODE_WIDTH,
  type ChainNodeData,
  type ChainNodeKind,
} from "../chain-graph-model";
import "../i18n";

const KIND_STYLES: Record<ChainNodeKind, string> = {
  raiz: "border-red-600 bg-red-600/15 border-2",
  cancelar: "border-red-500 bg-red-500/10",
  quitar: "border-green-600 bg-green-600/10",
  mover: "border-blue-500 bg-blue-500/10",
  pendiente: "border-dashed border-muted-foreground/70 bg-card",
  otro_tablero: "border-amber-500 bg-amber-500/10",
  oculta: "border-amber-500 border-dashed bg-amber-500/5",
  destino: "border-blue-500 border-dashed bg-card",
};

const KIND_LABELS: Record<ChainNodeKind, string> = {
  raiz: "root",
  cancelar: "cancelar",
  quitar: "quitar",
  mover: "mover",
  pendiente: "undecided",
  otro_tablero: "otroTablero",
  oculta: "otroTablero",
  destino: "destino",
};

export const ChainNode = memo(function ChainNode({
  data,
}: NodeProps & { data: ChainNodeData }) {
  const { t } = useTranslation();
  const p = "intelia:cancelWithDependents.node";
  const label = data.dimmed
    ? t(`${p}.untouched`)
    : t(`${p}.${KIND_LABELS[data.kind]}`);
  const person =
    data.kind === "otro_tablero"
      ? data.responsable
        ? t(`${p}.owner`, { owner: data.responsable })
        : t(`${p}.noOwner`)
      : data.asignado;

  const body = (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!size-1.5 !border-none !bg-muted-foreground"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!size-1.5 !border-none !bg-muted-foreground"
      />
      <div className="flex min-w-0 items-center justify-between gap-1">
        <span className="truncate font-mono text-[11px] font-semibold">
          {data.ticket ?? data.tablero}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[10px]">
          {data.changed && (
            <span className="rounded-full bg-primary px-1.5 text-primary-foreground">
              {t(`${p}.changed`)}
            </span>
          )}
          <span className="text-muted-foreground">{label}</span>
        </span>
      </div>
      <p className="line-clamp-2 text-xs leading-tight">
        {data.titulo ?? (data.kind === "oculta" ? t(`${p}.hidden`) : "")}
      </p>
      <div className="flex min-w-0 items-center justify-between gap-1 text-[10px] text-muted-foreground">
        <span className="truncate">{person}</span>
        <span className="shrink-0">
          {data.enCurso && `${t(`${p}.inProgress`)} · `}
          {data.cuelgan > 0 && t(`${p}.hangs`, { count: data.cuelgan })}
        </span>
      </div>
    </>
  );

  const className = cn(
    "relative flex flex-col justify-between gap-0.5 rounded-lg border p-2 text-left shadow-2xs select-none",
    KIND_STYLES[data.kind],
    data.dimmed && "opacity-40 grayscale",
    data.changed && "ring-2 ring-primary",
    data.selected && "ring-2 ring-foreground",
  );
  const style = { width: CHAIN_NODE_WIDTH, height: CHAIN_NODE_HEIGHT };

  if (data.clickable && data.ticket && data.onSelect) {
    const { ticket, onSelect } = data;
    return (
      <button
        type="button"
        aria-pressed={data.selected}
        aria-label={`${ticket} ${data.titulo ?? ""} · ${label}`}
        onClick={() => onSelect(ticket)}
        className={cn(className, "cursor-pointer hover:shadow-sm")}
        style={style}
        data-kind={data.kind}
      >
        {data.kind === "pendiente" && (
          <span
            aria-hidden
            className="absolute -top-2 -right-2 rounded-full border border-dashed bg-background px-1 text-[10px] font-semibold"
          >
            {t(`${p}.undecided`)}
          </span>
        )}
        {body}
      </button>
    );
  }
  return (
    <div
      aria-disabled
      className={cn(className, "cursor-default")}
      style={style}
      data-kind={data.kind}
      data-ticket={data.ticket ?? undefined}
    >
      {body}
    </div>
  );
});
