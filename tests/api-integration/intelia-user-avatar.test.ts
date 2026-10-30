import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { buildAvatarUrl } from "../../apps/api/src/user/avatar";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import { createWorkspaceMember } from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x02]);

async function setUp() {
  const { user } = await createWorkspaceMember();
  const { key } = await auth.api.createApiKey({
    body: { userId: user.id, name: "Agent avatar" },
  });
  return { app: createApp().app, userId: user.id, key };
}

function putAvatar(app: App, key: string, contentType: string, data: Buffer) {
  return app.request("/api/intelia/user/avatar", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({ contentType, data: data.toString("base64") }),
  });
}

async function currentImage(app: App, key: string) {
  const response = await app.request("/api/user/me", {
    headers: { "x-api-key": key },
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { image: string | null }).image;
}

async function download(app: App, url: string) {
  const response = await app.request(url);
  return {
    status: response.status,
    type: response.headers.get("content-type"),
    bytes: Buffer.from(await response.arrayBuffer()),
  };
}

describe("API integration: PUT /api/intelia/user/avatar", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stores the avatar and sets it as the image with an API key", async () => {
    const { app, key } = await setUp();

    const response = await putAvatar(app, key, "image/png", PNG);

    expect(response.status, await response.clone().text()).toBe(200);
    const avatar = (await response.json()) as { id: string; url: string };
    expect(avatar.url).toBe(buildAvatarUrl(avatar.id));
    expect(await currentImage(app, key)).toBe(avatar.url);
    expect(await download(app, avatar.url)).toMatchObject({
      status: 200,
      type: "image/png",
      bytes: PNG,
    });
  });

  it("replaces the previous avatar and image", async () => {
    const { app, key } = await setUp();
    const first = (await (
      await putAvatar(app, key, "image/png", PNG)
    ).json()) as { url: string };

    const response = await putAvatar(app, key, "image/jpeg", JPEG);

    expect(response.status).toBe(200);
    const second = (await response.json()) as { url: string };
    expect(second.url).not.toBe(first.url);
    expect(await currentImage(app, key)).toBe(second.url);
    expect((await download(app, first.url)).status).toBe(404);
    expect(await download(app, second.url)).toMatchObject({
      status: 200,
      type: "image/jpeg",
      bytes: JPEG,
    });
    expect(await db.select().from(schema.userAvatarTable)).toHaveLength(1);
  });

  it.each([
    ["bytes that do not match the type", "image/png", JPEG],
    ["an unsupported type", "image/gif", Buffer.from("GIF89a")],
  ])("rejects %s without touching the image", async (_, type, data) => {
    const { app, key } = await setUp();
    const stored = (await (
      await putAvatar(app, key, "image/png", PNG)
    ).json()) as { url: string };

    const response = await putAvatar(app, key, type, data);

    expect(response.status).toBe(400);
    expect(await currentImage(app, key)).toBe(stored.url);
    expect(await download(app, stored.url)).toMatchObject({
      status: 200,
      bytes: PNG,
    });
  });

  it("refuses while the custom provider manages the picture", async () => {
    vi.stubEnv("CUSTOM_OAUTH_MANAGED_PROFILE_FIELDS", "image");
    const { app, userId, key } = await setUp();
    await db.insert(schema.accountTable).values({
      accountId: `sub-${randomUUID()}`,
      providerId: "custom",
      userId,
    });

    const response = await putAvatar(app, key, "image/png", PNG);

    expect(response.status).toBe(403);
    expect(await readErrorBody(response)).toMatchObject({
      code: "PROFILE_FIELD_MANAGED_BY_PROVIDER",
    });
    const [user] = await db
      .select({ image: schema.userTable.image })
      .from(schema.userTable)
      .where(eq(schema.userTable.id, userId));
    expect(user?.image).toBeNull();
    expect(await db.select().from(schema.userAvatarTable)).toHaveLength(0);
  });

  it("requires credentials", async () => {
    const { app } = await setUp();

    const response = await app.request("/api/intelia/user/avatar", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contentType: "image/png",
        data: PNG.toString("base64"),
      }),
    });

    expect(response.status).toBe(401);
  });
});
