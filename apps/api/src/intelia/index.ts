import { apiRouter } from "../openapi";
import comments from "./comments";
import reactions from "./reactions";
import relations from "./relations";
import routines from "./routines";
import userAvatar from "./user-avatar";

// Everything the fork serves under /api/intelia, mounted once in
// apps/api/src/index.ts so new features do not touch upstream's file.
const intelia = apiRouter()
  .route("/", comments)
  .route("/", reactions)
  .route("/", relations)
  .route("/", routines)
  .route("/", userAvatar);

export default intelia;
