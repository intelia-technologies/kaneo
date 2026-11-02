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
import {
  type DuplicateRequest,
  useDuplicateAutomationStore,
} from "../duplicate-store";
import { useAutomationDraft } from "../use-automation-draft";
import { AutomationCreateFields } from "./automation-create-fields";
import "../i18n";

function DuplicateAutomationForm({ request }: { request: DuplicateRequest }) {
  const { t } = useTranslation();
  const close = useDuplicateAutomationStore((state) => state.close);
  const automation = useAutomationDraft();
  const { mutate, isPending } = useDuplicateTask();

  const confirm = () => {
    if (!automation.input || isPending) return;
    mutate({ ...request, automation: automation.input }, { onSuccess: close });
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
        <DialogPanel>
          <AutomationCreateFields control={automation} disabled={isPending} />
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            {t("common:actions.cancel")}
          </DialogClose>
          <Button
            type="button"
            onClick={confirm}
            loading={isPending}
            disabled={!automation.isValid}
          >
            {t("intelia:automation.duplicate.confirm")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

// Mounted once in the authenticated layout. A task without a level cannot be
// duplicated until one is chosen for the copy.
export function DuplicateAutomationDialog() {
  const request = useDuplicateAutomationStore((state) => state.request);
  if (!request) return null;
  return <DuplicateAutomationForm key={request.taskId} request={request} />;
}
