import { Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMyRequests } from "../api";
import "../i18n";
import { RequestRow } from "./request-row";
import { RequestSheet } from "./request-sheet";

// «Lo que he pedido» (design 52 §3.2): the caller's requests in any project
// of the workspace, with their state; an open one opens in a sheet to follow
// and comment.
export function RequestsPage({
  workspaceId,
  selectedTaskId,
  onSelect,
}: {
  workspaceId: string;
  selectedTaskId: string | undefined;
  onSelect: (taskId: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const { data: requests, isLoading, isError } = useMyRequests(workspaceId);
  const title = t("intelia:requests.title");

  return (
    <>
      <PageTitle title={title} />
      <WorkspaceLayout title={title}>
        <div className="h-full overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col px-4">
              {[1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="flex h-11 items-center gap-3 border-border/50 border-b px-1"
                >
                  <Skeleton className="h-3.5 w-14" />
                  <Skeleton className="h-3.5 flex-1" />
                  <Skeleton className="h-3.5 w-24" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <p role="alert" className="p-6 text-muted-foreground text-sm">
              {t("intelia:requests.loadError")}
            </p>
          ) : !requests?.length ? (
            <Empty className="min-h-[60vh]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Send />
                </EmptyMedia>
                <EmptyTitle>{t("intelia:requests.empty")}</EmptyTitle>
                <EmptyDescription>
                  {t("intelia:requests.emptyDescription")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-3 p-4">
              <p className="text-muted-foreground text-sm">
                {t("intelia:requests.description")}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("intelia:requests.task")}</TableHead>
                    <TableHead>{t("intelia:requests.project")}</TableHead>
                    <TableHead>{t("intelia:requests.status")}</TableHead>
                    <TableHead>{t("intelia:requests.requestedAt")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <RequestRow
                      key={request.taskId}
                      request={request}
                      onSelect={onSelect}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </WorkspaceLayout>
      <RequestSheet
        taskId={selectedTaskId}
        onClose={() => onSelect(undefined)}
      />
    </>
  );
}
