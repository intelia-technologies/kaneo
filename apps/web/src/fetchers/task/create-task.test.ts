import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import createTask from "./create-task";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("@kaneo/libs", () => ({
  client: {
    task: {
      ":projectId": {
        $post: mocks.post,
      },
    },
  },
}));

// Intelia fork: the level every create sends (README-INTELIA.md).
const automation = { level: "manual", verification: true } as const;
describe("createTask", () => {
  beforeEach(() => {
    mocks.post.mockReset();
    mocks.post.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "task-1" }),
    });
  });

  it.each([undefined, ""])(
    "omits the assignee when userId is %s",
    async (userId) => {
      await createTask(
        "Unassigned task",
        "",
        "project-1",
        userId,
        "to-do",
        undefined,
        undefined,
        "no-priority",
        undefined,
        undefined,
        undefined,
        automation,
      );

      expect(mocks.post).toHaveBeenCalledWith({
        json: {
          title: "Unassigned task",
          description: "",
          status: "to-do",
          startDate: undefined,
          dueDate: undefined,
          priority: "no-priority",
          automation,
        },
        param: { projectId: "project-1" },
      });
    },
  );

  it("preserves an assigned userId", async () => {
    await createTask(
      "Assigned task",
      "",
      "project-1",
      "user-1",
      "to-do",
      undefined,
      undefined,
      "no-priority",
      undefined,
      undefined,
      undefined,
      automation,
    );

    expect(mocks.post).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({ userId: "user-1" }),
      }),
    );
  });

  it("sends nothing without an automation level", async () => {
    await expect(
      createTask(
        "Task",
        "",
        "project-1",
        undefined,
        "to-do",
        undefined,
        undefined,
        "no-priority",
      ),
    ).rejects.toThrow("automation level");
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
