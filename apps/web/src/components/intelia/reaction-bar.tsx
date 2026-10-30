import { SmilePlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToggleReaction } from "@/hooks/mutations/intelia/use-toggle-reaction";
import { useTaskReactions } from "@/hooks/queries/intelia/use-task-reactions";
import { cn } from "@/lib/cn";
import { DEFAULT_REACTION_EMOJIS, groupReactions } from "./reaction-utils";

export type ReactionBarProps = {
  taskId: string;
  commentId: string | null;
  className?: string;
};

export function ReactionBar({
  taskId,
  commentId,
  className,
}: ReactionBarProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currentUserId = user?.id;
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  const { data: reactions = [] } = useTaskReactions(taskId);
  const { mutate: toggleReaction, isPending } = useToggleReaction();

  const isCardReaction = commentId === null;
  const fallbackSomeone = t("common:people.someone", {
    defaultValue: "Someone",
  });
  const grouped = groupReactions(
    reactions,
    commentId,
    currentUserId,
    fallbackSomeone,
  );

  if (!taskId) return null;

  const handleToggle = (emoji: string) => {
    if (!currentUserId || isPending) return;
    const group = grouped.find((g) => g.emoji === emoji);
    toggleReaction({
      taskId,
      commentId,
      emoji,
      hasReacted: Boolean(group?.hasReacted),
    });
  };

  const handlePaletteSelect = (emoji: string) => {
    if (!currentUserId || isPending) return;
    const group = grouped.find((g) => g.emoji === emoji);
    toggleReaction({
      taskId,
      commentId,
      emoji,
      hasReacted: Boolean(group?.hasReacted),
    });
    setIsPaletteOpen(false);
  };

  return (
    <TooltipProvider>
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5",
          !isCardReaction &&
            grouped.length === 0 &&
            !isPaletteOpen &&
            "opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 transition-opacity",
          className,
        )}
      >
        {grouped.map((group) => (
          <Tooltip key={group.emoji}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => handleToggle(group.emoji)}
                disabled={!currentUserId || isPending}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium transition-colors cursor-pointer select-none",
                  group.hasReacted
                    ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
                    : "border-border/70 bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
                aria-label={`${group.emoji} ${group.count}`}
                aria-pressed={group.hasReacted}
              >
                <span className="text-sm leading-none">{group.emoji}</span>
                <span className="text-[11px] font-semibold">{group.count}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{group.names.join(", ")}</p>
            </TooltipContent>
          </Tooltip>
        ))}

        <Popover open={isPaletteOpen} onOpenChange={setIsPaletteOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={!currentUserId || isPending}
              className={cn(
                "inline-flex h-6 items-center justify-center rounded-full border border-dashed border-border/80 text-muted-foreground text-xs hover:border-border hover:bg-muted/50 hover:text-foreground transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-50",
                isCardReaction && grouped.length === 0 ? "gap-1 px-2" : "w-6",
              )}
              aria-label={t("activity:reactions.add", {
                defaultValue: "Add reaction",
              })}
            >
              <SmilePlus className="size-3.5" />
              {isCardReaction && grouped.length === 0 && (
                <span className="text-[11px] font-medium">
                  {t("activity:reactions.add", {
                    defaultValue: "Add reaction",
                  })}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            sideOffset={4}
            className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-md"
          >
            {DEFAULT_REACTION_EMOJIS.map((emoji) => {
              const isReacted = grouped.some(
                (g) => g.emoji === emoji && g.hasReacted,
              );
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handlePaletteSelect(emoji)}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md text-base hover:bg-accent hover:scale-110 active:scale-95 transition-all cursor-pointer",
                    isReacted && "bg-accent/80 ring-1 ring-primary/40",
                  )}
                  aria-label={emoji}
                  title={emoji}
                >
                  {emoji}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      </div>
    </TooltipProvider>
  );
}

export default ReactionBar;
