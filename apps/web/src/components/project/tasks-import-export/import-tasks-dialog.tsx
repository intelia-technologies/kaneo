import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, UploadIcon } from "lucide-react";
import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  isJsonFile,
  parseTasksImport,
} from "@/components/project/tasks-import-export/tasks-import-file";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import useImportTasks from "@/hooks/mutations/task/use-import-tasks";
import { ImportAutomationFields } from "@/intelia/automation/components/import-automation-fields";
import { useAutomationDraft } from "@/intelia/automation/use-automation-draft";
import { InitiativePicker } from "@/intelia/initiatives/components/initiative-picker";
import "@/intelia/initiatives/i18n";
import { toast } from "@/lib/toast";
const EXAMPLE_FORMAT = `{
  "tasks": [
    {
      "title": "Task title",
      "description": "Description text",
      "status": "to-do",
      "type": "validacion",
      "priority": "low",
      "startDate": "2025-04-18T00:00:00.000Z",
      "dueDate": "2025-04-20T00:00:00.000Z",
      "userId": "user@example.com"
    }
  ]
}`;

type ImportTasksDialogProps = {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ImportTasksDialog({
  projectId,
  open,
  onOpenChange,
}: ImportTasksDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutateAsync: importTasks, isPending } = useImportTasks();
  const automation = useAutomationDraft();
  const [initiativeId, setInitiativeId] = useState<string | null>(null);
  const [type, setType] = useState<
    "" | "implementacion" | "validacion" | "operacion" | "diseno"
  >("");
  const [validation, setValidation] = useState<"" | "requerida" | "no_aplica">(
    "",
  );
  const [reason, setReason] = useState("");
  const needsValidation = type === "implementacion" || type === "operacion";
  const classificationValid =
    !!type &&
    (!needsValidation ||
      (!!validation &&
        (validation !== "no_aplica" ||
          (!!reason.trim() && !/[\r\n]/.test(reason)))));

  const importFile = async (file: File) => {
    const input = automation.input;
    if (!input || !initiativeId) return;
    try {
      const tasks = parseTasksImport(await file.text());

      if (!tasks) {
        toast.error(t("settings:tasksImportExport.invalidFormat"));
        return;
      }
      const missingClassification = tasks.some((task) => task.type == null);
      if (missingClassification && !classificationValid) {
        toast.error(
          "Seleccione una clasificación válida para las tareas sin clasificar.",
        );
        return;
      }
      const classifiedTasks = tasks.map((task) =>
        task.type != null
          ? task
          : {
              ...task,
              type: type as NonNullable<typeof task.type>,
              validationInProduction: needsValidation
                ? (validation as "requerida" | "no_aplica")
                : null,
              validationInProductionReason:
                needsValidation && validation === "no_aplica"
                  ? reason.trim()
                  : null,
            },
      );

      toast.loading(t("settings:tasksImportExport.importing"));

      const result = await importTasks({
        projectId,
        tasks: classifiedTasks,
        automation: input,
        initiativeId,
      });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });

      onOpenChange(false);
      automation.reset();
      setInitiativeId(null);
      toast.success(
        t("settings:tasksImportExport.importSuccess", {
          count: result.results.successful,
        }),
        { icon: UploadIcon },
      );

      if (result.results.failed > 0) {
        toast.error(
          t("settings:tasksImportExport.importPartialError", {
            count: result.results.failed,
          }),
        );
      }
    } catch (error) {
      toast.dismiss();
      toast.error(t("settings:tasksImportExport.importError"));
      console.error(error);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void importFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];

    if (!file) {
      toast.error(t("settings:tasksImportExport.noFileDropped"));
      return;
    }

    if (!isJsonFile(file)) {
      toast.error(t("settings:tasksImportExport.notJsonFile"));
      return;
    }

    void importFile(file);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          automation.reset();
          setInitiativeId(null);
        }
      }}
    >
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("settings:tasksImportExport.dialogTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("settings:tasksImportExport.dialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {t("settings:tasksImportExport.expectedFormat")}
            </p>
            <pre className="max-h-32 overflow-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs">
              {EXAMPLE_FORMAT}
            </pre>
          </div>
          <fieldset className="space-y-2">
            <legend>Clasificación para tareas sin clasificar (opcional)</legend>
            <select
              aria-label="Tipo para tareas sin clasificar"
              value={type}
              onChange={(event) => {
                setType(event.target.value as typeof type);
                setValidation("");
                setReason("");
              }}
            >
              <option value="">Seleccionar</option>
              <option value="implementacion">Implementación</option>
              <option value="validacion">Validación</option>
              <option value="operacion">Operación</option>
              <option value="diseno">Diseño</option>
            </select>
            {needsValidation && (
              <select
                aria-label="Validación en producción para importación"
                value={validation}
                onChange={(event) =>
                  setValidation(event.target.value as typeof validation)
                }
              >
                <option value="">Seleccionar</option>
                <option value="requerida">Requerida</option>
                <option value="no_aplica">No aplica</option>
              </select>
            )}
            {needsValidation && validation === "no_aplica" && (
              <input
                aria-label="Motivo para importación"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
            <p>
              Solo se aplica a registros sin tipo; las clasificaciones
              existentes se conservan.
            </p>
          </fieldset>
          <ImportAutomationFields control={automation} disabled={isPending} />
          <div className="space-y-1.5">
            <label
              htmlFor="import-initiative-picker"
              className="text-xs font-medium text-foreground"
            >
              {t("intelia:initiative.title")}
            </label>
            <InitiativePicker
              id="import-initiative-picker"
              projectId={projectId}
              value={initiativeId}
              onChange={setInitiativeId}
              disabled={isPending}
              invalid={!initiativeId}
            />
            <p className="text-xs text-muted-foreground">
              {t("intelia:initiative.importHint")}
            </p>
          </div>
          <div
            className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/30 px-6 py-8 text-center transition-colors hover:border-ring"
            onDrop={handleDrop}
            onDragOver={(event) => event.preventDefault()}
          >
            <Upload
              aria-hidden="true"
              className="size-5 text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">
              {t("settings:tasksImportExport.dropHint")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending || !automation.isValid || !initiativeId}
            >
              {isPending ? <Loader2 className="animate-spin" /> : null}
              {t("settings:tasksImportExport.selectFile")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            {t("common:actions.cancel")}
          </DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
