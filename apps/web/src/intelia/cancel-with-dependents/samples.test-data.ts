import type {
  ErrorDependenciasSinResolver,
  NodoCadena,
  PeticionCancelar,
  ResultadoCancelar,
} from "./contract/cancelar-con-dependientes";
import errorInfra381 from "./contract/muestras/error-infra-381.json";
import errorProblemasA from "./contract/muestras/error-problemas-a.json";
import errorProblemasB from "./contract/muestras/error-problemas-b.json";
import errorSf2371 from "./contract/muestras/error-sf-2371.json";
import errorSf2491 from "./contract/muestras/error-sf-2491.json";
import peticionSf2491 from "./contract/muestras/peticion-sf-2491.json";
import resultadoSf2491 from "./contract/muestras/resultado-sf-2491.json";

// Test fixtures: the CD-01 samples, typed. JSON imports widen literals, so
// they are cast once here instead of in every test.
export const sampleSf2491 = errorSf2491.valor as ErrorDependenciasSinResolver;
export const sampleInfra381 =
  errorInfra381.valor as ErrorDependenciasSinResolver;
export const sampleSf2371 = errorSf2371.valor as ErrorDependenciasSinResolver;
export const sampleProblemasA =
  errorProblemasA.valor as ErrorDependenciasSinResolver;
export const sampleProblemasAPreviousChain = errorProblemasA.entrada.contexto
  .cadena_anterior as NodoCadena[];
export const sampleProblemasARequest = errorProblemasA.entrada
  .resoluciones as PeticionCancelar["resoluciones"];
export const sampleProblemasB =
  errorProblemasB.valor as ErrorDependenciasSinResolver;
export const sampleProblemasBRequest = errorProblemasB.entrada
  .resoluciones as PeticionCancelar["resoluciones"];
export const sampleRequestSf2491 = peticionSf2491.valor as PeticionCancelar;
export const sampleResultSf2491 = resultadoSf2491.valor as ResultadoCancelar;
