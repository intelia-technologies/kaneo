# Kaneo — fork de Intelia

Este repositorio es el fork de [Kaneo](https://github.com/usekaneo/kaneo) que mantiene Intelia (`intelia-technologies/kaneo`). Desplegamos Kaneo desde nuestras imágenes, no desde las públicas. Diseño de referencia: [diseño 11: fork de Kaneo](https://github.com/intelia-technologies/software-factory/blob/main/docs/design/11-fork-kaneo.md) en `intelia-technologies/software-factory`.

Además de este fichero, el fork añade sus funciones propias (ver «Reacciones en comentarios y tarjetas», «Relaciones por proyecto», «Foto de perfil con API key», «Rutinas programadas», «Nivel de automatización de las tareas» y «Mover una tarea de proyecto con alias»), sus workflows `intelia-*.yml` y sus scripts `scripts/ci/intelia-*` (ver «CI y versiones» y «Puesta al día con upstream»). El `README.md` original y el `ci.yml` de upstream se conservan intactos.

**Este repositorio es público.** Aquí no va nada interno de Intelia: ni secretos, ni hostnames o IPs, ni configuración de despliegue, ni datos de clientes o de la factory. Todo eso vive en `software-factory`, que es privado. Código propietario dentro de Kaneo, solo tras hablarlo antes. Secret scanning y push protection están activados.

## Decisiones

De Jaime (29-oct-2026, no se reabren):

1. **Fork en un repo de Intelia:** `intelia-technologies/kaneo`. Desplegamos desde nuestras imágenes.
2. **Nos ponemos al día con upstream periódicamente.**
3. **Primera función nativa: reacciones en comentarios.**
4. **El montaje del fork** (copia, CI, despliegue) se lanza en paralelo con lo que no depende de él.
5. **El fork abre la puerta a traer dentro otras piezas** (por ejemplo, el organigrama). Se decide pieza a pieza.

Del Diseñador, recogidas al lanzar:

6. **Sin contribuciones a upstream** (decisión de Jaime, 30-oct). No preparamos ni abrimos PR en `usekaneo/kaneo`: nuestras funciones viven solo en este fork. Para que las puestas al día sigan siendo baratas, los cambios son **aditivos**: tablas en el esquema `intelia`, código en ficheros nuestros (`apps/*/src/intelia/`) y el mínimo de líneas en ficheros de upstream.
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
- **Ficheros de upstream que toca el fork:** pocos, cada uno con menos de 20 líneas cambiadas. Son ganchos para lo nuestro:
  - `apps/api/src/index.ts`: migrador `intelia` al arrancar, montaje de `/api/intelia` (un solo router, `apps/api/src/intelia/index.ts`, que reúne los nuestros) y `AppType`.
  - `apps/api/src/task/index.ts`, `task/schema.ts` y `task/controllers/create-task.ts`: los campos obligatorios `automation` e `initiative` al crear una tarea (y los middlewares de la excepción de tests), que se guardan en la transacción de la tarea. `task/controllers/duplicate-task.ts` e `import-tasks.ts`: el nivel y la iniciativa de la copia, de la ocurrencia recurrente y de las importadas, en la transacción de cada tarea. `task/controllers/move-task.ts`: la tarea que cambia de proyecto pierde su iniciativa.
  - `apps/web/src/fetchers/task/create-task.ts`, `duplicate-task.ts` e `import-tasks.ts`, y `hooks/mutations/task/use-create-task.ts`, `use-duplicate-task.ts` y `use-import-tasks.ts`: mandan `automation` y refrescan los niveles del proyecto; `create-task.ts` e `import-tasks.ts` dejan la iniciativa a la API hasta IN-05. `lib/onboarding/create-starter-project.ts`: el nivel de las tareas del proyecto de ejemplo.
  - `apps/web/src/components/shared/modals/create-task-modal.tsx` y `components/task/task-subtasks.tsx`: los campos de nivel y verificación al crear una tarea o una subtarea. `components/kanban-board/task-card/task-card-content.tsx`: el distintivo del nivel en la tarjeta. `components/kanban-board/task-card-context-menu/task-card-context-menu-content.tsx` y `routes/_layout/_authenticated.tsx`: duplicar pidiendo el nivel si el origen no lo tiene. `components/project/tasks-import-export/import-tasks-dialog.tsx`: el nivel de la importación JSON. `components/project/code-hosting/import-issues-section.tsx` e `import/import-project-picker.tsx`: importaciones deshabilitadas.
  - `apps/web/src/hooks/use-task-filters.ts`, `hooks/use-task-filters-with-labels-support.ts`, `lib/task-filters/task-matches-filters.ts`, `lib/task-filters/count-active-filters.ts`, `components/project/task-filters/use-filter-subjects.tsx` y `components/project/toolbar/use-project-task-view.ts`: el filtro «Automation» de la barra de filtros.
  - `apps/api/src/scheduler/index.ts`: el job de las rutinas programadas. `apps/api/src/plugins/generic-webhook/events.ts`: `export` de `sendEvent`, para mandar `intelia.routine_skipped` con el sobre y la firma de upstream.
  - `Dockerfile.kaneo` y `apps/api/Dockerfile`: `COPY` de `drizzle-intelia`. `vite.config.ts`: ignora `drizzle-intelia/meta/**`.
  - `apps/web/src/components/activity/comment-card.tsx` e `index.tsx`, y `apps/web/src/components/task/task-details-content.tsx`: las fichas de reacciones, el panel «Programación» de las rutinas y el bloque «Automation» del nivel.
  - `apps/web/src/components/nav-main.tsx`: el enlace a la pantalla «Rutinas».
  - `apps/web/src/components/project/views/project-views.ts`, `project-scope-toggle.tsx`, `store/user-preferences.ts` y `hooks/use-project-websocket.ts`: el registro, los enlaces de la barra del proyecto y el tiempo real de las vistas «Dependencias» e «Iniciativas».
  - `apps/web/src/components/list-view/task-row-body.tsx`, `components/kanban-board/task-card/task-card-content.tsx`, `components/project/display/card-field-toggles.tsx` y `store/user-preferences.ts`: el chip de tiempo en estado en la fila y la tarjeta, y su preferencia `showStatusAge` en «Display».
  - `apps/web/src/hooks/mutations/custom-field/use-set-custom-field-value.ts`: al guardar un campo personalizado (por ejemplo `motivo_bloqueo`) relee las iniciativas en pantalla.
  - `apps/api/src/search/controllers/global-search.ts` y `apps/api/src/task/controllers/get-task-by-ticket-id.ts`: el número antiguo de una tarea movida (`task_alias`) la encuentra en la búsqueda por clave y en la consulta por ticket. `apps/web/src/components/task/task-details-content.tsx`: «antes SF-745» en el detalle. `apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId_.tsx`: redirige el enlace antiguo al proyecto nuevo de la tarea.
  - `tests/api-integration/helpers/database.ts`: migrador `intelia` en los tests de integración. `tests/api-integration/setup.ts` y `scripts/ci/compose.yml`: `INTELIA_TASK_AUTOMATION_OPTIONAL=true` e `INTELIA_TASK_INITIATIVE_OPTIONAL=true`, para que los tests y las pruebas de humo de upstream creen tareas sin conocer el nivel ni la iniciativa. `tests/api-integration/setup.ts`, además, no lee el `.env` de desarrollo ni cae a `localhost:5432`: exige el servidor marcado de «Tests de integración».
  - `scripts/ci/upgrade.sh`: versión de partida configurable para la prueba de actualización. `scripts/ci/upgrade.mjs`: comprueba el relleno del nivel tras actualizar. `scripts/ci/browser.mjs`: elige `arranque` sin verificación en el formulario de creación y comprueba que se guarda. `scripts/ci/http.mjs`: la tarea de la semilla de `realtime.mjs` y `upgrade.mjs` lleva nivel.
  - Generados o de datos: `apps/docs/openapi.json` (regenerado) y las claves `activity.reactions.*`, `tasks.statusAge.*` y `tasks.display.statusAge` en `i18n/*.json` (en es-ES y en-US traducidas; en los demás idiomas, el inglés que pone `pnpm i18n:check:fix`).

## Puesta al día con upstream

El proceso de puesta al día está automatizado mediante `.github/workflows/intelia-upstream-sync.yml` y `scripts/ci/intelia-upstream-sync.mjs`:

- **Automatización semanal:** se ejecuta cada lunes a las 05:00 UTC (`0 5 * * 1`) y bajo demanda (`workflow_dispatch`). Funciona exclusivamente con `GITHUB_TOKEN` (sin credenciales ni GitHub App).
- **Preparación del merge:** detecta la última release de upstream (o la referencia del input `upstream_ref`) y prepara el merge en el runner. No abre PR: la factory lee el mismo resultado, avisa y se abre la tarea de adopción. No resuelve ningún conflicto por su cuenta: como el fork toca pocas líneas de upstream (ver «Ficheros de upstream que toca el fork»; `ci.yml` no, que está desactivado), el merge de un tag de upstream normalmente es limpio.
- **Estados de sincronización:**
  - `uptodate`: la última versión de upstream ya es ancestro de `main`. No requiere acción.
  - `open`: ya existe la rama `intelia/upstream-<ref>` en el fork (con o sin pull request). No se sobreescribe el trabajo humano; para regenerarla, cerrar la PR, borrar la rama y relanzar.
  - `conflicts`: el merge choca. Se aborta, se borra la rama local y se vuelve a la rama de partida; el resumen de la ejecución lista los ficheros (con anotaciones por fichero) y el workflow falla. Se resuelven a mano (ver runbook).
  - `ready`: el merge es limpio. El resumen de la ejecución detalla el número de ficheros modificados, la lista completa dentro de `<details>`, si hay cambios en Drizzle y los workflows nuevos de upstream.
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
     Si choca un fichero de upstream que el fork no debe tocar (`.github/workflows/ci.yml` y el resto de workflows de upstream, que están desactivados), se toma el de upstream sin más: `git checkout --theirs -- <fichero>`.
2. **Empujar la rama y abrir PR:**
   ```sh
   git push origin intelia/upstream-vX.Y.Z
   gh pr create --base main --head intelia/upstream-vX.Y.Z --title "chore: merge upstream vX.Y.Z"
   ```
3. **Comprobaciones antes de mergear:**
   - **CI del fork en verde:** `Intelia CI` (`intelia-ci.yml`) pasa en la PR. En cada push a la PR, `.github/workflows/intelia-candidate.yml` compila `Dockerfile.kaneo` y publica `ghcr.io/intelia-technologies/kaneo:candidate-<sha12>`.
   - **Tests live de la factory en verde:** verificar que la suite de tests de la factory (`Kaneo candidate`) pasa contra la imagen candidata `candidate-<sha12>` (ejecutados en el repositorio privado de la factory).
   - **Revisión de cambios propios:** inspeccionar `git diff vX.Y.Z HEAD` para confirmar que solo quedan ficheros nuestros (`README-INTELIA.md`, los `intelia-*` y los de `intelia/`) y los ganchos listados en «Ficheros de upstream que toca el fork», sin cambios de upstream perdidos en el merge.
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

**Lista blanca de Actions:** en el fork solo están activos los `intelia-*.yml` y CodeQL (`dynamic/github-code-scanning/codeql`). Todo lo demás de upstream, `ci.yml` incluido, está desactivado en Actions con `gh workflow disable`, no borrado, para que el merge de upstream no choque. Es lista blanca y no lista negra porque upstream añade workflows sin avisar, y varios suyos usan `pull_request_target` con permisos de escritura y acciones de terceros, que en un fork público correrían con nuestro token sobre PR ajenas. GitHub solo registra un workflow (y deja desactivarlo) cuando le llega su primer evento, así que el job `disable-workflows` de `intelia-upstream-sync.yml` aplica la lista cada lunes (`node scripts/ci/intelia-upstream-sync.mjs disable-workflows`, con el `GITHUB_TOKEN` y `actions: write`): desactiva todo workflow activo fuera de ella, lista los ficheros con `pull_request_target` y falla si después queda alguno activo fuera. Comprobación:

```sh
gh workflow list -R intelia-technologies/kaneo --all --json path,state \
  -q '.[] | select(.state == "active") | .path'
```

| Workflow | Cuándo | Qué |
|---|---|---|
| `intelia-ci.yml` | cada PR, push a `main`, a mano, y lo llama la versión | `quality` (lint, i18n, OpenAPI, typecheck), `unit`, `build`, `docker-build` (la imagen `Dockerfile.kaneo` con navegador, tiempo real con y sin Redis y la prueba de actualización), `workflows` (actionlint en todos y zizmor en los `intelia-*.yml`) y `secret-scan` (solo el cambio). |
| `intelia-integration.yml` | lo llama la versión, a mano, y en las PR que tocan los tests de integración, su configuración, su script o el propio workflow | `scripts/ci/intelia-test-integration.sh` (ver «Tests de integración»). En runners de GitHub tarda ~12 min, demasiado para cada PR. |
| `intelia-secret-scan.yml` | lunes 04:17 UTC y a mano | TruffleHog sobre todo el historial de `main`. |
| `intelia-release.yml` | tag `vX.Y.Z-intelia.N` | ver «Versión». |
| `intelia-upstream-sync.yml` | lunes 05:00 UTC y a mano | `disable-workflows` (lista blanca) y preparación del merge de upstream (ver «Puesta al día con upstream»). |
| `intelia-candidate.yml` | PR desde `intelia/upstream-*` y lo llama la puesta al día | imagen candidata `candidate-<sha12>` para los tests de la factory. |
| CodeQL (setup por defecto) | cada PR y push a `main`, y semanal | solo `javascript-typescript` (Settings → Code security → CodeQL analysis). |

- **Escaneo de secretos** (`scripts/ci/intelia-secret-scan.sh`, TruffleHog 3.97.9 con `--no-update`): en las PR, desde la base de la PR; en push a `main`, desde el commit anterior (si ya no existe, por un force-push, todo el historial: nunca un rango vacío); a mano o en la versión, desde el merge-base con `main`. Falla solo con hallazgos verificados o sin verificar por error que no estén en `scripts/ci/intelia-secret-baseline.tsv`, y los lista en el resumen y como anotaciones, sin el valor. La línea base tiene detector, commit, fichero y línea de los 49 candidatos del historial de upstream en `v2.48.0`: todos los marca el detector de GitLab sobre identificadores de código o el de URI sobre URL de ejemplo en tests. Cuáles salen en cada ejecución depende del límite de peticiones de GitLab al verificar (HTTP 429), por eso están todos. Un falso positivo nuevo se añade a la línea base tras comprobar que no es una credencial; uno real se rota.
- **Prueba de actualización** (`scripts/ci/upgrade.sh`, job `docker-build`): parte de la imagen de upstream de la versión de `package.json` (`ghcr.io/usekaneo/kaneo:X.Y.Z`, la que lleva dentro el fork) en vez de la última release del repo, con `KANEO_UPGRADE_REPOSITORY` y `KANEO_UPGRADE_TAG`.
- **Lo que no corre de upstream** (en `ci.yml`, desactivado): Chromium smoke (e2e de Playwright, ~4 min; `docker-build` ya prueba la imagen en un navegador con `browser.mjs`), `storage` (subidas firmadas contra S3: no las cambiamos y upstream las prueba), `split-images` (imágenes `apps/api` y `apps/web` sueltas: solo publicamos `Dockerfile.kaneo`), `peekareq-tests` y `slop-labeler-tests` (bots de upstream, desactivados en el fork), `detect-pr-changes` y `ci-result` (atajos y puerta de upstream; sin protección de rama no hacen falta). `ci.yml` no se reactiva: sus runners son de Blacksmith y el fork no los tiene.
- **Versión** (`.github/workflows/intelia-release.yml`): al empujar un tag `vX.Y.Z-intelia.N` comprueba que el commit está en `main` y que `X.Y.Z` es la versión de `package.json`; corre `intelia-ci.yml` e `intelia-integration.yml` sobre ese commit y, **solo si los dos pasan**, construye `Dockerfile.kaneo` (amd64 y arm64) y publica `ghcr.io/intelia-technologies/kaneo:X.Y.Z-intelia.N` con el `GITHUB_TOKEN` del propio fork. El digest queda en el resumen de la ejecución. El fork no guarda credenciales de Intelia ni avisa a nadie: el despliegue se lanza desde `software-factory`.
- **Tests de integración** (`scripts/ci/intelia-test-integration.sh`, diseño 21 §4.9 en `software-factory`): la única forma de lanzarlos, en local y en `intelia-integration.yml`. Levanta un PostgreSQL desechable propio (contenedor con puerto aleatorio en `127.0.0.1` y etiquetas `sf.test.*`), crea en él el rol sin login `sft_<id>` como marca, lanza `pnpm test:integration` (o lo que vaya tras `--`) con solo `DATABASE_URL` y `KANEO_TEST_MARK`, y al terminar borra la base `kaneo_test` y el contenedor con su volumen. Si no puede confirmar la limpieza, avisa «limpieza no confirmada» y sale con 3. `tests/api-integration/setup.ts` no lee `.env` ni tiene valor por defecto: sin `DATABASE_URL`, sin marca o con un servidor que no tiene el rol de la marca, falla antes de migrar o vaciar nada.

```sh
git tag -a v2.48.0-intelia.1 -m v2.48.0-intelia.1 origin/main
git push origin v2.48.0-intelia.1
```

## Base de datos

Upstream aplica sus migraciones de Drizzle al arrancar la API, numeradas en `apps/api/drizzle/` con su diario `meta/_journal.json`. Drizzle solo aplica las entradas cuyo `when` es posterior a la última registrada en la base de datos: si metemos migraciones propias en ese diario, al incorporar las de upstream o chocan los números o **Drizzle salta las de upstream sin ejecutarlas**.

Reglas:

- Nuestras tablas viven en un **esquema de PostgreSQL propio, `intelia`**, con **su propio diario y su propio migrador**, que corre al arrancar la API después del de upstream.
- **Nunca se añaden migraciones a `apps/api/drizzle/` ni a su `meta/_journal.json`.**
- **Nunca alteramos tablas de upstream** (columnas, restricciones, índices). Las nuestras pueden referenciarlas (por ejemplo, con `ON DELETE CASCADE` hacia el id de un comentario). **Única excepción, un trigger** (aceptada en la revisión de IN-01): `intelia_close_plan_on_start` sobre `public.task`, que cierra el plan de una iniciativa en la misma transacción que pasa una tarea a In progress (ver «Iniciativas»). No añade columnas ni restricciones. No vive en una migración: lo reinstala cada arranque (ver «Ganchos sobre `public.task`»).

### Migrador del esquema `intelia`

| Qué | Dónde |
|---|---|
| Tablas (Drizzle) | `apps/api/src/intelia/schema.ts`, con `inteliaSchema.table(...)` |
| Migraciones y su diario | `apps/api/drizzle-intelia/` y `apps/api/drizzle-intelia/meta/_journal.json` |
| Registro de aplicadas | tabla `intelia.__intelia_migrations` (la de upstream es `drizzle.__drizzle_migrations`) |
| Migrador | `migrateInteliaSchema` en `apps/api/src/intelia/migrate.ts`, llamado en `runStartupTasks` (`apps/api/src/index.ts`) justo después del de upstream; al terminar, reinstala y comprueba los ganchos sobre `public.task` (`apps/api/src/intelia/task-hooks.ts`) |
| Configuración de drizzle-kit | `apps/api/drizzle-intelia.config.ts` |

Para generar una migración nueva, tras cambiar `apps/api/src/intelia/schema.ts`:

```sh
cd apps/api
pnpm exec drizzle-kit generate --config drizzle-intelia.config.ts --name <nombre>
```

Nunca con `pnpm db:generate` ni con `drizzle.config.ts`: esos escriben en el diario de upstream. La primera migración (`0000_intelia_schema`) es `CREATE SCHEMA IF NOT EXISTS`, porque el migrador crea el esquema antes para guardar su registro.

El test `tests/api-integration/intelia-schema-migrations.test.ts` reproduce el arranque en una base de datos aparte y simula el merge de una versión de upstream con una migración nueva: se aplican las de los dos.

### Ganchos sobre `public.task`

Dependemos de la tabla de upstream `public.task` de dos formas: el trigger `intelia_close_plan_on_start` (con su función `intelia.close_plan_on_start`) y **ocho claves ajenas** de nuestras tablas a `task(id)`: `comment_reaction`, `routine`, `task_automation`, `task_automation_change`, `initiative_change` (`ON DELETE SET NULL`), `task_initiative`, `task_initiative_change` y `task_alias` (las demás, `ON DELETE CASCADE`). Una migración de upstream que **recree** `task` (`DROP TABLE … CASCADE` y `CREATE TABLE`) se lleva el trigger y las ocho claves sin ningún error; el diario de migraciones `intelia` no lo ve, porque nuestras migraciones ya están aplicadas.

- **En cada arranque**, después de los dos migradores (`task-hooks.ts`):
  1. `installTaskHooks` reinstala la función y el trigger en una transacción (`CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` y `CREATE TRIGGER`, con un cerrojo consultivo para varias réplicas a la vez). Es re-ejecutable: dos arranques dejan lo mismo.
  2. `assertTaskHooks` mira el catálogo (`pg_trigger`, `pg_constraint`) y, si falta el trigger o alguna de las claves que declara el esquema de Drizzle, **el arranque falla antes de admitir tráfico** con un mensaje que nombra cada pieza que falta: `Intelia: public.task lacks foreign key …, foreign key …`. Las claves no se reparan solas porque dependen de los datos.

#### Si upstream recrea `public.task`

Señal: el arranque de Kaneo falla con `Intelia: public.task lacks …` (en el log, como causa de `Database migrations failed`). También se ve antes, al revisar las migraciones de upstream en la adopción: una que haga `DROP TABLE "task"` o la recree.

1. **Antes de adoptar la versión**, copia de seguridad del esquema y de la tabla: `pg_dump -n intelia -t public.task …`. Si las migraciones de upstream **cambian los ids de las tareas**, no se sigue: nuestras filas apuntan a los ids viejos y no hay forma de reasignarlas sin una migración propia. Se para la adopción y se abre tarea.
2. **Comprobar** (solo lectura): `apps/api/drizzle-intelia/repair/task-references-check.sql`. Por cada columna que apunta a `task`: filas, filas huérfanas (su tarea ya no existe) y si la clave está. Con los ids conservados, las huérfanas son solo tareas que upstream haya borrado al recrear; si salen muchas, volver al paso 1.
3. **Reparar**: `apps/api/drizzle-intelia/repair/task-references-repair.sql`, en una transacción. Para cada clave que falta, aplica a las huérfanas lo que habría hecho su clave (`CASCADE`: se borran; `SET NULL`: se vacía la columna) y vuelve a crear la clave como la crearon las migraciones; avisa por `NOTICE` de cuántas filas tocó. Las claves que ya están no se tocan: ejecutarlo dos veces no cambia nada la segunda.

   ```sh
   # En el servidor, contra la base de Kaneo (los ficheros van en la imagen, en apps/api/drizzle-intelia/repair/)
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f task-references-check.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f task-references-repair.sql
   ```

4. **Arrancar Kaneo**: el arranque reinstala el trigger (el paso 3 no lo toca) y la comprobación pasa. Si sigue fallando, el mensaje nombra lo que falta.

Probado en `tests/api-integration/intelia-task-hooks.test.ts`, en una base aparte con datos: dos arranques dejan el mismo catálogo y los mismos datos; tras recrear `task` como lo haría upstream (con sus datos y los mismos ids) y perder una tarea, el arranque reinstala el trigger y falla nombrando las ocho claves; la comprobación muestra la huérfana; la reparación borra sus filas, vacía la columna del diario, restaura las claves (que vuelven a rechazar una tarea inexistente) y el siguiente arranque pasa; repetir la reparación no cambia nada y el trigger vuelve a cerrar el plan. Si se añade una clave a `task` en el esquema, hay que añadirla a los dos ficheros de `repair/` (si falta en el de reparación, ese test falla).

## Reacciones en comentarios y tarjetas

Reacciones con emoji en los comentarios y en la propia tarea (la tarjeta), con actores externos: una cuenta con `workspace:manage_settings` puede reaccionar con un nombre propio (`externalUserName`), el mismo criterio que `externalUserName` en `POST /api/comment`. Así varios agentes que comparten una cuenta de rol reaccionan cada uno con su nombre.

- **Tabla** `intelia.comment_reaction`: `task_id` (siempre), `comment_id` (`NULL` = reacción en la tarjeta; apunta a `public.activity`), `emoji`, `user_id` (la cuenta que llama) y `external_user_name`. Claves ajenas con `ON DELETE CASCADE`. Una reacción por destino, emoji y actor (índice único).
- **API** (OpenAPI, etiqueta `Reactions`), con los permisos de comentar en la tarea (`task:update`; leer, `task:read`):
  - `GET|POST|DELETE /api/intelia/comment/{id}/reactions`
  - `GET|POST|DELETE /api/intelia/task/{id}/reactions`: `POST` y `DELETE` actúan sobre la tarjeta; `GET` devuelve todas las de la tarea, las de la tarjeta y las de sus comentarios.
  - `POST` recibe `{ emoji, externalUserName? }` y es idempotente; `DELETE` recibe lo mismo por query y solo quita reacciones propias (404 si no hay).
- **Límite aceptado, cuentas compartidas:** el actor de una reacción es la cuenta más el nombre externo, así que con una cuenta de rol compartida un agente puede quitar la reacción de otro agente de la misma cuenta indicando su nombre. Es el mismo límite que la firma de comentarios con `externalUserName`: el riesgo queda dentro de la propia cuenta, que ya puede firmar con cualquier nombre.
- **Web:** fichas de emoji con contador y, al pasar el ratón, los nombres; debajo de cada comentario y bajo el título de la tarea (`apps/web/src/components/intelia/`).
- **Test:** `tests/api-integration/intelia-reactions.test.ts`.

## Relaciones por proyecto

`GET /api/intelia/project/{projectId}/relations` (OpenAPI, etiqueta `Task Relations`; código en `apps/api/src/intelia/relations/`) devuelve de una vez las relaciones entre tareas con algún extremo en el proyecto, para dibujar sus dependencias. Upstream solo las da tarea a tarea (`GET /api/task-relation/{taskId}`).

- **Respuesta:** `relations` (`id`, `sourceTaskId`, `targetTaskId`, `relationType`) y `externalTasks`, los extremos de otros proyectos con `number`, `title`, `status`, `isCompleted`, `projectId`, `projectSlug` y `projectName`.
- **Permisos:** los de listar las tareas del proyecto (`project:read` y `task:read`). Se omiten, como en upstream, las relaciones con tareas de proyectos que quien llama no ve.
- **Solo lee** tablas de upstream: sin tablas ni migraciones propias.
- **Test:** `tests/api-integration/intelia-relations.test.ts`.

## Tiempo en el estado actual

`GET /api/intelia/project/{projectId}/status-age` (OpenAPI, etiqueta `Tasks`; código en `apps/api/src/intelia/status-age/`) da cuánto lleva cada tarea en su columna y lo habitual en cada columna del proyecto ([diseño 23](https://github.com/intelia-technologies/software-factory/blob/main/docs/design/23-tiempo-en-estado.md) §3, §4 y §6).

- **`tareas`:** las tareas del proyecto fuera de `done` y `cancelled` (o `canceled`), por id, con su fecha de entrada: su última actividad `status_changed` o, si no hay ninguna, su creación. Reordenar dentro de la columna no deja actividad y no la cambia. Una sola consulta por petición. La fecha la calcula `statusSince` (`apps/api/src/intelia/status-since.ts`), la misma que usa la vista de iniciativas.
- **`columnas`:** por slug, cada columna con alguna **estancia terminada** que salió en los últimos 90 días: `casos`, `p75_s` y `p90_s` (segundos, `percentile_cont` en PostgreSQL). Una estancia va de un cambio de estado de la tarea (o de su creación, la primera) al siguiente, en la columna que este deja (`oldStatus`); las abiertas no cuentan. Con menos de 10 casos, `p75_s` y `p90_s` son `null`. Se atribuyen al proyecto actual de la tarea.
- **Caché:** `columnas` se guarda en memoria por proyecto e instancia durante 10 minutos; `calculado_en` dice cuándo se calculó. `tareas` no se guarda.
- **Permisos:** los de listar las tareas del proyecto (`project:read` y `task:read`), con sesión o con API key; sin acceso, la misma respuesta que `GET /api/task/tasks/{projectId}`.
- **Solo lee** tablas de upstream: sin tablas ni migraciones propias.
- **Web** (`apps/web/src/intelia/status-age/`, diseño 23 §5): chip en cada fila de la lista (junto a la fecha límite) y en cada tarjeta del tablero (tras la prioridad y la fecha) con el tiempo redondeado hacia abajo: minutos por debajo de 1 h, horas por debajo de 48 h y días desde ahí («45 min», «5 h», «3 d»). Sin chip si la tarea no está en `tareas` (Done, Cancelled) o si su fila o tarjeta ya la da por terminada (columna final).
  - **Color:** ámbar por encima del `p75_s` de su columna, rojo por encima del `p90_s`; sin percentiles, sin color. En ámbar y rojo cambia también el icono y el `aria-label` lo dice («Por encima de lo habitual en esta columna» / «Muy por encima…»).
  - **Explicación** (`title`): fecha de entrada en la zona horaria del navegador y el p75 de la columna con sus casos, o «Sin base para comparar» con los casos que hay.
  - **Tiempo:** un único intervalo de un minuto para todos los chips (`use-minute-clock.ts`) recalcula desde la fecha de entrada sin pedir nada. Los datos (una petición por proyecto) se piden de nuevo cada vez que cambia la consulta `["tasks", projectId]` del tablero, venga de un refresco, del tiempo real o de un movimiento optimista: lo hace un único oyente de la caché de React Query (`api.ts`), sin tocar los sitios de upstream que refrescan las tareas.
  - **Preferencia** `showStatusAge` (activa por defecto) en «Display» → «Time in status», como el resto de chips; con ella apagada no se pide nada.
  - **Tests:** `status-age-chip.test.tsx`, `status-age-placement.test.tsx` y `api.test.tsx`.
- **Test:** `tests/api-integration/intelia-status-age.test.ts`.

## Mover una tarea de proyecto con alias

`POST /api/intelia/task/{taskId}/move` (OpenAPI, etiqueta `Tasks`; código en `apps/api/src/intelia/task-move/`) mueve una tarea a otro proyecto del mismo espacio de trabajo conservando su identidad ([anexo del diseño 11: mover tareas](https://github.com/intelia-technologies/software-factory/blob/main/docs/design/11-anexo-mover-tareas.md) §1 a §3). El `PUT /api/task/move/{id}` de upstream, que sigue igual, cae a la primera columna si falta la de la tarea y le quita la iniciativa; este no cae a nada: o se remapea todo o no cambia nada.

- **Cuerpo:** `{ projectId, dryRun?, discardFields?, actor? }`. Permisos: `task:update` en el espacio de trabajo y acceso a los dos proyectos, con sesión o con API key; `actor`, solo con API key (informativo, como en las iniciativas).
- **Autorización bajo cerrojo:** el middleware autoriza la tarea tal como está antes de bloquearla. Con la tarea y los dos proyectos ya bloqueados (en orden de id; el origen `FOR SHARE`, para que un traslado del proyecto a otro espacio espere, y el destino `FOR UPDATE`, el que toma `claimTaskNumber`), se vuelve a comprobar todo en la misma transacción:
  - si el proyecto origen ya no está en el espacio de trabajo autorizado, 409 `TASK_MOVED_CONCURRENTLY`;
  - si quien llama ya no ve el origen o el destino, 403.
  En los dos casos no cambia nada.
- **Se conservan** (cuelgan del id): título, descripción, asignado, prioridad, fechas, comentarios, reacciones, actividad, adjuntos, relaciones (también con otros proyectos), `recurrence`, la rutina y el nivel de automatización.
- **Cambia el número** al siguiente del destino (`claimTaskNumber`); el antiguo queda en `intelia.task_alias` (migración `0005_task_alias`: tarea, proyecto que deja, número, quién y cuándo; único por proyecto y número, que upstream nunca reutiliza).
- **Remapeo**, en la transacción de la tarea (con su cerrojo):
  - **Columna** por slug. Si el destino no la tiene, falla. Una tarea archivada o planificada (`archived`, `planned`: los estados sin columna de upstream) no busca columna: sigue archivada o planificada en el destino, sin columna (`column.toColumnId: null`); así se puede vaciar un proyecto (diseño 36, PJ-02).
  - **Campos personalizados** por nombre (sin mayúsculas ni espacios de más), mismo tipo y, en `dropdown` y `multiselect`, con las opciones del valor. Los valores de la tarea, sus definiciones y las del destino quedan bloqueados (`FOR SHARE`) hasta confirmar, así que una edición del valor, del tipo o de las opciones espera. Si falta alguno, falla, salvo que su nombre vaya en `discardFields`: entonces se borra su valor.
  - **Etiquetas:** son del espacio de trabajo, que la tarea no deja, así que se quedan como están.
  - **Iniciativa:** la del destino con el mismo nombre (la regla de unicidad de las iniciativas); si no hay, se crea con el mismo diseño y aprobación, con su entrada `created` en el diario, y la pertenencia nueva queda en `task_initiative_change`.
  - **Asignado:** se conserva. Si no tiene acceso al destino, falla (a diferencia de upstream, que lo desasigna).
  - Como en upstream: se borran los enlaces de integraciones del origen y los adjuntos pasan al destino; tras confirmar se publica `task.moved`.
- **Fallo:** 409 `TASK_MOVE_UNMAPPABLE` con todos los problemas en `issues` (`column`, `customFields.<nombre>`, `assignee`), sin cambios.
- **`dryRun`:** hace el movimiento entero en la transacción y la deshace; devuelve lo mismo que el real (número nuevo, columna, campos, etiquetas, iniciativa) sin escribir nada ni publicar eventos.
- **Alias:**
  - `GET /api/intelia/task/{taskId}/aliases` (`task:read`): los números antiguos, el primer movimiento antes.
  - La búsqueda (`GET /api/search`, por clave `SF-745`) y `GET /api/task/by-ticket-id/SF-745` encuentran la tarea movida, con los mismos permisos sobre su proyecto actual. La clave se compara como en upstream (NFKC, sin mayúsculas). La consulta por ticket solo cae al alias si ninguna tarea legible tiene hoy ese número, y resuelve el id de la tarea del alias, con las mismas condiciones de espacio de trabajo y acceso que una tarea viva: nunca vuelve a buscar por el ticket actual.
  - El detalle de la tarea muestra «antes SF-745» encima del título (`apps/web/src/intelia/aliases/`). Su consulta cuelga de `["task", id]`, así que cualquier evento en tiempo real de la tarea, `TASK_MOVED` incluido, la refresca.
- **Enlace antiguo:** el enlace completo antiguo de una tarea movida, con el origen archivado, acaba en la tarea en su proyecto nuevo, con «formerly <clave antigua>».
- **Tareas archivadas y planificadas:** se mueven y siguen archivadas o planificadas en el destino (sin columna, `column.toColumnId: null`), con su alias; el número antiguo resuelve.
- **Fuera del fork** (KP-02, gateway): quién puede mover, la tupla `project` del grafo, el comentario en la tarea y no mover tareas con un worker vivo.
- **Tests:** `tests/api-integration/intelia-task-move.test.ts`, `apps/web/src/intelia/aliases/use-moved-task-redirect.test.ts` y `apps/web/src/intelia/aliases/components/task-aliases.test.tsx`.

## Foto de perfil con API key

`PUT /api/intelia/user/avatar` (OpenAPI, etiqueta `User`; código en `apps/api/src/intelia/user-avatar/`) guarda el avatar de quien llama y fija `user.image` a su URL en la misma petición. Sirve con sesión o con API key, para que cada agente ponga su foto con su propia clave. En upstream no se puede con una API key: `PUT /api/user/avatar` guarda la imagen pero no toca `user.image`, y `POST /api/auth/update-user` exige sesión.

- **Cuerpo y límites:** los de `PUT /api/user/avatar` (`{ contentType, data }` en base64; PNG, JPEG o WebP de hasta 512 KiB). Usa el `saveAvatar` de upstream, así que sustituye el avatar anterior y su URL deja de servirse.
- **Respuesta:** `{ id, url, size }`, con `url` = `/api/user/avatar/<id>`, la misma que devuelve después `GET /api/user/me` en `image`.
- **Guardas:** las de upstream: 403 si el proveedor OAuth/OIDC gestiona la foto, 413/408 por tamaño o tiempo del cuerpo, 400 si el fichero no es válido (sin tocar `user.image`).
- **Solo tablas de upstream** (`user_avatar` y `user.image`): sin tablas ni migraciones propias.
- **Test:** `tests/api-integration/intelia-user-avatar.test.ts`.

## Rutinas programadas

Una rutina es una tarea que se **reabre a In progress** según una expresión cron, siempre la misma tarea (no crea copias, a diferencia de la recurrencia de upstream). Qué hace quien la recibe está en la descripción de la tarea. Código en `apps/api/src/intelia/routines/`.

- **Tablas** (migración `drizzle-intelia/0002_routine.sql`):
  - `intelia.routine`, una por tarea (`task_id` único, `ON DELETE CASCADE`: borrar la tarea borra su rutina y su historial): `cron` (cinco campos: minuto, hora, día del mes, mes, día de la semana), `timezone` (IANA, por defecto `Europe/Madrid`), `active` (`false` = en pausa), `owner_id` (quien la programó o cambió por última vez), `next_run_at`, `last_run_at` y `last_result`.
  - `intelia.routine_run`, el historial: `scheduled_at` (hora prevista), `result` (`reabierta`, `saltada_abierta` o `error`, con `error` el mensaje) y `closed_at`, la hora en que la tarea llegó después a una columna final (Done, Cancelled).
- **API** (OpenAPI, etiqueta `Routines`). Leer pide `task:read`; programar, cambiar y quitar, los permisos de editar la tarea (`task:update`). A quién se puede encargar trabajo no lo mira Kaneo: lo comprueba quien recibe el aviso, con el dueño de la rutina.
  - `GET /api/intelia/workspace/{workspaceId}/routines`: las rutinas de los proyectos que quien llama ve, con su tarea (`number`, `title`, `status`, proyecto) y su asignado, la próxima primero.
  - `GET|PUT|DELETE /api/intelia/task/{taskId}/routine`: `PUT` recibe `{ cron, timezone?, active? }`, crea o sustituye la rutina, hace dueño a quien llama y calcula la próxima ejecución desde ahora; con `active: false` la pausa. Responde 409 si la tarea tiene la recurrencia de upstream (`recurrence`): una tarea no puede tener las dos. Cron o zona horaria inválidos: 400.
  - `GET /api/intelia/task/{taskId}/routine/runs?limit=50`: el historial, lo más reciente primero (máximo 200).
- **Programador:** job de `croner` cada minuto (`intelia-routines` en `apps/api/src/scheduler/index.ts`, con `protect`). Si hay rutinas activas con `next_run_at <= ahora`, primero comprueba la cuenta `svc-rutinas` (ver abajo) y, para cada una:
  1. Reclama el tick moviendo `next_run_at` a la siguiente ejecución contada desde ahora, solo si nadie lo ha movido antes: con varias instancias de la API, el tick corre una sola vez. Los ticks perdidos (Kaneo parado) no se recuperan en tanda: se ejecuta una vez.
  2. **Falla cerrado:** si la cuenta de servicio no pasa la comprobación, o si la tarea tiene en ese momento la recurrencia de upstream (se puede añadir después de programar la rutina), no reabre nada: fila `error` con el motivo y el job queda degradado (error en el registro y en el check-in de Sentry).
  3. Si la tarea está en una columna final (`is_final`: Done, Cancelled), la pasa a `in-progress` con `updateTaskStatus` firmando con el id fijo `svc-rutinas`: fila `reabierta`, y upstream publica `task.status_changed` (webhooks, actividad y avisos) con ese actor.
  4. Si sigue abierta (cualquier otra columna, Blocked incluida), salta el tick: fila `saltada_abierta` y evento `intelia.routine_skipped`.
  5. Si la reapertura falla (por ejemplo, el proyecto no tiene columna `in-progress`), fila `error` con el mensaje; la rutina sigue activa. Si la expresión ya no tiene próxima ejecución, fila `error` y la rutina queda en pausa.
- **Cierre del historial:** un suscriptor de `task.status_changed`, `task.moved` y `task.updated` pone `closed_at` a las filas abiertas (salvo las `error`) cuando la tarea está en una columna final.
- **Cuenta `svc-rutinas`:** se identifica **solo por su id fijo** `svc-rutinas` (nombre `svc-rutinas`, email reservado `svc-rutinas@inteliatech.internal`), sin pasos manuales:
  - **Alta:** la crea el programador en el primer tick con rutinas pendientes, y solo si la instancia ya tiene algún usuario no anónimo además de ella. Así nunca es el usuario más antiguo y no le quita a la primera persona la elección como administrador de la instancia (`promoteInitialAdministrator`).
  - **Comprobación en cada tick, antes de reabrir nada:** el usuario `svc-rutinas` existe con el email reservado, está `banned` sin fecha de fin (`ban_expires` nulo) y no tiene filas en `account` (ni contraseña ni proveedor), ni sesiones, ni claves de API, ni membresías (`workspace_member`, `workspace_member_access`, `workspace_member_project`, `team_member`). Además, ningún otro usuario tiene el email reservado (sin distinguir mayúsculas). Si algo no cuadra, el tick falla cerrado (paso 2).
  - **Nunca adopta ni modifica** un usuario que no sea el suyo: si alguien se registró antes con el email reservado, la cuenta no se crea y ningún tick reabre hasta que se resuelva a mano. Tampoco repara la suya: si deja de cumplir los invariantes, se arregla a mano.
  - **No puede iniciar sesión ni usar claves de API:** sin `account`, el inicio de sesión con email falla, y `banned` hace que Kaneo rechace sus claves y no le dé permisos en ningún espacio de trabajo. Quien recibe los webhooks la reconoce por `actor.id` (`svc-rutinas`).
- **Residual aceptado:** el estado de la tarea y su recurrencia se leen fuera del cerrojo de la tarea (`withLockedTask`), y la cuenta se comprueba una vez por tick: un cambio en ese intervalo (alguien reabre la tarea, le pone recurrencia o toca la cuenta) no se ve hasta el tick siguiente. Si la rutina se borra después de reclamar el tick, la tarea puede quedar reabierta sin su fila de historial (el insert falla por la clave ajena y el job lo registra como error).
- **Evento `intelia.routine_skipped`:** va a cada webhook genérico activo del proyecto de la tarea que tenga activado `task.status_changed` (no hay casilla propia en la configuración de upstream), con el mismo sobre que los eventos de upstream y la misma firma: cabecera `X-Kaneo-Signature`, HMAC-SHA256 en hexadecimal del cuerpo con el `secret` del webhook. Cuerpo:

  ```json
  {
    "event": "intelia.routine_skipped",
    "timestamp": "2026-10-30T10:00:01.234Z",
    "integration": { "type": "generic-webhook" },
    "project": { "id": "…", "name": "…", "workspaceId": "…" },
    "task": {
      "id": "…",
      "number": 12,
      "title": "…",
      "status": "in-progress",
      "statusName": "In Progress",
      "priority": "medium",
      "url": "…/dashboard/workspace/…/project/…/task/…"
    },
    "actor": { "id": "svc-rutinas", "name": "svc-rutinas" },
    "data": {
      "routineId": "…",
      "runId": "…",
      "result": "saltada_abierta",
      "scheduledAt": "2026-10-30T10:00:00.000Z",
      "nextRunAt": "2026-10-30T12:00:00.000Z",
      "cron": "0 */2 * * *",
      "timezone": "Europe/Madrid",
      "owner": { "id": "…", "name": "…" }
    }
  }
  ```

  `task` es la tarea en el momento del aviso (sigue abierta; `status` es su columna). `data.owner` es el dueño de la rutina (usuario de Kaneo), a quien hay que avisar; `data.runId` es la fila del historial.
- **Web** (código en `apps/web/src/intelia/routines/`, ruta `routes/.../$workspaceId/routines.tsx`):
  - **Panel «Programación»** en el detalle de la tarea, bajo «Recursos»: atajos (cada N horas, cada día a una hora, unos días de la semana a una hora) y cron libre para lo demás (`schedule.ts` traduce entre atajo y cron; un cron que no encaja en un atajo se edita como cron libre). La zona horaria es la del navegador al programar y se conserva al cambiar. Enseña la programación en texto, la próxima ejecución, el interruptor de pausa y las cinco últimas ejecuciones. Con la recurrencia de upstream en la tarea no ofrece programar.
  - **Pantalla «Rutinas»** del espacio de trabajo, en el menú lateral tras «My tasks»: tarea, proyecto, a quién va, cuándo (en texto, con el cron en el tooltip), próxima, última y cómo acabó, dueño, y el interruptor para pausar o activar. Clic en la fila abre la tarea.
  - Pausar o activar es un `PUT` con el mismo cron y zona horaria: quien lo hace pasa a ser el dueño, como en la API.
  - **Solo se ofrece lo que se puede hacer:** sin `task:update` (la capacidad `updateTasks` de `useWorkspacePermission`), el panel no enseña ni programar, ni cambiar, ni quitar, y el interruptor de las dos vistas queda deshabilitado con un tooltip que lo explica (`components/active-switch.tsx`). En ese caso no se lanza ninguna mutación.
  - **Ficheros de upstream:** dos líneas en `task-details-content.tsx` (el panel) y dos en `nav-main.tsx` (el enlace); `routeTree.gen.ts` lo regenera el plugin de TanStack Router. Las traducciones (en y es) van en `intelia/routines/i18n.ts`, con el registro común de `intelia/i18n.ts`.
  - **Tests:** `schedule.test.ts`, `components/routine-panel.test.tsx` y `components/routines-page.test.tsx`.
- **Test:** `tests/api-integration/intelia-routines.test.ts`, con un receptor HTTP real que comprueba la firma, y los casos de fallo cerrado: inicio de sesión y clave de API de la cuenta rechazados, email reservado ocupado por un usuario registrado (ningún tick reabre y ese usuario queda intacto), instancia vacía (la primera persona sigue siendo administradora), invariantes rotos y recurrencia añadida después.

## Nivel de automatización de las tareas

Cada tarea lleva un **nivel** (`manual`, `arranque` o `completa`) y una **verificación** (sí o no), que leen el motor de flujo de la factory y su interfaz ([diseño 18](https://github.com/intelia-technologies/software-factory/blob/main/docs/design/18-motor-de-flujo.md) §3 y §5). Kaneo solo los guarda y valida: **quién puede cambiarlos no lo mira Kaneo** (decisión 9 del diseño 18: «el gateway comprueba, Kaneo ejecuta»). El gateway de la factory comprueba el permiso en el grafo y, si pasa, escribe con la API key de su cuenta; Kaneo solo pide su permiso nativo `task:update`. Código en `apps/api/src/intelia/task-automation/`.

- **Tablas** (migración `drizzle-intelia/0003_task_automation.sql`):
  - `intelia.task_automation`, una fila por tarea (`task_id` es la clave, `ON DELETE CASCADE`): `level`, `verification`, quién lo fijó (`set_by_user_id`, el usuario de Kaneo que escribió, y `set_by_actor`, el id del grafo que declaró quien llamó con una API key), `source` (`session`, `api_key` o `migration`; el `CHECK` admite también `gateway`, del antiguo token de servicio, que ya nada escribe) y `set_at`. Un `CHECK` impide `completa` sin verificación.
  - `intelia.task_automation_change`, el diario: una fila por cada vez que se fija o cambia, con el valor anterior (`previous_level`, `previous_verification`; nulos la primera vez), el nuevo, quién, `source` y `changed_at`. Escribir el mismo valor que ya tiene no es un cambio: no deja fila ni cambia el autor.
- **Obligatorio al crear:** `POST /api/task/{projectId}` exige `automation: { level, verification }` en el cuerpo, sin valor por defecto; está en el contrato (`createTaskBody`, OpenAPI `required`). El esquema es una unión por nivel (`oneOf` en el OpenAPI): `completa` solo con `verification: true`, `manual` y `arranque` con cualquier booleano; el tipo de entrada del cliente Hono es el mismo, así que `automation: 5` o `{ level: "completa", verification: false }` no compilan. Sin él, con un nivel desconocido o con `completa` sin verificación responde 400 (`VALIDATION_ERROR`, campo `body.automation…`) y no crea nada. La primera fila la firma quien crea la tarea, también con una API key (`source: api_key`): quien crea una tarea puede fijar su primer nivel.
  - **Una sola transacción:** la tarea, su nivel y la primera fila del diario se escriben en la transacción de `createTask` de upstream, y `task.created` (webhooks, tiempo real, avisos) sale después del commit. Si falla el nivel o el diario, no queda ni la tarea ni el evento, y un reintento crea una sola tarea.
  - **Límite: sin idempotencia.** Como en upstream, si la tarea se crea pero la respuesta no llega al cliente, un reintento crea otra tarea. Quien reintente (por ejemplo, el gateway) debe comprobar antes si ya existe.
  - **Clientes que reciben 400 hasta que manden `automation`:** todo lo que crea tareas con esa ruta o importa con `POST /api/task/import/{projectId}` sin conocer el campo. En este repo, la herramienta `create_task` del MCP nativo (`packages/mcp`), la CLI (`kaneo task create` y su importación), la app móvil y el importador de Planka (`packages/planka-import`); además, el `duplicate` del MCP y de la app móvil reciben 400 si la tarea de origen no tiene nivel. La web sí lo manda (ver «Web» abajo). En la factory, `kaneo.create_task` del gateway, el importador de `TASKS.md` y los tests en vivo que crean tareas.
  - `INTELIA_TASK_AUTOMATION_OPTIONAL=true`: si falta `automation` al crear o al importar, un middleware anterior a la validación (`testAutomationDefault`) lo rellena con `manual` y verificación; si llega, se valida igual. Al duplicar un origen sin nivel, la copia recibe lo mismo. No toca el esquema: el contrato publicado, los tipos y `apps/docs/openapi.json` son los mismos con y sin la variable. Solo para la suite de integración y las pruebas de humo de upstream, que no conocen el campo; nunca en un despliegue.
- **Duplicar y recurrencia** (`POST /api/task/duplicate/{id}`, cuerpo `{ title?, automation? }`; código en `intelia/task-automation/on-copy.ts`): la copia lleva el `automation` del cuerpo si llega y, si no, el nivel y la verificación de la tarea de origen, con su primera fila del diario firmada por quien duplica (`session` o `api_key`). Si el origen no tiene nivel (tareas cerradas antes del relleno) y no llega `automation`, responde 400 (`VALIDATION_ERROR`, `body.automation`) sin crear nada; con la excepción de tests, `manual` y verificación. La **ocurrencia recurrente** hereda el nivel de la tarea que se completa, firmado por quien fijó el de esa tarea (mismo `source`); si esa tarea no tiene nivel, la ocurrencia recibe `manual` con verificación y `source: migration`, la misma regla que el relleno, para que la serie siga. Todo va en la transacción de la copia: si falla el nivel no queda ni la copia ni el evento `task.created`, y no se emite evento de cambio de nivel.
- **Importación JSON** (`POST /api/task/import/{projectId}`, cuerpo `{ tasks, automation }`): `automation` es obligatorio y se aplica a todas las tareas importadas, cada una en su transacción y firmada por quien importa. Sin él, 400; con la excepción de tests, `manual` y verificación.
- **Vías que siguen creando tareas sin nivel**, fuera de la interfaz o deshabilitadas en ella: las importaciones de proyectos desde otras herramientas (`/api/import/runs`) y las de issues de GitHub, Gitea y GitLab, y las tareas que abren los webhooks de esas integraciones. En la web, sus botones de inicio están deshabilitados con el motivo a la vista. El motor trata una tarea sin nivel como `manual` (diseño 18 §3).
- **API** (OpenAPI, etiqueta `Task Automation`):
  - `GET /api/intelia/task/{taskId}/automation`: el nivel, con quién y cuándo (404 si no tiene). Con `task:read`, por sesión o API key.
  - `PUT /api/intelia/task/{taskId}/automation`: recibe `{ level, verification, actor? }`, fija o cambia el nivel y lo anota en el diario. Con la sesión de una persona o con la API key de una cuenta, en ambos casos con `task:update` en el espacio de la tarea (permiso nativo de Kaneo, y el alcance de la clave si lo tiene): sin credenciales o con una clave desconocida, 401; una cuenta sin `task:update` (por ejemplo, `viewer`) o una clave cuyo alcance no lo incluye, 403; una cuenta de otro espacio, 404, como Kaneo responde a cualquier tarea que no puede ver; una tarea que no existe, 404. Kaneo no consulta el grafo: `can_set_automation` lo comprueba el gateway **antes** de llamar.
    - **Autor:** el diario y la fila guardan como autor la cuenta que escribe (`set_by_user_id` / `changed_by_user_id`) con `source: session` o `source: api_key`.
    - **`actor` declarado:** solo con API key, el id del grafo por el que dice actuar quien llama (por ejemplo `agent:orq-jaime`), que se guarda en `set_by_actor` / `changed_by_actor` y sale en el evento. Es **informativo, no autoritativo**: Kaneo no lo comprueba ni le da permisos. Válido si cumple `^(agent|person):[a-z0-9-]+$` y tiene como mucho 100 caracteres; si no (otro formato, mayúsculas, espacios, más largo, otro tipo), **se ignora** sin error y la escritura queda a nombre de la cuenta solamente. Con sesión no se admite un `actor` válido (400): la persona actúa como ella misma.
  - `GET /api/intelia/task/{taskId}/automation/history?limit=50`: el diario, lo más reciente primero (máximo 200).
  - `GET /api/intelia/project/{projectId}/automation`: los niveles de las tareas del proyecto que lo tienen, por número (`project:read` y `task:read`).
- **Sin token de servicio:** desde AU-02c no existen la cabecera `X-Service-Token` ni la variable `INTELIA_GATEWAY_TOKEN`; si llegan, se ignoran y la petición se autentica como cualquier otra (sin sesión ni clave, 401).
- **Defensa perdida, por decisión:** antes, el nivel solo lo escribían una sesión o el token del gateway y cualquier API key recibía 403, así que una cuenta con clave no podía saltarse la comprobación del grafo. Ahora **quien tenga la API key de una cuenta con `task:update` puede escribir el nivel** directamente contra Kaneo, sin pasar por el gateway. Es la decisión de Jaime (opción B): el gateway es la única puerta prevista de los agentes, y las claves de sus cuentas las guarda él.
- **Relleno único:** la migración `0003` pone `manual` con verificación a todas las tareas abiertas que existan al aplicarla y deja una fila `migration` por tarea en el diario. Las cerradas quedan sin nivel: las que están en una columna final de su proyecto (el criterio de `taskIsCompleted` de upstream) y, en un proyecto antiguo sin columnas, las `done`. Esta migración corre antes de `migrateColumns()` de upstream, que da a esos proyectos las columnas por defecto con `done` como única final.
- **Evento `task.automation_changed`:** cada cambio real del nivel por `PUT /api/intelia/task/{taskId}/automation`, venga de la sesión de una persona (la interfaz) o de la API key de una cuenta (el gateway), sale por el webhook genérico como `intelia.routine_skipped`: a cada webhook genérico activo del proyecto que tenga activado `task.status_changed`, con el sobre y la firma de upstream (`apps/api/src/intelia/webhooks.ts`). Es lo que arranca la tarea en el despachador al subir el nivel (diseño 18 §4.1). **No sale** al crear la tarea (sale solo `task.created`), ni al duplicarla, en la ocurrencia recurrente o al importarla, ni al escribir el mismo valor que ya tiene, ni con el relleno de la migración. Sale después del commit y sin retener la respuesta, como los eventos de upstream: si la entrega falla, el cambio queda igual y no se reintenta (el reconciliador del despachador es la red de seguridad).
  - **Orden:** dos cambios muy seguidos pueden llegar en otro orden; se ordenan por `data.changedAt`. Es **estrictamente creciente por tarea**: bajo el cerrojo de la tarea vale `max(ahora, último changedAt de la tarea + 1 ms)`. Dos cambios en el mismo milisegundo quedan a 1 ms; si el reloj retrocede, sigue desde el último valor de la tarea, de milisegundo en milisegundo, hasta que el reloj lo alcanza. Es el mismo valor en la fila del diario, en `set_at` de la tarea y en el evento, y el diario (`…/automation/history`) sale en ese orden.
  - **Casilla compartida, por diseño:** upstream no tiene casilla para nuestros eventos, así que se reutiliza la de `task.status_changed`, igual que `intelia.routine_skipped`. Un receptor que solo quiere cambios de estado también recibe este evento, con su autor (la cuenta de Kaneo y, con API key, el `actor` declarado). El despachador ignora los eventos que no conoce; un receptor externo debe filtrar por `event` antes de actuar.
  - **Entrega secuencial:** los webhooks del proyecto se avisan uno tras otro, así que un receptor lento retrasa a los siguientes (sin reintento, como el resto).

  Cuerpo:

  ```json
  {
    "event": "task.automation_changed",
    "timestamp": "2026-11-02T10:00:00.123Z",
    "integration": { "type": "generic-webhook" },
    "project": { "id": "…", "name": "…", "workspaceId": "…" },
    "task": { "id": "…", "number": 12, "title": "…", "status": "to-do", "statusName": "To Do", "priority": "medium", "url": "…" },
    "actor": { "id": "…", "name": "…" },
    "data": {
      "previousLevel": "manual",
      "previousVerification": true,
      "level": "arranque",
      "verification": true,
      "source": "api_key",
      "changedByActor": "agent:orq-jaime",
      "changedAt": "2026-11-02T10:00:00.100Z"
    }
  }
  ```

  El autor, como en el diario: `actor` es siempre la cuenta de Kaneo que escribió (id y nombre). Con sesión, `source: "session"` y `changedByActor: null`; con API key, `source: "api_key"` y `changedByActor` es el `actor` declarado si era válido, o `null`. `previousLevel` y `previousVerification` son nulos si la tarea no tenía nivel. `changedAt` es el de la fila del diario. Sin emails, claves ni tokens.
- **Web** (código en `apps/web/src/intelia/automation/`; textos en `en` y `es` en `i18n.ts`, espacio `intelia`):
  - **Tarjeta del tablero:** distintivo con el nivel (`Manual`, `Arranque`, `Completa`) y la verificación en palabras («Verification» / «No verification»), cada uno con su icono: el color solo repite lo que dice el texto. Las tareas sin nivel no lo llevan. Una sola petición por proyecto (`GET /api/intelia/project/{projectId}/automation`).
  - **Detalle de la tarea:** bloque «Automation» bajo «Programación» con el nivel, quién lo fijó y cuándo, el selector y el diario (cada cambio con fecha, valor anterior y nuevo, autor y, si no es una sesión, el origen). **El selector está siempre visible** (decisión 9 del diseño 18): al elegir un valor completo y distinto se guarda con `PUT`; si la API lo rechaza, avisa y vuelve al valor guardado.
  - **Creación:** el formulario de tarea y la fila de subtareas piden nivel y verificación, sin nada preseleccionado; «Create Task» y «Add» siguen deshabilitados, con el motivo a la vista, hasta elegir los dos (en el formulario, el motivo va justo encima de los botones, también en móvil). `Completa` y «No» se deshabilitan entre sí, así que no se puede elegir `completa` sin verificación.
  - **Duplicar** desde el menú de la tarjeta: si la tarea tiene nivel, la copia lo hereda; si no, un diálogo pide nivel y verificación, sin preselección, antes de mandar nada.
  - **Importar JSON** (Ajustes del proyecto): el diálogo pide nivel y verificación, sin preselección, y los aplica a todas las importadas; «Select file» sigue deshabilitado hasta elegirlos.
  - **Importaciones deshabilitadas:** «Import issues» de GitHub, Gitea y GitLab y el inicio de las importaciones de proyectos desde otras herramientas, con el motivo a la vista, porque aún no piden el nivel.
  - **Proyecto de ejemplo** del alta (`create-starter-project.ts`): sus tareas se importan con `manual` y verificación, el comportamiento de hoy, firmadas por la persona que se da de alta.
  - **Filtro** «Automation» en la barra de filtros, como los demás campos (operador, negación, contador y guardado por proyecto): `Manual`, `Arranque`, `Completa` y «No level». Mientras no han llegado los niveles del proyecto, el filtro no se aplica.
  - **Límite:** el tablero no recibe en tiempo real los cambios de nivel que hacen otros; se ven al recargar o al volver a pedir los niveles del proyecto.
  - **Tests:** `filter.test.ts`, `import-block.test.tsx`, `use-duplicate-with-automation.test.tsx`, `components/automation-panel.test.tsx`, `components/task-card-automation.test.tsx`, `components/create-task-modal-automation.test.tsx`, `components/task-subtasks-automation.test.tsx`, `components/duplicate-automation-dialog.test.tsx` y `components/import-tasks-automation.test.tsx`. `scripts/ci/browser.mjs` (job `docker-build`) elige `arranque` sin verificación en el formulario y comprueba los dos valores.
- **Tests:** `tests/api-integration/intelia-task-automation.test.ts` (creación, transacción con fallo inyectado y reintento, cambios y diario; la API key de una cuenta con `task:update` que escribe con su `actor` declarado, sin él, con uno inválido que se ignora y en el límite de 100 caracteres; 403 a la clave de una cuenta `viewer` y a una clave sin `task:update` en su alcance, y 404 a la de una cuenta de otro espacio; 401 sin credenciales y con clave desconocida; vuelta atrás de una escritura con clave ante fallo; que `X-Service-Token`/`INTELIA_GATEWAY_TOKEN` ya no autentican nada; y `task.automation_changed` con un receptor HTTP real que comprueba la firma: uno por cambio desde la sesión y desde la clave, ninguno al crear ni al repetir el valor, y `changedAt` estrictamente creciente con el reloj congelado, mezclando sesión y clave, y con el reloj que retrocede), `intelia-task-automation-backfill.test.ts` (el relleno sobre tareas que ya existían, también en un proyecto sin columnas) e `intelia-task-automation-copy.test.ts` (duplicar con y sin nivel de origen, ocurrencias recurrentes, importación con y sin nivel, excepción de tests, vuelta atrás ante fallo, y que duplicar, la ocurrencia y la importación no emiten `task.automation_changed` y sus filas siguen la regla de `changedAt`). Corren con la suite de integración (`intelia-integration.yml`): en cada versión, a mano o en las PR que cambian ese workflow, no en cada PR. `scripts/ci/upgrade.mjs` (job `docker-build`, en cada PR) comprueba el relleno al actualizar desde la imagen de upstream.

## Iniciativas

Una **iniciativa** agrupa las tareas de un mismo esfuerzo dentro de **un solo proyecto**, con un **plan** que se cierra una vez ([diseño 19](https://github.com/intelia-technologies/software-factory/blob/main/docs/design/19-vista-iniciativas.md) §3 y §4). Cada tarea pertenece a una iniciativa con un **origen** que calcula el servidor: `plan` si entró con el plan abierto, `añadido` si entró después. Código en `apps/api/src/intelia/initiatives/`.

- **Tablas** (migración `drizzle-intelia/0004_initiative.sql`):
  - `intelia.initiative`: `project_id` (`ON DELETE CASCADE`), `name` y `name_key` (el nombre sin mayúsculas, tildes ni espacios repetidos, **único por proyecto**), `design_url`, `approved_by`, `approved_at`, quién la creó (`created_by_user_id`, `created_by_actor`, `source`), `created_at` y `plan_closed_at` (nulo mientras se planifica).
  - `intelia.initiative_change`, su diario: `created`, `updated` (solo los campos que cambian, antes y después) y `plan_closed`, con autor y `source` (`session`, `api_key`, `auto` si el plan se cerró solo, con la tarea que lo cerró en `task_id`, o `migration`).
  - `intelia.task_initiative`: la iniciativa de cada tarea (`task_id` es la clave), su `origin` (`plan`, `añadido` o `sin_registro`, este último para la migración de IN-03), `since` y autor.
  - `intelia.task_initiative_change`, el diario de la tarea: cada asignación, cambio y pérdida, con iniciativa y origen anteriores y nuevos, autor y `source` (`session`, `api_key`, `project_move` o `migration`).
- **Obligatoria al crear** (junto al nivel de AU-02): `POST /api/task/{projectId}` exige `initiative`, que es `{ id }` (una iniciativa del proyecto) o, para una subtarea, `{ parentTaskId }` (hereda la del padre). Sin él, 400 `VALIDATION_ERROR` (`body.initiative`); con una iniciativa que no existe, 400 `INITIATIVE_NOT_FOUND`; de otro proyecto, 400 `INITIATIVE_NOT_IN_PROJECT`; un padre que no existe **o que es de otro proyecto** (se busca solo en el proyecto de la tarea nueva, sin revelar tareas ajenas), 400 `PARENT_TASK_NOT_FOUND`; un padre del proyecto sin iniciativa, 400 `PARENT_WITHOUT_INITIATIVE`. En ningún caso se crea la tarea: la tarea, su nivel, su iniciativa y las filas de los diarios van en la transacción de `createTask`, antes de `task.created`.
  - **Importación JSON** (`POST /api/task/import/{projectId}`): `initiativeId` obligatorio, para todas las importadas.
  - **Duplicar** (`POST /api/task/duplicate/{id}`, cuerpo `{ title?, automation?, initiativeId? }`): la copia va a `initiativeId` si llega y, si no, a la del origen; un origen sin iniciativa sin `initiativeId` da 400 (`VALIDATION_ERROR`, `body.initiativeId`). La **ocurrencia recurrente** va a la iniciativa de la tarea que se completa, firmada como lo estaba esa; sin ella, sin iniciativa.
  - **Mover la tarea a otro proyecto** (`PUT /api/task/move/{id}`): pierde la iniciativa, con una fila `project_move` en su diario; se le asigna otra con `PUT …/initiative`.
- **Clientes que reciben 400 hasta que manden la iniciativa**, los mismos que con `automation` (ver «Nivel de automatización»). La web ya la envía en todos sus puntos de creación (formulario, subtareas, duplicar, importación JSON y proyecto de ejemplo). Por eso esta imagen se despliega junto con IN-05 e IN-06 (diseño 19 §7 y §9), nunca sola.
  - `INTELIA_TASK_INITIATIVE_OPTIONAL=true`: si falta la iniciativa al crear o al importar, un middleware anterior a la validación la rellena con la iniciativa «Pruebas de upstream» del proyecto (la crea si falta); al duplicar un origen sin iniciativa, la copia queda sin ella. No toca el esquema ni `apps/docs/openapi.json`. Solo para la suite de integración y las pruebas de humo de upstream; nunca en un despliegue.
- **Plan o añadido:** al asignar una tarea a una iniciativa (al crearla, al importarla, al copiarla o con `PUT …/initiative`), con la fila de la iniciativa bloqueada (`FOR UPDATE`), el origen es `plan` si `plan_closed_at` es nulo y `añadido` si no. Nadie lo escribe a mano y no se corrige después. **Mover una tarea a otra iniciativa** (`PUT …/initiative`) bloquea antes la fila de la tarea, el mismo bloqueo que toma su traslado a otro proyecto, así que el proyecto con el que se valida la iniciativa no puede quedar obsoleto; recalcula el origen frente a la nueva y queda en el diario; ponerla en la que ya tiene no cambia nada.
- **Cierre del plan:** a mano (`POST …/close-plan`) o **solo**, cuando una tarea de la iniciativa pasa a la columna `in-progress`, **dentro de la transacción que hace ese cambio**, venga de donde venga (API, cambios masivos, reordenar, integraciones, rutinas): el trigger `intelia_close_plan_on_start` (que reinstala cada arranque) bloquea la fila de la iniciativa, cierra el plan y deja la fila `plan_closed` con `source: auto` y la tarea. No depende del estado observado después: una tarea que pasa por In progress y sale enseguida cierra el plan igual, y una asignación concurrente queda ordenada antes (es `plan`) o después (es `añadido`) del cierre. Una tarea que llega a In progress al trasladarse a otro proyecto no cierra el plan del proyecto que deja. Una tarea que entra ya en In progress en una iniciativa (al crearla o con `PUT …/initiative`) la cierra en esa misma transacción. La tarea que cierra el plan conserva su origen.
- **API** (OpenAPI, etiqueta `Initiatives`):
  - `POST /api/intelia/project/{projectId}/initiatives` (`{ name, designUrl?, approvedBy?, approvedAt?, actor? }`): 201 con la iniciativa; un nombre que ya existe en el proyecto sin distinguir mayúsculas, tildes ni espacios, 409 `INITIATIVE_NAME_TAKEN`.
  - `PATCH /api/intelia/initiative/{initiativeId}` (`{ name?, designUrl?, approvedBy?, approvedAt?, actor? }`, al menos un dato): cambia los datos; sin cambios no deja fila.
  - `POST /api/intelia/initiative/{initiativeId}/close-plan` (`{ actor? }`): cierra el plan; si ya estaba cerrado, 200 sin cambios.
  - `PUT /api/intelia/task/{taskId}/initiative` (`{ initiativeId, actor? }`): pone la tarea en otra iniciativa de su proyecto.
  - Lectura (`task:read`): `GET /api/intelia/initiative/{initiativeId}/history`, `GET /api/intelia/task/{taskId}/initiative` (404 si no tiene) y `GET /api/intelia/task/{taskId}/initiative/history`.
- **Lectura para la vista** (IN-02, diseño 19 §6; código en `initiatives/read.ts`), con `task:read` y acceso al proyecto, igual con sesión que con la API key de una cuenta `member`:
  - `GET /api/intelia/project/{projectId}/initiatives`: `{ initiatives, withoutInitiative }`, todo en una llamada y con un número fijo de consultas, también con 30 iniciativas. Cada iniciativa lleva en el primer nivel los campos de `Initiative` más `state` (`in_flight`, `finished`, `no_tasks`, `all_cancelled`), `counters` (`total`, `active`, `done`, `cancelled`, `blocked` y, por origen, `plan`, `added` y `unrecorded` con `total`, `active` y `done`) y `blockedTasks` con su motivo. `withoutInitiative`: las tareas del proyecto sin iniciativa.
  - `GET /api/intelia/initiative/{initiativeId}`: la `Initiative` en el primer nivel (404 si no existe), `state`, `counters`, `tasks` (origen, estado, asignado, `statusSince`, motivo del bloqueo, `dependsOn` y `blocks`), `externalTasks` (las tareas legibles de fuera de la iniciativa que tocan sus dependencias) y `pendingChain` (`taskIds`, `partial`, `cycle`).
  - `POST /api/intelia/workspace/{workspaceId}/task-initiatives` (`{ taskIds }`, de 1 a 500 ids; los repetidos cuentan una vez; si no, 400): `{ tasks: [{ taskId, initiativeId, initiativeName }] }`, por id de tarea, en una sola consulta, para leer la iniciativa de muchas tareas sin una petición por tarea. Una tarea legible sin iniciativa sale con `initiativeId` e `initiativeName` nulos; las desconocidas, las de otro espacio y las de proyectos que no puede leer no salen, sin distinguirse entre sí. Pide `task:read` en el espacio; sin credenciales, 401.
  - **Reglas de avance:** solo `done` cuenta como hecha; `cancelled` (o `canceled`) no entra en `active` ni en `done`, pero conserva su origen en `total`. `blocked` es la columna `blocked`; su motivo sale de los campos personalizados `motivo_bloqueo` y `motivo_bloqueo_detalle` (IN-07), nulo si falta o está vacío.
  - **«Sin cambios de estado desde»** (`statusSince`): la última actividad `status_changed` de la tarea o, si no hay ninguna, su creación.
  - **Cadena pendiente:** la más larga de tareas ni hechas ni canceladas unidas por `blocks`, empezando por la primera que bloquea. En empate gana la tarea de la iniciativa con menor número y, después, las tareas externas. Si hay un ciclo, `cycle: true` y sin cadena.
  - **Un solo filtro de proyectos legibles** (`readableProject` en `initiatives/access.ts`): el mismo espacio y el acceso a proyectos de Kaneo (`projectAccessCondition`), sin privacidad nueva. Se aplica a contadores, tareas bloqueadas, tareas, dependencias y tareas externas. Una tarea de un proyecto que quien pide no puede leer no aparece en ninguna parte: ni su id, título, estado o asignado. Si una tarea pendiente de la iniciativa depende de una tarea así, la cadena lleva `partial: true`. No se lee nada de la tarea oculta para decidirlo.
- **Quién escribe** (decisión de Forja del 02-nov, mismo contrato que AU-02c; comprobación en `initiatives/access.ts`): la sesión de una persona o la API key de una cuenta, en ambos casos con `task:update` en el espacio (y en el alcance de la clave). Sin credenciales o con una clave desconocida, 401; una cuenta `viewer` o una clave sin `task:update`, 403; una cuenta de otro espacio, 404. **No hay token de servicio:** `X-Service-Token` no autentica. `actor` (solo con API key) es informativo, con la misma regla que en el nivel: inválido se ignora; con sesión, un `actor` válido da 400. Kaneo no consulta el grafo: las reglas finas (`member`, creador o `lead`, `can_set_automation`) las comprueba el gateway antes de llamar (IN-06).
- **Defensa perdida, por decisión** (la misma que en el nivel): quien tenga la API key de una cuenta con `task:update` puede crear y editar iniciativas, cerrar planes y mover tareas de iniciativa directamente contra Kaneo, sin pasar por el gateway.
- **Límite conocido, interbloqueo en el primer cierre** (aceptado en la revisión): dos cambios de estado concurrentes que pasan a In progress, en orden inverso, tareas de **varias** iniciativas con el plan abierto (por ejemplo, dos cambios masivos) pueden interbloquearse en `initiative … FOR UPDATE` dentro del trigger; Postgres aborta uno con `40P01` y el cliente debe reintentarlo. Es transitorio y solo ocurre en el cierre inicial de cada iniciativa: con el plan cerrado, el trigger no bloquea nada. Coste del trigger medido en la revisión: un cambio masivo de 1000 tareas, 10,9 ms frente a 3,5 ms sin él.
- **Tests:** `tests/api-integration/intelia-initiatives.test.ts`, `intelia-initiatives-read.test.ts` y `intelia-task-initiatives.test.ts` (lectura) y, para el trigger y las claves a `task`, `intelia-task-hooks.test.ts` (ver «Ganchos sobre `public.task`»).
- **Web** (código en `apps/web/src/intelia/initiatives/`; textos en `en` y `es` en `i18n.ts`, espacio `intelia`):
  - **Selector (`InitiativePicker`):** combobox accesible con búsqueda insensible a mayúsculas y tildes, indicación de «plan cerrado» y opción directa «Crear iniciativa «X»» que llama a `useCreateInitiative`. Si el nombre ya existe (409 `INITIATIVE_NAME_TAKEN`), avisa sin cambiar la selección. Sin preselección. Lee las iniciativas del listado del proyecto (`GET /api/intelia/project/{projectId}/initiatives`, ver «Lectura para la vista»), una petición por proyecto y en caché.
  - **Detalle de la tarea (`TaskInitiativePanel`):** muestra la iniciativa actual y su origen (`plan`, `añadido` o `sin_registro`), quién la fijó y cuándo. El selector para cambiarla siempre está visible (también para tareas sin iniciativa) y guarda con `PUT …/initiative`, revirtiendo con aviso ante error. Botón «Cerrar el plan» con confirmación si está abierto, o fecha de cierre si ya lo está. Muestra el diario de la tarea (`…/initiative/history`) y los hitos de la iniciativa (`created`, `plan_closed` con autor/`auto` y la tarea que lo cerró).
  - **Puntos de creación:**
    - **Formulario modal (`CreateTaskModal`):** campo obligatorio `InitiativeCreateField` sin preselección, se reinicia al cambiar de proyecto o al marcar «crear más». Cuenta como cambio sin guardar («dirty»). El botón «Create Task» queda deshabilitado con `InitiativeRequiredReason` hasta elegir una iniciativa; envía `initiative: { id }`.
    - **Subtareas (`TaskSubtasks`):** heredan siempre la del padre (`initiative: { parentTaskId }`). Leen la iniciativa del padre y muestran «Hereda X de la tarea padre.» en la fila de creación; si el padre no tiene ninguna, el botón «Add» queda deshabilitado con aviso.
    - **Duplicar tarea (`useDuplicateWithAutomation` y `DuplicateAutomationDialog`):** lee nivel e iniciativa frescos; si la fuente ya tiene iniciativa el servidor la copia. Si le falta iniciativa (o nivel), abre el diálogo pidiendo solo lo que falta (selector de iniciativa para el proyecto de la fuente y/o nivel de automatización).
    - **Importación JSON (`ImportTasksDialog`):** exige elegir iniciativa (`InitiativePicker`) junto al nivel de automatización antes de habilitar «Select file»; aplica la iniciativa a todas las tareas importadas.
    - **Proyecto de inicio (`createStarterProject`):** crea primero la iniciativa «Getting started» (`intelia:initiative.starterName`) vía `POST /api/intelia/project/{id}/initiatives` e importa las tareas con su id.
  - **Tests:** `components/initiative-picker.test.tsx` y `components/initiative-panel.test.tsx` (junto a los tests de puntos de creación).

## Vista «Dependencias»

Vista más del proyecto, con enlace propio junto a Tareas y Backlog (ver «Vista «Iniciativas»»), que dibuja las dependencias `blocks` de izquierda a derecha con `@xyflow/react` y `@dagrejs/dagre`, a partir de `GET /api/intelia/project/{projectId}/relations`. Código en `apps/web/src/intelia/dependencies/` y la ruta `routes/.../project/$projectId/dependencies.tsx`.

- **Nodos:** las tareas del proyecto que pasan los filtros de la barra (también los campos personalizados). Hechas en gris; canceladas (columna final con slug `cancelled` o `canceled`) en gris con borde discontinuo. **Bloqueada:** columna `blocked` o alguna tarea que la bloquea sin terminar, aunque esté oculta por el filtro o sea de otro proyecto. Las tareas de otros proyectos salen como nodo pequeño con enlace.
- **Filtro por iniciativa (IN-04, diseño 19 §7.4):** parámetro `initiativeId?: string` en la URL y selector accesible en la barra de herramientas («Iniciativa», opciones «Todas» + iniciativas del proyecto ordenadas por nombre de `useProjectInitiatives(projectId)`). Con iniciativa seleccionada, `useInitiative(projectId, initiativeId)` acota el grafo: solo las tareas de la iniciativa son nodos de proyecto (intersecadas con la barra de filtros); las tareas que bloquean o son bloqueadas que pertenecen a otras iniciativas del mismo proyecto o a otros proyectos se dibujan como nodos frontera/externos (borde discontinuo, etiqueta «Externa», clave y el nombre de la otra iniciativa o del otro proyecto). Al hacer clic en una frontera del mismo proyecto se abre su panel lateral de tarea (`?taskId=`); en las de otro proyecto se mantiene el enlace a su tablero.
- **Ocultar canceladas:** interruptor «Mostrar canceladas» en el menú Display (y en `InitiativeTree`). Oculta por defecto las tareas canceladas en el grafo acotado a iniciativa, y permite mostrarlas u ocultarlas tanto en el grafo de la iniciativa como en el grafo general del proyecto (donde por defecto se muestran para preservar el comportamiento anterior).
- **Aristas:** solo `blocks`, si sus dos extremos están visibles. Las tareas sin aristas se ocultan; el interruptor «Loose tasks» del menú Display las enseña.
- **Cadena pendiente más larga / Camino crítico** (`critical-path.ts`): la cadena más larga de tareas no terminadas (columna no final) entre las visibles, peso 1 por tarea; en empate, la de mayor suma de prioridades (`urgent` 4 … `no-priority` 0) y, después, la de ids menores. En el ámbito de iniciativa se rotula como «Cadena pendiente más larga» y los nodos destacados llevan el distintivo de texto «Cadena» junto al icono de llama, accesible sin depender únicamente del color. Los nodos externos participan en la cadena tanto como predecesores o sucesores. Si hay un ciclo entre los nodos visibles, se avisa y no se calcula.
- **Componente `InitiativeTree`:** exportado en `apps/web/src/intelia/dependencies/components/initiative-tree.tsx` con props `{ projectId, workspaceId, initiativeId, showCancelled, onShowCancelledChange, onOpenTask }` para la pestaña «Árbol» del detalle de iniciativa (`InitiativeDetailPage`). Reutiliza los mismos hooks y datos mediante el hook compartido `useDependenciesGraph` (`useGetTasks`, `useGetProjectRelations`, `useBurstValue`, `buildGraphModel`, `DependenciesView`), sin `ProjectLayout`/toolbar, con su propia fila compacta de controles (interruptor de canceladas y enlace «Abrir en Dependencias» con `initiativeId`) y ocupando la altura del contenedor que le da el detalle.
- **Clic** en un nodo: abre la tarea en el panel lateral (`?taskId=`), como en Gantt. En un nodo de otro proyecto (también con Intro o Espacio) abre el tablero de ese proyecto con la ficha de la tarea.
- **Carga:** si fallan las relaciones, la vista lo dice y ofrece reintentar; no dibuja un grafo vacío.
- **Tiempo real** (`realtime.ts`): sin socket propio. El WebSocket del proyecto (`useProjectWebSocket`) ya mantiene las tareas en la caché del tablero; con `TASK_CREATED`, `TASK_UPDATED`, `TASK_DELETED`, `TASK_MOVED` y `TASK_RELATION_UPDATED` además invalida las relaciones del proyecto, una vez por ráfaga (250 ms desde el primer evento). La página agrupa igual los cambios de tareas y relaciones, así que el layout de `dagre` se recalcula una vez por ráfaga; los filtros y el interruptor se aplican al momento. Tras una reconexión, las relaciones se releen al volver el foco o la red (React Query).
- **Registro en ficheros de upstream:** el registro de vistas está en `intelia/view.ts` (lo usan `project-views.ts`, `project-scope-toggle.tsx` y `store/user-preferences.ts`), y dos líneas en `hooks/use-project-websocket.ts` para el tiempo real; `routeTree.gen.ts` lo regenera el plugin de TanStack Router. Las traducciones (en y es) van en `intelia/dependencies/i18n.ts`, fuera de `i18n/*.json`.
- **Tests:** `critical-path.test.ts`, `graph-model.test.ts` (incluye pruebas de ámbito de iniciativa: miembros, fronteras, canceladas ocultables y cadena), `realtime.test.ts`, `components/external-node.test.tsx`, `components/dependencies-view.test.tsx` y `components/initiative-tree.test.tsx`.

## Vista «Iniciativas»

Vista del proyecto con las iniciativas y su avance ([diseño 19](https://github.com/intelia-technologies/software-factory/blob/main/docs/design/19-vista-iniciativas.md) §5, opción 01 «Lista + inspector» de la maqueta), sobre la lectura de IN-02 (`GET /api/intelia/project/{projectId}/initiatives` y `GET /api/intelia/initiative/{initiativeId}`): una llamada por listado y una por detalle. Código en `apps/web/src/intelia/initiatives/` y las rutas `routes/.../project/$projectId/initiatives.tsx` (listado) e `initiatives_.$initiativeId.tsx` (detalle).

- **Selector de vistas:** «Dependencias» e «Iniciativas» son enlaces propios junto a Tareas y Backlog en la barra del proyecto (`project-scope-toggle.tsx`), no opciones escondidas en el menú Display; en móvil quedan como iconos con nombre accesible. Ya no son «layouts» de tareas (`TASK_LAYOUTS` los excluye) y el enlace Tareas nunca lleva a ellas (`tasksViewFor`).
- **Listado:** cuatro cifras (en vuelo, con tareas Blocked, añadidas frente a plan, canceladas) sobre las iniciativas en vuelo; una fila por iniciativa en vuelo con barra, «hechas / activas», «N plan + M añadidas» (y «sin registro»), Blocked y canceladas; búsqueda sin mayúsculas ni tildes, filtro (todas, con Blocked, con añadido) y orden (bloqueadas primero por defecto, nombre, avance). Todo el estado va en la URL (`q`, `filter`, `sort`, `selected`, `taskId`), y «← Todas las iniciativas» del detalle vuelve con la búsqueda, el orden, el filtro y la selección que tenía (`rememberListSearch`, en memoria). Secciones plegadas: finalizadas, sin trabajo activo (sin tareas o todas canceladas) y tareas sin iniciativa (abren la ficha de la tarea).
- **Inspector** (solo escritorio): plan y añadido por separado, crecimiento, tareas Blocked con su motivo (`motivo_bloqueo` y `motivo_bloqueo_detalle`, o «Sin detalle registrado»), aprobación, enlace al diseño y accesos al detalle y al árbol. **En móvil (< 768 px) no hay inspector:** tocar una fila abre el detalle.
- **Detalle:** cabecera con estado, avance, diseño, aprobación y estado del plan; **«Editar»** cambia nombre, diseño y aprobación (`PATCH /api/intelia/initiative/{initiativeId}`, solo los campos cambiados; 409 si el nombre existe, 403 sin permiso) y **«Historial»** muestra el diario (`GET …/history`) con cada cambio antes → después. Pestaña **Tareas**: plan y añadido, crecimiento y tabla con origen, clave, estado, asignado, «sin cambios de estado desde», dependencias o motivo, con filtros por origen, estado, asignado y texto («N de M»); una tarea abre la ficha de Kaneo (`TaskDetailsSheet`). Pestaña **Árbol**: `InitiativeTree` (ver «Vista «Dependencias»»), con aviso de cadena parcial o ciclo.
- **Reglas de avance** (`progress.ts`, componentes de `components/initiative-progress.tsx`): solo Done cuenta como hecha y Cancelled no entra en el porcentaje; el porcentaje nunca sale solo (siempre con «hechas / activas» y canceladas), se redondea hacia abajo y no existe sin tareas activas («sin tareas» y «todas canceladas» no muestran 0 % ni 100 %); el crecimiento es en tareas, canceladas incluidas, y no se muestra si hay tareas `sin_registro` ni sin plan («Sin base original»).
- **Tiempo real** (`realtime.ts`): sin sondeo. Con los eventos de tareas del WebSocket del proyecto se invalidan, una vez cada 5 segundos desde el primer evento (diseño 19 §6), las lecturas de iniciativas del proyecto y los historiales de iniciativa (el cierre automático del plan escribe `plan_closed`); solo se releen las que están en pantalla. El temporizador se cancela al desmontar el socket. **Al reabrir el socket** (no en la primera apertura) se releen al momento, porque pudo perder eventos. Una edición propia las invalida al momento, igual que guardar un campo personalizado en la ficha de una tarea; cerrar la ficha relee el listado o el detalle.
- **Frescura al volver:** el cliente de la app desactiva `refetchOnMount`; `useProjectInitiatives` y `useInitiative` lo activan (solo con datos obsoletos), para que una lectura invalidada con la página cerrada (por ejemplo, editar el nombre en el detalle) se relea al volver.
- **Enlace al diseño:** solo se enlaza si es http o https (`getExternalWebUrl`, componente `DesignLink`); el diálogo de edición rechaza otros esquemas (`javascript:`, `data:`, `file:`), y uno ya guardado se muestra como texto, sin enlace.
- **Registro en ficheros de upstream:** el de la vista Dependencias (arriba), el tiempo real y la reconexión en `hooks/use-project-websocket.ts`, y una línea en `use-set-custom-field-value.ts`. Traducciones (en y es) en `intelia/initiatives/**/i18n.ts`.
- **Tests:** `progress.test.ts`, `realtime.test.ts`, `refresh.test.tsx` (con las opciones reales del `QueryClient`: volver al listado tras editar y guardar solo el motivo), `list/initiatives-page.test.tsx`, `detail/initiative-detail-page.test.tsx` y, para la reconexión y el desmontaje, `hooks/use-project-websocket-lifecycle.test.tsx`.
