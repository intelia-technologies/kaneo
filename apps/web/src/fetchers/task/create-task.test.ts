import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import createTask from "./create-task";

const automation = { level: "manual", verification: true } as const;
const initiative = { id: "init-1" } as const;
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
        automation,
        initiative,
      );
      expect(mocks.post).toHaveBeenCalledWith(
        expect.objectContaining({
          json: expect.objectContaining({
            title: "Unassigned task",
            description: "",
            status: "to-do",
            startDate: undefined,
            dueDate: undefined,
            priority: "no-priority",
            automation,
            initiative,
          }),
          param: { projectId: "project-1" },
        }),
      );
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
      automation,
      initiative,
    );

    expect(mocks.post).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({ userId: "user-1", initiative }),
      }),
    );
  });

  it("supports subtasks inheriting the parent's initiative", async () => {
    await createTask(
      "Subtask",
      "",
      "project-1",
      undefined,
      "to-do",
      undefined,
      undefined,
      "no-priority",
      automation,
      { parentTaskId: "parent-1" },
    );

    expect(mocks.post).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({
          initiative: { parentTaskId: "parent-1" },
        }),
      }),
    );
  });
});
