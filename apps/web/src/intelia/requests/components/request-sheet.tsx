import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useCommentRequest, useRequest } from "../api";
import "../i18n";

// One request as its requester sees it: the task, its comments and a reply
// box. No controls to move or edit: that belongs to the task's board.
export function RequestSheet({
  taskId,
  onClose,
}: {
  taskId: string | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useRequest(taskId);
  const comment = useCommentRequest(taskId ?? "");
  // Keyed by the request, so a draft never follows the user to another one.
  const [draft, setDraft] = useState({ taskId, text: "" });
  const text = draft.taskId === taskId ? draft.text : "";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const content = text.trim();
    if (!content) return;
    comment.mutate(content, {
      onSuccess: () => setDraft({ taskId, text: "" }),
      onError: () => toast.error(t("intelia:requests.detail.sendError")),
    });
  };

  return (
    <Sheet open={!!taskId} onOpenChange={(open) => !open && onClose()}>
      <SheetPopup side="right">
        {isLoading ? (
          <SheetPanel>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="mt-3 h-16 w-full" />
          </SheetPanel>
        ) : isError || !data ? (
          <SheetPanel>
            <SheetTitle className="sr-only">
              {t("intelia:requests.title")}
            </SheetTitle>
            <p role="alert" className="text-muted-foreground text-sm">
              {t("intelia:requests.detail.loadError")}
            </p>
          </SheetPanel>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>
                {data.ticketId && (
                  <span className="me-2 font-mono text-muted-foreground text-xs">
                    {data.ticketId}
                  </span>
                )}
                {data.title}
              </SheetTitle>
              <SheetDescription>
                {data.projectName} · {data.statusName ?? data.status}
              </SheetDescription>
            </SheetHeader>
            <SheetPanel className="flex flex-col gap-4">
              {data.description && (
                <p className="whitespace-pre-wrap text-sm">
                  {data.description}
                </p>
              )}
              <p className="text-muted-foreground text-xs">
                {t("intelia:requests.detail.readOnly")}
              </p>
              <section aria-labelledby="request-comments">
                <h3 id="request-comments" className="mb-2 font-medium text-sm">
                  {t("intelia:requests.detail.comments")}
                </h3>
                {data.comments.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {t("intelia:requests.detail.noComments")}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {data.comments.map((item) => (
                      <li key={item.id} className="text-sm">
                        <div className="flex items-baseline gap-2">
                          <span className="font-medium">
                            {item.userName ?? item.externalUserName ?? "—"}
                          </span>
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {formatDateTime(item.createdAt)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap">{item.content}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <form onSubmit={submit} className="flex flex-col gap-2">
                <Textarea
                  aria-label={t("intelia:requests.detail.reply")}
                  placeholder={t("intelia:requests.detail.reply")}
                  value={text}
                  maxLength={10_000}
                  onChange={(event) =>
                    setDraft({ taskId, text: event.target.value })
                  }
                />
                <Button
                  type="submit"
                  className="self-end"
                  disabled={!text.trim() || comment.isPending}
                >
                  {t("intelia:requests.detail.send")}
                </Button>
              </form>
            </SheetPanel>
          </>
        )}
      </SheetPopup>
    </Sheet>
  );
}
