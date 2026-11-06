import { describe, expect, it } from "vite-plus/test";
import { createApp } from "../../apps/api/src/index";

describe("API integration: health", () => {
  it("returns the image version and commit on /api/health", async () => {
    const version = process.env.KANEO_IMAGE_VERSION;
    const commit = process.env.GIT_COMMIT;
    process.env.KANEO_IMAGE_VERSION = "2.48.0-intelia.42";
    process.env.GIT_COMMIT = "0123456789abcdef0123456789abcdef01234567";
    try {
      const { app } = createApp();
      const response = await app.request("/api/health");
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        status: "ok",
        version: "2.48.0-intelia.42",
        git_commit: "0123456789abcdef0123456789abcdef01234567",
      });
    } finally {
      if (version === undefined) delete process.env.KANEO_IMAGE_VERSION;
      else process.env.KANEO_IMAGE_VERSION = version;
      if (commit === undefined) delete process.env.GIT_COMMIT;
      else process.env.GIT_COMMIT = commit;
    }
  });
});
