import { beforeAll, beforeEach, expect, it, vi } from "vite-plus/test";
import createComment from "../../apps/api/src/activity/controllers/create-comment";
import db, { schema } from "../../apps/api/src/database";
import { genericWebhookPlugin } from "../../apps/api/src/plugins/generic-webhook";
import { postToGenericWebhook } from "../../apps/api/src/plugins/generic-webhook/client";
import {
  initializeEventSubscriptions,
  registerPlugin,
} from "../../apps/api/src/plugins/registry";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

vi.mock("../../apps/api/src/plugins/generic-webhook/client", () => ({
  postToGenericWebhook: vi.fn().mockResolvedValue(undefined),
}));

beforeAll(() => {
  registerPlugin(genericWebhookPlugin);
  initializeEventSubscriptions();
});
beforeEach(async () => {
  await resetTestDatabase();
  vi.mocked(postToGenericWebhook).mockClear();
});

it.each([
  { external: undefined, externalUserName: null },
  {
    external: { userName: "Historical Author", source: "planka" },
    externalUserName: "Historical Author",
  },
])(
  "task.comment_created identifies the created comment (externalUserName=$externalUserName)",
  async ({ external, externalUserName }) => {
    const { workspace, user } = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    await db.insert(schema.integrationTable).values({
      projectId: project.id,
      type: "generic-webhook",
      isActive: true,
      config: JSON.stringify({ webhookUrl: "https://hooks.example.com/kaneo" }),
    });
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        title: "Task",
        number: 1,
        status: "to-do",
      })
      .returning();

    const comment = await createComment(task!.id, user.id, "Hello", external);

    await vi.waitFor(() =>
      expect(postToGenericWebhook).toHaveBeenCalledTimes(1),
    );
    const [, payload] = vi.mocked(postToGenericWebhook).mock.calls[0] ?? [];
    expect(payload).toMatchObject({
      event: "task.comment_created",
      task: { id: task!.id },
      actor: { id: user.id },
      data: {
        comment: expect.stringContaining("Hello"),
        commentId: comment.id,
        externalUserName,
      },
    });
  },
);
