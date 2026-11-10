import { apiRouter } from "../openapi";
import boardSignals from "./board-signals";
import comments from "./comments";
import initiatives from "./initiatives";
import priorities from "./priorities";
import priorityWebhooks from "./priorities/webhooks";
import projectName from "./project-name";
import reactions from "./reactions";
import relations from "./relations";
import routines from "./routines";
import statusAge from "./status-age";
import taskArchive from "./task-archive";
import "./task-archive/subscribe";
import taskAutomation from "./task-automation";
import taskMove from "./task-move";
import taskRequest from "./task-request";
import "./task-request/subscribe";
import userAvatar from "./user-avatar";

// Everything the fork serves under /api/intelia, mounted once in
// apps/api/src/index.ts so new features do not touch upstream's file.
const intelia = apiRouter()
  .route("/", boardSignals)
  .route("/", comments)
  .route("/", initiatives)
  .route("/", reactions)
  .route("/", relations)
  .route("/", priorities)
  .route("/", priorityWebhooks)
  .route("/", projectName)
  .route("/", routines)
  .route("/", statusAge)
  .route("/", taskArchive)
  .route("/", taskAutomation)
  .route("/", taskMove)
  .route("/", taskRequest)
  .route("/", userAvatar);

export default intelia;
