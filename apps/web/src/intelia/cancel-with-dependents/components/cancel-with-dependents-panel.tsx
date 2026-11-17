import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type {
  ErrorDependenciasSinResolver,
  ResultadoCancelar,
} from "../contract/cancelar-con-dependientes";
import { CancelPanelBody } from "./cancel-panel-body";
import "../i18n";

export type CancelWithDependentsPanelProps = {
  /** The `409 DEPENDENCIAS_SIN_RESOLVER` that opened it; `null` closes it. */
  error: ErrorDependenciasSinResolver | null;
  /** Kaneo id of the root task, for `POST /intelia/task/{id}/cancel`. */
  taskId: string;
  workspaceId: string;
  onClose: () => void;
  onCancelled: (result: ResultadoCancelar) => void;
};

/**
 * Panel D (design 82 §4.9): a non-modal side panel, so the board stays in
 * view behind it, with the dependency chain to resolve before cancelling.
 */
export function CancelWithDependentsPanel({
  error,
  taskId,
  workspaceId,
  onClose,
  onCancelled,
}: CancelWithDependentsPanelProps) {
  const { t } = useTranslation();
  const p = "intelia:cancelWithDependents";

  return (
    <SheetPrimitive.Root
      open={error !== null}
      modal={false}
      onOpenChange={(open) => !open && onClose()}
    >
      <SheetPrimitive.Portal>
        <SheetPrimitive.Popup
          data-slot="sheet-popup"
          className="fixed inset-y-0 end-0 z-50 flex w-[min(820px,100vw)] flex-col border-s bg-popover text-popover-foreground shadow-lg transition-[opacity,translate] duration-200 ease-out data-ending-style:translate-x-8 data-ending-style:opacity-0 data-starting-style:translate-x-8 data-starting-style:opacity-0"
        >
          {error && (
            <>
              <header className="flex flex-col gap-1 px-6 pt-6 pb-3">
                <SheetPrimitive.Title className="font-heading font-semibold text-xl">
                  {t(`${p}.title`, { ticket: error.details.tarea.ticket })}
                </SheetPrimitive.Title>
                <SheetPrimitive.Description className="text-muted-foreground text-sm">
                  <span className="me-1">{error.details.tarea.titulo}</span>·{" "}
                  {t(`${p}.hint`)}
                </SheetPrimitive.Description>
              </header>
              <CancelPanelBody
                // A new root starts from scratch.
                key={`${taskId}:${error.details.tarea.ticket}`}
                error={error}
                taskId={taskId}
                workspaceId={workspaceId}
                onCancelled={onCancelled}
              />
            </>
          )}
          <SheetPrimitive.Close
            aria-label={t("common:actions.close")}
            className="absolute end-2 top-2"
            render={<Button size="icon" variant="ghost" />}
          >
            <XIcon />
          </SheetPrimitive.Close>
        </SheetPrimitive.Popup>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}
