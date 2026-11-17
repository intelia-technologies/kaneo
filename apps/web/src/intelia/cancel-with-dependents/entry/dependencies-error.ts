import { HttpError } from "@/lib/http-error";
import {
  errorErrorDependenciasSinResolver,
  type ErrorDependenciasSinResolver,
} from "../contract/cancelar-con-dependientes";

/**
 * The `409 DEPENDENCIAS_SIN_RESOLVER` an old path that cancels or deletes
 * answers with (design 82, decision 17), or null for any other error.
 */
export function dependenciesErrorOf(
  error: unknown,
): ErrorDependenciasSinResolver | null {
  if (!(error instanceof HttpError) || error.status !== 409) return null;
  return errorErrorDependenciasSinResolver(error.body) === null
    ? (error.body as ErrorDependenciasSinResolver)
    : null;
}
