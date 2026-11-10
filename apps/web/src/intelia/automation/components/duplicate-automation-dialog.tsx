import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { useDuplicateTask } from "@/hooks/mutations/task/use-duplicate-task";
import { InitiativePicker } from "@/intelia/initiatives/components/initiative-picker";
import { InitiativeRequiredReason } from "@/intelia/initiatives/components/initiative-required-reason";
import {
  type DuplicateRequest,
  useDuplicateAutomationStore,
} from "../duplicate-store";
import { useAutomationDraft } from "../use-automation-draft";
import { AutomationCreateFields } from "./automation-create-fields";
import "../i18n";
import "@/intelia/initiatives/i18n";
function DuplicateAutomationForm({ request }: { request: DuplicateRequest }) {
  const { t } = useTranslation();
  const close = useDuplicateAutomationStore((state) => state.close);
  const automation = useAutomationDraft();
  const [initiativeId, setInitiativeId] = useState<string | null>(null);
  const { mutate, isPending } = useDuplicateTask();

  const needsInitiative = request.missingInitiative ?? false;

  const canConfirm =
    automation.isValid && (!needsInitiative || Boolean(initiativeId));

  const confirm = () => {
    if (!canConfirm || isPending || !automation.input) return;
    mutate(
      {
        taskId: request.taskId,
        title: request.title,
        automation: automation.input,
        ...(needsInitiative && initiativeId ? { initiativeId } : {}),
      },
      { onSuccess: close },
    );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("intelia:automation.duplicate.title")}</DialogTitle>
          <DialogDescription>
            {t("intelia:automation.duplicate.description")}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <AutomationCreateFields control={automation} disabled={isPending} />
          {needsInitiative && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="duplicate-initiative-picker"
                className="text-xs font-medium text-foreground"
              >
                {t("intelia:initiative.title")}
              </label>
              <InitiativePicker
                id="duplicate-initiative-picker"
                projectId={request.projectId}
                value={initiativeId}
                onChange={setInitiativeId}
                disabled={isPending}
                invalid={!initiativeId}
              />
              <InitiativeRequiredReason show={!initiativeId} />
            </div>
          )}
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            {t("common:actions.cancel")}
          </DialogClose>
          <Button
            type="button"
            onClick={confirm}
            loading={isPending}
            disabled={!canConfirm}
          >
            {t("intelia:automation.duplicate.confirm")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

// Mounted once in the authenticated layout. Every duplicate asks for the
// copy's automation, like creating a task.
export function DuplicateAutomationDialog() {
  const request = useDuplicateAutomationStore((state) => state.request);
  if (!request) return null;
  return <DuplicateAutomationForm key={request.taskId} request={request} />;
}
