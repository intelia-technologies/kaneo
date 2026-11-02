import { useState, type FormEvent, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import type { InitiativeDetail, InitiativeUpdate } from "../api";
import { useUpdateInitiative } from "../api";

type EditInitiativeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initiative: InitiativeDetail;
  projectId: string;
};

export function EditInitiativeDialog({
  open,
  onOpenChange,
  initiative,
  projectId,
}: EditInitiativeDialogProps) {
  const { t } = useTranslation();
  const updateMutation = useUpdateInitiative(projectId);

  const initialName = initiative.name ?? "";
  const initialDesignUrl = initiative.designUrl ?? "";
  const initialApprovedBy = initiative.approvedBy ?? "";
  const initialApprovedAt = initiative.approvedAt
    ? initiative.approvedAt.slice(0, 10)
    : "";

  const [name, setName] = useState(initialName);
  const [designUrl, setDesignUrl] = useState(initialDesignUrl);
  const [approvedBy, setApprovedBy] = useState(initialApprovedBy);
  const [approvedAt, setApprovedAt] = useState(initialApprovedAt);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset form whenever dialog opens or initiative changes
  useEffect(() => {
    if (open) {
      setName(initiative.name ?? "");
      setDesignUrl(initiative.designUrl ?? "");
      setApprovedBy(initiative.approvedBy ?? "");
      setApprovedAt(
        initiative.approvedAt ? initiative.approvedAt.slice(0, 10) : "",
      );
      setErrorMessage(null);
    }
  }, [open, initiative]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage(t("intelia:initiatives.detail.editDialog.nameRequired"));
      return;
    }

    const trimmedDesignUrl = designUrl.trim();
    if (trimmedDesignUrl) {
      try {
        new URL(trimmedDesignUrl);
      } catch {
        setErrorMessage(
          t("intelia:initiatives.detail.editDialog.designUrlInvalid"),
        );
        return;
      }
    }

    const trimmedApprovedBy = approvedBy.trim();

    // Only compute changed fields
    const patch: InitiativeUpdate = {};

    if (trimmedName !== initialName) {
      patch.name = trimmedName;
    }

    if (trimmedDesignUrl !== initialDesignUrl) {
      patch.designUrl = trimmedDesignUrl ? trimmedDesignUrl : null;
    }

    if (trimmedApprovedBy !== initialApprovedBy) {
      patch.approvedBy = trimmedApprovedBy ? trimmedApprovedBy : null;
    }

    if (approvedAt !== initialApprovedAt) {
      patch.approvedAt = approvedAt
        ? new Date(`${approvedAt}T00:00:00.000Z`).toISOString()
        : null;
    }

    if (Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }

    try {
      await updateMutation.mutateAsync({
        initiativeId: initiative.id,
        input: patch,
      });
      toast.success(t("intelia:initiatives.detail.editDialog.successToast"));
      onOpenChange(false);
    } catch (err: unknown) {
      const errObj = err as {
        status?: number;
        code?: string;
        message?: string;
      };
      if (
        errObj.status === 409 ||
        errObj.code === "INITIATIVE_NAME_TAKEN" ||
        errObj.message?.includes("INITIATIVE_NAME_TAKEN")
      ) {
        const msg = t("intelia:initiatives.detail.editDialog.errorTaken");
        setErrorMessage(msg);
        toast.error(msg);
      } else if (errObj.status === 403) {
        const msg = t("intelia:initiatives.detail.editDialog.errorForbidden");
        setErrorMessage(msg);
        toast.error(msg);
      } else {
        const msg = t("intelia:initiatives.detail.editDialog.errorGeneric");
        setErrorMessage(msg);
        toast.error(msg);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("intelia:initiatives.detail.editDialog.title")}
          </DialogTitle>
          <DialogDescription>
            {t("intelia:initiatives.detail.editDialog.description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <DialogPanel className="space-y-4">
            {errorMessage && (
              <div
                role="alert"
                className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-destructive text-sm"
              >
                {errorMessage}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="initiative-name">
                {t("intelia:initiatives.detail.editDialog.nameLabel")} *
              </Label>
              <Input
                id="initiative-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t(
                  "intelia:initiatives.detail.editDialog.namePlaceholder",
                )}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="initiative-design-url">
                {t("intelia:initiatives.detail.editDialog.designUrlLabel")}
              </Label>
              <Input
                id="initiative-design-url"
                type="url"
                value={designUrl}
                onChange={(e) => setDesignUrl(e.target.value)}
                placeholder={t(
                  "intelia:initiatives.detail.editDialog.designUrlPlaceholder",
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="initiative-approved-by">
                {t("intelia:initiatives.detail.editDialog.approvedByLabel")}
              </Label>
              <Input
                id="initiative-approved-by"
                value={approvedBy}
                onChange={(e) => setApprovedBy(e.target.value)}
                placeholder={t(
                  "intelia:initiatives.detail.editDialog.approvedByPlaceholder",
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="initiative-approved-at">
                {t("intelia:initiatives.detail.editDialog.approvedAtLabel")}
              </Label>
              <Input
                id="initiative-approved-at"
                type="date"
                value={approvedAt}
                onChange={(e) => setApprovedAt(e.target.value)}
              />
            </div>
          </DialogPanel>

          <DialogFooter>
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  disabled={updateMutation.isPending}
                />
              }
            >
              {t("intelia:initiatives.detail.editDialog.cancel")}
            </DialogClose>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending
                ? t("intelia:initiatives.detail.editDialog.saving")
                : t("intelia:initiatives.detail.editDialog.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
