import { apiRouter } from "../openapi";
import boardSignals from "./board-signals";
import comments from "./comments";
import initiatives from "./initiatives";
import reactions from "./reactions";
import relations from "./relations";
import routines from "./routines";
import statusAge from "./status-age";
import taskAutomation from "./task-automation";
import taskMove from "./task-move";
import userAvatar from "./user-avatar";

// Everything the fork serves under /api/intelia, mounted once in
// apps/api/src/index.ts so new features do not touch upstream's file.
const intelia = apiRouter()
  .route("/", boardSignals)
  .route("/", comments)
  .route("/", initiatives)
  .route("/", reactions)
  .route("/", relations)
  .route("/", routines)
  .route("/", statusAge)
  .route("/", taskAutomation)
  .route("/", taskMove)
  .route("/", userAvatar);

export default intelia;
