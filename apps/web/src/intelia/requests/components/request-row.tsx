import { useTranslation } from "react-i18next";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { MyRequest } from "../api";
import "../i18n";

// One request of «Lo que he pedido». An open one opens in the sheet; a closed
// one (rejected or cancelled) only shows its state and reason: its task is
// no longer readable by the requester.
export function RequestRow({
  request,
  onSelect,
}: {
  request: MyRequest;
  onSelect: (taskId: string) => void;
}) {
  const { t } = useTranslation();
  const open = () => onSelect(request.taskId);
  const title = (
    <>
      {request.ticketId && (
        <span className="shrink-0 font-mono text-muted-foreground text-xs">
          {request.ticketId}
        </span>
      )}
      <span className="truncate">{request.title}</span>
    </>
  );

  return (
    <TableRow
      className={request.followable ? "cursor-pointer" : undefined}
      onClick={request.followable ? open : undefined}
    >
      <TableCell className="max-w-80">
        {request.followable ? (
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 text-left outline-none focus-visible:underline"
            onClick={(event) => {
              event.stopPropagation();
              open();
            }}
          >
            {title}
          </button>
        ) : (
          <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
            {title}
          </span>
        )}
      </TableCell>
      <TableCell>{request.projectName}</TableCell>
      <TableCell>
        {request.state === "open" ? (
          (request.statusName ?? request.status)
        ) : (
          <span className="flex flex-col">
            <span>{t(`intelia:requests.state.${request.state}`)}</span>
            {request.closedReason && (
              <span className="whitespace-pre-wrap text-muted-foreground text-xs">
                {request.closedReason}
              </span>
            )}
          </span>
        )}
      </TableCell>
      <TableCell className="tabular-nums">
        {formatDateTime(request.requestedAt)}
      </TableCell>
    </TableRow>
  );
}
