// Design 53 §3.2 (KF-8): no integration transition moves a task archived with
// the mark. A branch push and a PR/MR opened on the task's branch leave it
// done; the same webhook without the mark moves it, as before.
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { publishEvent } from "../../apps/api/src/events";
import { taskArchiveTable } from "../../apps/api/src/intelia/schema";
import { handleGiteaPullRequestOpened } from "../../apps/api/src/plugins/gitea/webhooks/pull-request-opened";
import { handleGiteaPush } from "../../apps/api/src/plugins/gitea/webhooks/push";
import { handlePullRequestOpened } from "../../apps/api/src/plugins/github/webhooks/pull-request-opened";
import { handlePush } from "../../apps/api/src/plugins/github/webhooks/push";
import { handleGitlabMergeRequestOpened } from "../../apps/api/src/plugins/gitlab/webhooks/merge-request-opened";
import { handleGitlabPush } from "../../apps/api/src/plugins/gitlab/webhooks/push";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

vi.mock("../../apps/api/src/events", () => ({
  publishEvent: vi.fn(async () => undefined),
}));

beforeEach(async () => {
  await resetTestDatabase();
  vi.mocked(publishEvent).mockReset();
});

type Provider = "github" | "gitea" | "gitlab";

async function setup(provider: Provider, archived: boolean) {
  const { user, workspace } = await createWorkspaceMember();
  const { project } = await createProjectFixture({
    workspaceId: workspace.id,
    slug: "KAN",
  });
  await db
    .update(schema.projectTable)
    .set({ lastTaskNumber: 1 })
    .where(eq(schema.projectTable.id, project.id));
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId: project.id,
      number: 1,
      title: "card",
      status: "done",
      position: 0,
    })
    .returning();
  if (archived) await db.insert(taskArchiveTable).values({ taskId: task!.id });
  const [integration] = await db
    .insert(schema.integrationTable)
    .values({
      projectId: project.id,
      type: provider,
      config: JSON.stringify({
        baseUrl: "https://git.example",
        accessToken: "test-only",
        repositoryOwner: "owner",
        repositoryName: "repo",
        projectPath: "owner/repo",
        installationId: 10,
        repositoryId: 20,
        verifiedGithubAccountId: "123",
        verifiedByUserId: user.id,
        branchPattern: "{slug}-{number}",
        statusTransitions: {
          onBranchPush: "in-progress",
          onPROpen: "in-review",
        },
      }),
    })
    .returning();
  const status = async () =>
    (
      await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, task!.id),
      })
    )?.status;
  return { integration: integration!, status };
}

const repository = {
  id: 20,
  owner: { login: "owner" },
  name: "repo",
  html_url: "https://git.example/owner/repo",
};
const gitlabProject = {
  id: 20,
  name: "repo",
  path_with_namespace: "owner/repo",
  web_url: "https://git.example/owner/repo",
};

async function push(provider: Provider, integrationId: string) {
  const request = {
    ref: "refs/heads/KAN-1",
    after: "abc",
    installation: { id: 10 },
    repository,
  };
  if (provider === "github") await handlePush(request);
  else if (provider === "gitea") await handleGiteaPush(request, integrationId);
  else
    await handleGitlabPush(
      { ref: request.ref, after: "abc", project: gitlabProject },
      integrationId,
    );
}

async function openPullRequest(provider: Provider, integrationId: string) {
  const request = {
    action: "opened",
    installation: { id: 10 },
    repository,
    pull_request: {
      number: 1,
      title: "change",
      body: null,
      html_url: "https://git.example/owner/repo/pull/1",
      state: "open",
      draft: false,
      merged: false,
      merged_at: null,
      head: { ref: "KAN-1" },
      user: { login: "author" },
    },
  };
  if (provider === "github") await handlePullRequestOpened(request);
  else if (provider === "gitea")
    await handleGiteaPullRequestOpened(request, integrationId);
  else
    await handleGitlabMergeRequestOpened(
      {
        project: gitlabProject,
        object_attributes: {
          iid: 1,
          title: "change",
          description: null,
          url: "https://git.example/owner/repo/-/merge_requests/1",
          state: "opened",
          action: "open",
          source_branch: "KAN-1",
          draft: false,
        },
      },
      integrationId,
    );
}

it.each(
  (["github", "gitea", "gitlab"] as const).flatMap((provider) =>
    [true, false].map((archived) => ({ provider, archived })),
  ),
)(
  "$provider branch push moves a done task only without the mark (archived: $archived)",
  async ({ provider, archived }) => {
    const { integration, status } = await setup(provider, archived);
    await push(provider, integration.id);
    expect(await status()).toBe(archived ? "done" : "in-progress");
  },
);

it.each(
  (["github", "gitea", "gitlab"] as const).flatMap((provider) =>
    [true, false].map((archived) => ({ provider, archived })),
  ),
)(
  "$provider opened PR moves a done task only without the mark (archived: $archived)",
  async ({ provider, archived }) => {
    const { integration, status } = await setup(provider, archived);
    await openPullRequest(provider, integration.id);
    expect(await status()).toBe(archived ? "done" : "in-review");
  },
);
