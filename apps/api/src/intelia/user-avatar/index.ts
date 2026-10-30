import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { userTable } from "../../database/schema";
import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../openapi";
import { MAX_AVATAR_BYTES, MAX_AVATAR_REQUEST_BYTES } from "../../user/avatar";
import saveAvatar from "../../user/controllers/save-avatar";
import { requireUnmanagedAvatar } from "../../user/managed-avatar-guards";
import { avatarSchema } from "../../user/response";
import { uploadAvatarBody } from "../../user/schema";
import { boundedRequestBody } from "../../utils/bounded-request-body";

// Upstream's PUT /api/user/avatar stores the file but leaves user.image alone,
// and better-auth's update-user needs a session. This route does both with
// whatever credential the caller has, API keys included.
const setUserAvatarRoute = createRoute({
  method: "put",
  operationId: "setUserAvatar",
  path: "/user/avatar",
  tags: ["User"],
  summary: "Upload avatar and set it as the profile picture",
  description: `Store a base64 encoded avatar (PNG, JPEG, or WebP, up to ${Math.floor(
    MAX_AVATAR_BYTES / 1024,
  )}KB) for the current user, replacing any existing one, and set the user's image to its public URL. Works with an API key.`,
  middleware: [
    requireUnmanagedAvatar,
    boundedRequestBody(MAX_AVATAR_REQUEST_BYTES),
  ] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: uploadAvatarBody } },
    },
  },
  responses: {
    200: jsonResponse(
      "Avatar stored and set as the user's image",
      avatarSchema,
    ),
    403: errorResponse(
      "The custom OAuth/OIDC provider manages the profile picture",
    ),
    408: errorResponse("Request body timed out"),
    413: errorResponse("Request body exceeds the upload limit"),
    400: errorResponse(
      "Unsupported content type, malformed base64, or too large",
    ),
  },
});

const userAvatar = apiRouter().openapi(setUserAvatarRoute, async (c) => {
  const userId = c.get("userId");
  const { contentType, data } = c.req.valid("json");
  const avatar = await saveAvatar({ userId, contentType, data }).catch(
    (error: unknown) => {
      throw new HTTPException(400, {
        message:
          error instanceof Error ? error.message : "Invalid avatar upload",
      });
    },
  );
  await db
    .update(userTable)
    .set({ image: avatar.url })
    .where(eq(userTable.id, userId));
  return c.json(avatar, 200);
});

export default userAvatar;
