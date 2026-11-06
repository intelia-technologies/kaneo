import type { z } from "zod";
import { taskClassificationTable } from "../../intelia/schema";
import type { updateTaskClassificationBody } from "../schema";
import { withLockedTask } from "./with-locked-task";

type Classification = z.infer<typeof updateTaskClassificationBody>;

export default async function updateTaskClassification(
  id: string,
  classification: Classification,
) {
  const { after } = await withLockedTask(id, async (tx) => {
    const values = {
      type: classification.type,
      validationInProduction: classification.validationInProduction ?? null,
      validationInProductionReason:
        classification.validationInProductionReason ?? null,
    };
    await tx
      .insert(taskClassificationTable)
      .values({ taskId: id, ...values })
      .onConflictDoUpdate({
        target: taskClassificationTable.taskId,
        set: values,
      });
    return values;
  });
  return after;
}
