import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vite-plus/test";
import { invalidateRelationTaskProject } from "./invalidate-relation-task-project";

describe("invalidateRelationTaskProject", () => {
  it("invalidates all cached task boards, including partial and cross-project pages", async () => {
    const client = new QueryClient();
    client.setQueryData(["tasks", "source"], { columns: [] });
    client.setQueryData(["tasks", "target"], { columns: [] });
    client.setQueryData(["other"], {});
    await invalidateRelationTaskProject(client);
    expect(client.getQueryState(["tasks", "source"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["tasks", "target"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["other"])?.isInvalidated).toBe(false);
    client.clear();
  });
});
