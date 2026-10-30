# Kaneo — fork de Intelia

Este repositorio es el fork de [Kaneo](https://github.com/usekaneo/kaneo) que mantiene Intelia (`intelia-technologies/kaneo`). Desplegamos Kaneo desde nuestras imágenes, no desde las públicas. Diseño de referencia: [diseño 11: fork de Kaneo](https://github.com/intelia-technologies/software-factory/blob/main/docs/design/11-fork-kaneo.md) en `intelia-technologies/software-factory`.

Además de este fichero, el fork añade sus funciones propias (ver «Reacciones en comentarios y tarjetas», «Relaciones por proyecto», «Foto de perfil con API key» y «Rutinas programadas»), sus workflows `intelia-*.yml` y sus scripts `scripts/ci/intelia-*` (ver «CI y versiones» y «Puesta al día con upstream»). El `README.md` original y el `ci.yml` de upstream se conservan intactos.

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
  - `apps/api/src/scheduler/index.ts`: el job de las rutinas programadas. `apps/api/src/plugins/generic-webhook/events.ts`: `export` de `sendEvent`, para mandar `intelia.routine_skipped` con el sobre y la firma de upstream.
  - `Dockerfile.kaneo` y `apps/api/Dockerfile`: `COPY` de `drizzle-intelia`. `vite.config.ts`: ignora `drizzle-intelia/meta/**`.
  - `apps/web/src/components/activity/comment-card.tsx` e `index.tsx`, y `apps/web/src/components/task/task-details-content.tsx`: las fichas de reacciones y el panel «Programación» de las rutinas.
  - `apps/web/src/components/nav-main.tsx`: el enlace a la pantalla «Rutinas».
  - `apps/web/src/components/project/views/project-views.ts`, `layout-switch.tsx`, `store/user-preferences.ts` y `hooks/use-project-websocket.ts`: el registro y el tiempo real de la vista «Dependencias».
  - `tests/api-integration/helpers/database.ts`: migrador `intelia` en los tests de integración.
  - `scripts/ci/upgrade.sh`: versión de partida configurable para la prueba de actualización.
  - Generados o de datos: `apps/docs/openapi.json` (regenerado) y las claves `activity.reactions.*` en `i18n/*.json`.

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
| `intelia-integration.yml` | lo llama la versión, a mano, y en las PR que lo cambian | `pnpm test:integration` contra PostgreSQL. En runners de GitHub tarda ~12 min, demasiado para cada PR. |
| `intelia-secret-scan.yml` | lunes 04:17 UTC y a mano | TruffleHog sobre todo el historial de `main`. |
| `intelia-release.yml` | tag `vX.Y.Z-intelia.N` | ver «Versión». |
| `intelia-upstream-sync.yml` | lunes 05:00 UTC y a mano | `disable-workflows` (lista blanca) y preparación del merge de upstream (ver «Puesta al día con upstream»). |
| `intelia-candidate.yml` | PR desde `intelia/upstream-*` y lo llama la puesta al día | imagen candidata `candidate-<sha12>` para los tests de la factory. |
| CodeQL (setup por defecto) | cada PR y push a `main`, y semanal | solo `javascript-typescript` (Settings → Code security → CodeQL analysis). |

- **Escaneo de secretos** (`scripts/ci/intelia-secret-scan.sh`, TruffleHog 3.97.9 con `--no-update`): en las PR, desde la base de la PR; en push a `main`, desde el commit anterior (si ya no existe, por un force-push, todo el historial: nunca un rango vacío); a mano o en la versión, desde el merge-base con `main`. Falla solo con hallazgos verificados o sin verificar por error que no estén en `scripts/ci/intelia-secret-baseline.tsv`, y los lista en el resumen y como anotaciones, sin el valor. La línea base tiene detector, commit, fichero y línea de los 49 candidatos del historial de upstream en `v2.48.0`: todos los marca el detector de GitLab sobre identificadores de código o el de URI sobre URL de ejemplo en tests. Cuáles salen en cada ejecución depende del límite de peticiones de GitLab al verificar (HTTP 429), por eso están todos. Un falso positivo nuevo se añade a la línea base tras comprobar que no es una credencial; uno real se rota.
- **Prueba de actualización** (`scripts/ci/upgrade.sh`, job `docker-build`): parte de la imagen de upstream de la versión de `package.json` (`ghcr.io/usekaneo/kaneo:X.Y.Z`, la que lleva dentro el fork) en vez de la última release del repo, con `KANEO_UPGRADE_REPOSITORY` y `KANEO_UPGRADE_TAG`.
- **Lo que no corre de upstream** (en `ci.yml`, desactivado): Chromium smoke (e2e de Playwright, ~4 min; `docker-build` ya prueba la imagen en un navegador con `browser.mjs`), `storage` (subidas firmadas contra S3: no las cambiamos y upstream las prueba), `split-images` (imágenes `apps/api` y `apps/web` sueltas: solo publicamos `Dockerfile.kaneo`), `peekareq-tests` y `slop-labeler-tests` (bots de upstream, desactivados en el fork), `detect-pr-changes` y `ci-result` (atajos y puerta de upstream; sin protección de rama no hacen falta). `ci.yml` no se reactiva: sus runners son de Blacksmith y el fork no los tiene.
- **Versión** (`.github/workflows/intelia-release.yml`): al empujar un tag `vX.Y.Z-intelia.N` comprueba que el commit está en `main` y que `X.Y.Z` es la versión de `package.json`; corre `intelia-ci.yml` e `intelia-integration.yml` sobre ese commit y, **solo si los dos pasan**, construye `Dockerfile.kaneo` (amd64 y arm64) y publica `ghcr.io/intelia-technologies/kaneo:X.Y.Z-intelia.N` con el `GITHUB_TOKEN` del propio fork. El digest queda en el resumen de la ejecución. El fork no guarda credenciales de Intelia ni avisa a nadie: el despliegue se lanza desde `software-factory`.

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

### Migrador del esquema `intelia`

| Qué | Dónde |
|---|---|
| Tablas (Drizzle) | `apps/api/src/intelia/schema.ts`, con `inteliaSchema.table(...)` |
| Migraciones y su diario | `apps/api/drizzle-intelia/` y `apps/api/drizzle-intelia/meta/_journal.json` |
| Registro de aplicadas | tabla `intelia.__intelia_migrations` (la de upstream es `drizzle.__drizzle_migrations`) |
| Migrador | `migrateInteliaSchema` en `apps/api/src/intelia/migrate.ts`, llamado en `runStartupTasks` (`apps/api/src/index.ts`) justo después del de upstream |
| Configuración de drizzle-kit | `apps/api/drizzle-intelia.config.ts` |

Para generar una migración nueva, tras cambiar `apps/api/src/intelia/schema.ts`:

```sh
cd apps/api
pnpm exec drizzle-kit generate --config drizzle-intelia.config.ts --name <nombre>
```

Nunca con `pnpm db:generate` ni con `drizzle.config.ts`: esos escriben en el diario de upstream. La primera migración (`0000_intelia_schema`) es `CREATE SCHEMA IF NOT EXISTS`, porque el migrador crea el esquema antes para guardar su registro.

El test `tests/api-integration/intelia-schema-migrations.test.ts` reproduce el arranque en una base de datos aparte y simula el merge de una versión de upstream con una migración nueva: se aplican las de los dos.

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
  - **Ficheros de upstream:** dos líneas en `task-details-content.tsx` (el panel) y dos en `nav-main.tsx` (el enlace); `routeTree.gen.ts` lo regenera el plugin de TanStack Router. Las traducciones (en y es) van en `intelia/routines/i18n.ts`, con el registro común de `intelia/i18n.ts`.
  - **Tests:** `schedule.test.ts` y `components/routine-panel.test.tsx`.
- **Test:** `tests/api-integration/intelia-routines.test.ts`, con un receptor HTTP real que comprueba la firma, y los casos de fallo cerrado: inicio de sesión y clave de API de la cuenta rechazados, email reservado ocupado por un usuario registrado (ningún tick reabre y ese usuario queda intacto), instancia vacía (la primera persona sigue siendo administradora), invariantes rotos y recurrencia añadida después.

## Vista «Dependencias»

Vista más del proyecto (junto a Board, List, Calendar y Gantt) que dibuja las dependencias `blocks` de izquierda a derecha con `@xyflow/react` y `@dagrejs/dagre`, a partir de `GET /api/intelia/project/{projectId}/relations`. Código en `apps/web/src/intelia/dependencies/` y la ruta `routes/.../project/$projectId/dependencies.tsx`.

- **Nodos:** las tareas del proyecto que pasan los filtros de la barra (también los campos personalizados). Hechas en gris; canceladas (columna final con slug `cancelled` o `canceled`) en gris con borde discontinuo. **Bloqueada:** columna `blocked` o alguna tarea que la bloquea sin terminar, aunque esté oculta por el filtro o sea de otro proyecto. Las tareas de otros proyectos salen como nodo pequeño con enlace.
- **Aristas:** solo `blocks`, si sus dos extremos están visibles. Las tareas sin aristas se ocultan; el interruptor «Loose tasks» del menú Display las enseña.
- **Camino crítico** (`critical-path.ts`): la cadena más larga de tareas no terminadas (columna no final) entre las visibles, peso 1 por tarea; en empate, la de mayor suma de prioridades (`urgent` 4 … `no-priority` 0) y, después, la de ids menores. Orden topológico iterativo (Kahn) y programación dinámica con enlace al mejor sucesor: sin recursión, para miles de tareas. Si hay un ciclo entre los nodos visibles, también los de otros proyectos, se avisa y no se calcula.
- **Clic** en un nodo: abre la tarea en el panel lateral (`?taskId=`), como en Gantt. En un nodo de otro proyecto (también con Intro o Espacio) abre el tablero de ese proyecto con la ficha de la tarea.
- **Carga:** si fallan las relaciones, la vista lo dice y ofrece reintentar; no dibuja un grafo vacío.
- **Tiempo real** (`realtime.ts`): sin socket propio. El WebSocket del proyecto (`useProjectWebSocket`) ya mantiene las tareas en la caché del tablero; con `TASK_CREATED`, `TASK_UPDATED`, `TASK_DELETED`, `TASK_MOVED` y `TASK_RELATION_UPDATED` además invalida las relaciones del proyecto, una vez por ráfaga (250 ms desde el primer evento). La página agrupa igual los cambios de tareas y relaciones, así que el layout de `dagre` se recalcula una vez por ráfaga; los filtros y el interruptor se aplican al momento. Tras una reconexión, las relaciones se releen al volver el foco o la red (React Query).
- **Registro en ficheros de upstream:** `project-views.ts`, `store/user-preferences.ts` y `layout-switch.tsx`, y dos líneas en `hooks/use-project-websocket.ts` para el tiempo real; `routeTree.gen.ts` lo regenera el plugin de TanStack Router. Las traducciones (en y es) van en `intelia/dependencies/i18n.ts`, fuera de `i18n/*.json`.
- **Tests:** `critical-path.test.ts`, `graph-model.test.ts`, `realtime.test.ts`, `components/external-node.test.tsx` y `components/dependencies-view.test.tsx`.
