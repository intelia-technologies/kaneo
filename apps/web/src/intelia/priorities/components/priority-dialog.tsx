import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import { HttpError } from "@/lib/http-error";
import { toast } from "@/lib/toast";
import {
  type Priority,
  type PriorityUpdate,
  useCreatePriority,
  useUpdatePriority,
} from "../api";
import { parentOptions } from "../tree";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  priorities: Priority[];
  // Edit this one; without it, create one under `parentId`.
  priority?: Priority;
  parentId?: string | null;
};

export function PriorityDialog({
  open,
  onOpenChange,
  workspaceId,
  priorities,
  priority,
  parentId = null,
}: Props) {
  const { t } = useTranslation();
  const create = useCreatePriority(workspaceId);
  const update = useUpdatePriority();
  const { data: projects } = useGetProjects({ workspaceId, enabled: open });
  const initialProjectIds = priority?.projects.map((p) => p.id) ?? [];

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [parent, setParent] = useState<string>("");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(priority?.title ?? "");
    setBody(priority?.body ?? "");
    setParent((priority ? priority.parentId : parentId) ?? "");
    setProjectIds(priority?.projects.map((p) => p.id) ?? []);
    setError(null);
  }, [open, priority, parentId]);

  const pending = create.isPending || update.isPending;
  const parents = parentOptions(priorities, priority?.id ?? null);

  const toggleProject = (id: string, checked: boolean) =>
    setProjectIds((current) =>
      checked ? [...current, id] : current.filter((value) => value !== id),
    );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t("intelia:priorities.dialog.titleRequired"));
      return;
    }
    const parentValue = parent || null;
    try {
      if (priority) {
        // Only what changed: one change in the log, or none.
        const input: PriorityUpdate = {};
        if (trimmed !== priority.title) input.title = trimmed;
        if (body !== priority.body) input.body = body;
        if (parentValue !== priority.parentId) input.parentId = parentValue;
        const sameProjects =
          [...projectIds].sort().join() ===
          [...initialProjectIds].sort().join();
        if (!sameProjects) input.projectIds = projectIds;
        if (Object.keys(input).length > 0) {
          await update.mutateAsync({ priorityId: priority.id, input });
        }
      } else {
        await create.mutateAsync({
          title: trimmed,
          body,
          parentId: parentValue,
          projectIds,
        });
      }
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof HttpError && err.code === "PRIORITY_CYCLE"
          ? t("intelia:priorities.page.cycle")
          : err instanceof HttpError && err.status === 403
            ? t("intelia:priorities.page.forbidden")
            : t("intelia:priorities.page.saveError");
      setError(message);
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t(
              priority
                ? "intelia:priorities.dialog.editTitle"
                : "intelia:priorities.dialog.createTitle",
            )}
          </DialogTitle>
          <DialogDescription>
            {t("intelia:priorities.dialog.description")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <DialogPanel className="space-y-4">
            {error ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-destructive text-sm"
              >
                {error}
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="priority-title">
                {t("intelia:priorities.dialog.titleLabel")} *
              </Label>
              <Input
                id="priority-title"
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priority-body">
                {t("intelia:priorities.dialog.bodyLabel")}
              </Label>
              <Textarea
                id="priority-body"
                value={body}
                maxLength={10_000}
                rows={4}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priority-parent">
                {t("intelia:priorities.dialog.parentLabel")}
              </Label>
              <select
                id="priority-parent"
                value={parent}
                onChange={(e) => setParent(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">
                  {t("intelia:priorities.dialog.noParent")}
                </option>
                {parents.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="space-y-1.5">
              <legend className="font-medium text-sm">
                {t("intelia:priorities.dialog.projectsLabel")}
              </legend>
              <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                {(projects ?? []).map((project) => {
                  const id = `priority-project-${project.id}`;
                  return (
                    <div key={project.id} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={projectIds.includes(project.id)}
                        onCheckedChange={(checked) =>
                          toggleProject(project.id, checked === true)
                        }
                      />
                      <Label htmlFor={id} className="font-normal">
                        {project.name}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          </DialogPanel>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={pending} />
              }
            >
              {t("intelia:priorities.dialog.cancel")}
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending
                ? t("intelia:priorities.dialog.saving")
                : t("intelia:priorities.dialog.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
