# Kaneo — fork de Intelia

Este repositorio es el fork de [Kaneo](https://github.com/usekaneo/kaneo) que mantiene Intelia (`intelia-technologies/kaneo`). Desplegamos Kaneo desde nuestras imágenes, no desde las públicas. Diseño de referencia: [diseño 11: fork de Kaneo](https://github.com/intelia-technologies/software-factory/blob/main/docs/design/11-fork-kaneo.md) en `intelia-technologies/software-factory`.

Además de este fichero, el fork adapta la CI de upstream a runners de GitHub, añade los workflows de sincronización, imagen candidata y versiones (ver «CI y versiones»), y herramientas auxiliares en `scripts/ci/intelia-*.mjs`. El `README.md` original se conserva intacto.

**Este repositorio es público.** Aquí no va nada interno de Intelia: ni secretos, ni hostnames o IPs, ni configuración de despliegue, ni datos de clientes o de la factory. Todo eso vive en `software-factory`, que es privado. Código propietario dentro de Kaneo, solo tras hablarlo antes. Secret scanning y push protection están activados.

## Decisiones

De Jaime (29-oct-2026, no se reabren):

1. **Fork en un repo de Intelia:** `intelia-technologies/kaneo`. Desplegamos desde nuestras imágenes.
2. **Nos ponemos al día con upstream periódicamente.**
3. **Primera función nativa: reacciones en comentarios.**
4. **El montaje del fork** (copia, CI, despliegue) se lanza en paralelo con lo que no depende de él.
5. **El fork abre la puerta a traer dentro otras piezas** (por ejemplo, el organigrama). Se decide pieza a pieza.

Del Diseñador, recogidas al lanzar:

6. **«Primero arriba».** Lo genérico (reacciones, eventos de webhook que faltan, arreglos) se propone también como PR a `usekaneo/kaneo`. El fork guarda pocos cambios: los pendientes de aceptar y los que solo tienen sentido para Intelia.
7. **Base de datos: nuestras tablas en un esquema propio, nunca en el diario de migraciones de upstream** (ver «Base de datos»).
8. **Puesta al día:** comprobación semanal automática y adopción mensual, o antes si sale un arreglo de seguridad.

## Licencia

Kaneo se distribuye bajo licencia MIT. Se conservan [`LICENSE`](LICENSE) y el aviso de copyright de upstream (`Copyright (c) 2024 Andrej Acevski`). No se modifican ni se eliminan.

## Repo, ramas y versiones

- **`main`** = la última versión de upstream adoptada (un tag `vX.Y.Z`) más nuestros commits. El fork arranca en `v2.48.0`.
- **Upstream se incorpora con merge del tag, nunca con rebase.** La historia queda entera y el conjunto de cambios propios se ve siempre con:

  ```sh
  git diff vX.Y.Z main
  ```

- **Versiones:** `vX.Y.Z-intelia.N` (por ejemplo `v2.48.0-intelia.1`), sobre la versión de upstream que llevan dentro.
- **Imagen:** la «todo en uno» de upstream (`Dockerfile.kaneo`: API en Node más Nginx con la SPA), publicada como `ghcr.io/intelia-technologies/kaneo:X.Y.Z-intelia.N`.
- **CI y versión:** ver «CI y versiones».

## Puesta al día con upstream

El proceso de puesta al día está automatizado mediante `.github/workflows/intelia-upstream-sync.yml` y `scripts/ci/intelia-upstream-sync.mjs`:

- **Automatización semanal:** se ejecuta cada lunes a las 05:00 UTC (`0 5 * * 1`) y bajo demanda (`workflow_dispatch`). Funciona exclusivamente con `GITHUB_TOKEN` (sin credenciales ni GitHub App).
- **Preparación del merge:** detecta la última release de upstream (o la referencia del input `upstream_ref`) y prepara el merge en el runner. No abre PR: la factory lee el mismo resultado, avisa y se abre la tarea de adopción.
- **Resolución automática, solo la conocida:** si `.github/workflows/ci.yml` choca, se resuelve solo cuando el `ci.yml` del fork es exactamente la adaptación de runners (`forkCi()`) del `ci.yml` de upstream de la versión anterior. Entonces la única resolución correcta es el `ci.yml` nuevo de upstream con la misma adaptación. Si el fork lleva cualquier otro cambio en `ci.yml`, o la adaptación no cubre el fichero nuevo, el choque cuenta como conflicto y se resuelve a mano.
- **Estados de sincronización:**
  - `uptodate`: la última versión de upstream ya es ancestro de `main`. No requiere acción.
  - `open`: ya existe la rama `intelia/upstream-<ref>` en el fork (con o sin pull request). No se sobreescribe el trabajo humano; para regenerarla, cerrar la PR, borrar la rama y relanzar.
  - `conflicts`: hay conflictos que no son el conocido de `ci.yml`. El merge se aborta, se borra la rama local y se vuelve a la rama de partida; el resumen de la ejecución los lista (con anotaciones por fichero) y el workflow falla. Se resuelven a mano (ver runbook).
  - `ready`: el merge es limpio o su único conflicto era el conocido de `ci.yml`. El resumen de la ejecución detalla el número de ficheros modificados, la lista completa dentro de `<details>`, si hay cambios en Drizzle, los ficheros autoresueltos y los workflows nuevos de upstream.
- **Avisos de workflows:** en todos los estados, el resumen (y `--report`) lista los workflows activos fuera de la lista blanca (ver «CI y versiones») y los ficheros de workflow con `pull_request_target` con su estado en Actions (`active`, `disabled_*` o `unregistered`: aún sin registrar, se ejecutaría con su primer evento). Hay anotación de aviso por cada activo fuera de la lista y por cada `pull_request_target` que no esté desactivado.
- **Ramas e imágenes:**
  - Rama de sincronización: `intelia/upstream-<ref>` (ejemplo: `intelia/upstream-v2.49.0`).
  - Si el merge **no modifica `.github/workflows/**`** respecto a `main`, el workflow semanal empuja la rama `intelia/upstream-<ref>` al fork con el `GITHUB_TOKEN` y compila y publica `ghcr.io/intelia-technologies/kaneo:candidate-<sha12>`, donde `<sha12>` son los 12 primeros caracteres del commit de merge.
  - Si el merge modifica workflows de upstream, el `GITHUB_TOKEN` no puede empujar a `.github/workflows/**` (requiere el scope `workflow`): el workflow no empuja la rama y la preparación queda registrada en el resumen para que un coder haga la adopción a mano.
- **Ensayo:** `gh workflow run intelia-upstream-sync.yml -f upstream_ref=main` ensaya el merge de la rama principal de upstream sin esperar a un tag.

## Runbook de adopción

La adopción de una nueva versión de upstream la realiza un coder de forma **manual** (con su propia credencial de `gh` que tenga el scope `workflow`), a partir del aviso de la factory: con periodicidad **mensual**, o **inmediata fuera de ciclo** si upstream publica arreglos de seguridad (identificables en las notas de la release o en los avisos GHSA del repositorio upstream).

Pasos de adopción:

1. **Obtener o preparar la rama:**
   - Si el job semanal ya empujó la rama `intelia/upstream-<ref>`, usarla directamente:
     ```sh
     git fetch origin
     git checkout intelia/upstream-<ref>
     ```
   - Si no hay rama empujada, prepararla en local desde `main` actualizado:
     ```sh
     node scripts/ci/intelia-upstream-sync.mjs prepare vX.Y.Z
     ```
     Con estado `ready` deja la rama `intelia/upstream-vX.Y.Z` con el merge hecho. Con `conflicts` lista los ficheros, aborta el merge, borra la rama local y te devuelve a la rama de partida, así que el procedimiento manual empieza limpio:
   - Resolución manual de conflictos (siempre merge, nunca rebase):
     ```sh
     git fetch origin
     git fetch --no-tags https://github.com/usekaneo/kaneo.git tag vX.Y.Z
     git checkout -b intelia/upstream-vX.Y.Z origin/main
     git merge --no-ff vX.Y.Z
     # resolver cada conflicto, git add, git commit
     ```
     En `ci.yml`, tomar el de upstream y reaplicar la adaptación (`git checkout --theirs .github/workflows/ci.yml && node scripts/ci/intelia-fork-ci.mjs .github/workflows/ci.yml`) solo si el fork no lleva en él más cambios que los de la tabla de «CI y versiones» (`git diff <tag anterior> origin/main -- .github/workflows/ci.yml`); si los lleva, resolver hunk a hunk para no perderlos.
2. **Empujar la rama y abrir PR:**
   ```sh
   git push origin intelia/upstream-vX.Y.Z
   gh pr create --base main --head intelia/upstream-vX.Y.Z --title "chore: merge upstream vX.Y.Z"
   ```
3. **Comprobaciones antes de mergear:**
   - **CI del fork en verde:** comprobar que todos los checks (`quality`, `unit`, `integration`, `smoke`, `docker-build`, `workflows`) pasan en la PR. En cada push a la PR, `.github/workflows/intelia-candidate.yml` compila `Dockerfile.kaneo` y publica `ghcr.io/intelia-technologies/kaneo:candidate-<sha12>`.
   - **Tests live de la factory en verde:** verificar que la suite de tests de la factory (`Kaneo candidate`) pasa contra la imagen candidata `candidate-<sha12>` (ejecutados en el repositorio privado de la factory).
   - **Revisión de cambios propios:** inspeccionar `git diff vX.Y.Z HEAD` para confirmar que las adaptaciones y personalizaciones de Intelia siguen intactas.
   - **Drizzle:** verificar que no existan migraciones propias en `apps/api/drizzle/` ni conflictos de secuencia en `meta/_journal.json`.
   - **Workflows nuevos de upstream:** revisar los workflows nuevos listados en el resumen del merge; el job semanal los desactiva de todos modos si llegan a registrarse activos.
4. **Merge de la PR:** Forja mergea la PR hacia `main` usando siempre **merge commit** (nunca squash ni rebase).
5. **Etiquetar release en main:** tras el merge, traer `main` y comprobar que ya contiene la versión de upstream antes de etiquetar (si no, el tag iría a un commit anterior al merge y `intelia-release.yml` lo rechazaría):
   ```sh
   git fetch origin main
   if git merge-base --is-ancestor vX.Y.Z origin/main; then
     git tag -a vX.Y.Z-intelia.1 -m vX.Y.Z-intelia.1 origin/main && git push origin vX.Y.Z-intelia.1
   else
     echo "origin/main no incluye vX.Y.Z: no se etiqueta" >&2
   fi
   ```
6. **Despliegue:** el despliegue efectivo a los entornos se gestiona desde `software-factory`.

Si con el tiempo este proceso manual resulta pesado, se valorará pasar a una GitHub App.

## CI y versiones

- **CI:** el `.github/workflows/ci.yml` de upstream entero (`quality`, `unit`, `integration`, `smoke` y el resto de sus jobs), en push a `main` y en cada PR. Upstream corre en runners de Blacksmith, que el fork no tiene; la única diferencia es esta sustitución:

  | Upstream | Fork |
  |---|---|
  | `runs-on: blacksmith-4vcpu-ubuntu-2404` | `runs-on: ubuntu-24.04` |
  | `useblacksmith/checkout` | `actions/checkout` |
  | `useblacksmith/setup-docker-builder` | `docker/setup-buildx-action` |
  | `useblacksmith/build-push-action` | `docker/build-push-action` |

- **Prueba de actualización** (`scripts/ci/upgrade.sh`, job `docker-build`): parte de la imagen de upstream de la versión de `package.json` (`ghcr.io/usekaneo/kaneo:X.Y.Z`, la que lleva dentro el fork) en vez de la última release del repo, con `KANEO_UPGRADE_REPOSITORY` y `KANEO_UPGRADE_TAG`.
- **Lista blanca de workflows:** en el fork solo corren `ci.yml`, los `intelia-*.yml` y el CodeQL por defecto de GitHub. Todo lo demás (los workflows de upstream de hoy y los que traiga cualquier merge futuro) se desactiva en Actions, sin borrarlo, para que el merge de upstream no choque. Es lista blanca y no lista negra porque upstream añade workflows sin avisar, y varios suyos usan `pull_request_target` con permisos de escritura y acciones de terceros, que en un fork público correrían con nuestro token sobre PR ajenas. GitHub solo registra un workflow (y deja desactivarlo) cuando le llega su primer evento, así que el job `disable-workflows` de `intelia-upstream-sync.yml` lo aplica cada lunes (`node scripts/ci/intelia-upstream-sync.mjs disable-workflows`, con el `GITHUB_TOKEN` y `actions: write`): desactiva todo workflow activo fuera de la lista, lista los ficheros con `pull_request_target` y falla si después queda alguno activo fuera de ella.
- **Versión** (`.github/workflows/intelia-release.yml`): al empujar un tag `vX.Y.Z-intelia.N` comprueba que el commit está en `main` con la CI en verde y que `X.Y.Z` es la versión de `package.json`; construye `Dockerfile.kaneo` (amd64 y arm64) y publica `ghcr.io/intelia-technologies/kaneo:X.Y.Z-intelia.N` con el `GITHUB_TOKEN` del propio fork. El digest queda en el resumen de la ejecución. El fork no guarda credenciales de Intelia. El despliegue se gestiona desde `software-factory`.

```sh
git tag -a v2.48.0-intelia.1 -m v2.48.0-intelia.1 origin/main
git push origin v2.48.0-intelia.1
```

## Base de datos

Upstream aplica sus migraciones de Drizzle al arrancar la API, numeradas en `apps/api/drizzle/` con su diario `meta/_journal.json`. Drizzle solo aplica las entradas cuyo `when` es posterior a la última registrada en la base de datos: si metemos migraciones propias en ese diario, al incorporar las de upstream o chocan los números o **Drizzle salta las de upstream sin ejecutarlas**.

Reglas:

- Nuestras tablas viven en un **esquema de PostgreSQL propio, `intelia`**, con **su propio diario y su propio migrador**, que corre al arrancar la API después del de upstream.
- **Nunca se añaden migraciones a `apps/api/drizzle/` ni a su `meta/_journal.json`.**
- **Nunca alteramos tablas de upstream.** Las nuestras pueden referenciarlas (por ejemplo, con `ON DELETE CASCADE` hacia el id de un comentario).
- Si upstream acepta una función nuestra, se migra de nuestras tablas a las suyas con una migración propia que mueve los datos.
