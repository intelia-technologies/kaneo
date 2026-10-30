export type Reaction = {
  id: string;
  taskId: string;
  commentId: string | null;
  emoji: string;
  userId: string;
  userName: string | null;
  externalUserName: string | null;
  createdAt: string;
};
