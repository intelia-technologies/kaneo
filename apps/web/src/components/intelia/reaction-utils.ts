import type { Reaction } from "@/types/reaction";

export const DEFAULT_REACTION_EMOJIS = [
  "👍",
  "✅",
  "👀",
  "🎉",
  "❤️",
  "🚀",
] as const;

export type GroupedReaction = {
  emoji: string;
  count: number;
  names: string[];
  hasReacted: boolean;
};

/**
 * Groups reactions for a given target (commentId or null for card) by emoji.
 * Only tags hasReacted=true if the current user reacted as themself
 * (userId === currentUserId && externalUserName === null).
 */
export function groupReactions(
  reactions: Reaction[] | undefined | null,
  targetCommentId: string | null,
  currentUserId: string | null | undefined,
  fallbackName = "Unknown",
): GroupedReaction[] {
  if (!reactions || reactions.length === 0) {
    return [];
  }

  const targetReactions = reactions.filter(
    (r) => (r.commentId ?? null) === (targetCommentId ?? null),
  );

  const groups = new Map<string, GroupedReaction>();

  for (const reaction of targetReactions) {
    const displayName =
      reaction.externalUserName || reaction.userName || fallbackName;
    const isOwnReaction =
      Boolean(currentUserId) &&
      reaction.userId === currentUserId &&
      reaction.externalUserName === null;

    const existing = groups.get(reaction.emoji);
    if (existing) {
      existing.count += 1;
      existing.names.push(displayName);
      if (isOwnReaction) {
        existing.hasReacted = true;
      }
    } else {
      groups.set(reaction.emoji, {
        emoji: reaction.emoji,
        count: 1,
        names: [displayName],
        hasReacted: isOwnReaction,
      });
    }
  }

  return Array.from(groups.values());
}
