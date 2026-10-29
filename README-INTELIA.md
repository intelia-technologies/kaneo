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

- **Automatización semanal:** se ejecuta cada lunes a las 05:00 UTC (`0 5 * * 1`) y bajo demanda (`workflow_dispatch`).
- **Estados de sincronización:**
  - `uptodate`: la última versión de upstream ya es ancestro de `main`. No requiere acción.
  - `open`: ya existe la rama `intelia/upstream-<ref>` en el fork (con PR abierta o con una resolución manual en curso). No se sobreescribe; para regenerarla, cerrar la PR, borrar la rama y relanzar.
  - `conflicts`: hay conflictos fuera de `.github/workflows/ci.yml`. El merge se aborta, el resumen de la ejecución los lista (con anotaciones por fichero) y el workflow falla. Se resuelven a mano (ver abajo).
  - `ready`: el merge es limpio o su conflicto en `.github/workflows/ci.yml` se ha resuelto automáticamente con `forkCi()`. Se crea la PR hacia `main`.
- **Ramas e imágenes:**
  - Rama de sincronización: `intelia/upstream-<ref>` (ejemplo: `intelia/upstream-v2.49.0`).
  - Imagen candidata: ante cada push a la PR, `.github/workflows/intelia-candidate.yml` compila `Dockerfile.kaneo` (linux/amd64) y publica `ghcr.io/intelia-technologies/kaneo:candidate-<sha12>`, donde `<sha12>` son los 12 primeros caracteres del commit head de la PR.
- **Ensayo:** `gh workflow run intelia-upstream-sync.yml -f upstream_ref=main` ensaya el merge de la rama principal de upstream sin esperar a un tag. La PR de ensayo se cierra sin mergear y se borra su rama.
- **Por qué una GitHub App:** el `GITHUB_TOKEN` no puede empujar cambios en `.github/workflows/**` (casi todo merge de upstream los trae) y las PR que abre no disparan la CI. El push y la PR van con el token de la app (ver «Alta de la app de sincronización»).

Resolución manual de conflictos (siempre merge, nunca rebase):

```sh
git fetch origin
git fetch --no-tags https://github.com/usekaneo/kaneo.git tag vX.Y.Z
git checkout -b intelia/upstream-vX.Y.Z origin/main
git merge --no-ff vX.Y.Z
# si choca ci.yml: tomar el de upstream y reaplicar la adaptación del fork
git checkout --theirs .github/workflows/ci.yml && node scripts/ci/intelia-fork-ci.mjs .github/workflows/ci.yml
# resolver el resto, git add, git commit
git push origin intelia/upstream-vX.Y.Z
gh pr create --base main --head intelia/upstream-vX.Y.Z --title "chore: merge upstream vX.Y.Z"
```

## Runbook de adopción

La adopción de una nueva versión de upstream es **mensual**, o **inmediata fuera de ciclo** si upstream publica arreglos de seguridad (identificables en las notas de la release o en los avisos GHSA del repositorio upstream).

Checklist para adoptar una versión:

1. **CI de la PR en verde:** comprobar que todos los checks (`quality`, `unit`, `integration`, `smoke`, `docker-build`, `workflows`) pasan en la PR de sincronización.
2. **Tests live de la factory en verde:** verificar que los tests live de la suite de integración de la factory pasan contra la imagen candidata `candidate-<sha12>` (ejecutados en el repositorio privado de la factory).
3. **Revisión de cambios propios:** inspeccionar `git diff vX.Y.Z main` para confirmar que las adaptaciones y personalizaciones de Intelia siguen intactas.
4. **Workflows nuevos de upstream:** los que lista el cuerpo de la PR se desactivan con `gh workflow disable <fichero>` nada más hacer el merge. Si no da tiempo, los desactiva el job semanal (ver «CI y versiones»).
5. **Drizzle:** verificar que no existan migraciones propias en `apps/api/drizzle/` ni conflictos de secuencia en `meta/_journal.json`.
6. **Merge de la PR:** mergear la PR hacia `main` usando siempre **merge commit** (nunca squash ni rebase).
7. **Etiquetar release en main:** crear y subir el tag de release de Intelia:
   ```sh
   git tag -a vX.Y.Z-intelia.1 -m vX.Y.Z-intelia.1 origin/main
   git push origin vX.Y.Z-intelia.1
   ```
8. **Despliegue:** el despliegue efectivo a los entornos se gestiona desde `software-factory`.

## Alta de la app de sincronización

Configuración única inicial de operaciones (ops):

1. **Crear la GitHub App:**
   - En la organización Intelia, crear una GitHub App dedicada para la sincronización.
   - Permisos de repositorio requeridos:
     - **Contents:** Read and write (para crear ramas y empujar commits de merge).
     - **Pull requests:** Read and write (para abrir la PR de actualización).
     - **Workflows:** Read and write (para actualizar `.github/workflows/**` en los merges).
     - **Metadata:** Read-only.
2. **Instalación:** instalar la App exclusivamente en el repositorio `intelia-technologies/kaneo`.
3. **Entorno en GitHub:** configurar en el repositorio el entorno `upstream-sync` con política de despliegue restringida a la rama `main`:
   - Variable de entorno: `KANEO_SYNC_APP_ID` (App ID numérico).
   - Secreto de entorno: `KANEO_SYNC_APP_PRIVATE_KEY` (clave privada PEM de la App).
4. **Rotación de claves:** para rotar la clave, generar un nuevo par de claves en la GitHub App, actualizar el secreto `KANEO_SYNC_APP_PRIVATE_KEY` en el entorno `upstream-sync` y revocar la clave anterior tras validar la sincronización.

## CI y versiones

- **CI:** el `.github/workflows/ci.yml` de upstream entero (`quality`, `unit`, `integration`, `smoke` y el resto de sus jobs), en push a `main` y en cada PR. Upstream corre en runners de Blacksmith, que el fork no tiene; la única diferencia es esta sustitución:

  | Upstream | Fork |
  |---|---|
  | `runs-on: blacksmith-4vcpu-ubuntu-2404` | `runs-on: ubuntu-24.04` |
  | `useblacksmith/checkout` | `actions/checkout` |
  | `useblacksmith/setup-docker-builder` | `docker/setup-buildx-action` |
  | `useblacksmith/build-push-action` | `docker/build-push-action` |

- **Prueba de actualización** (`scripts/ci/upgrade.sh`, job `docker-build`): parte de la imagen de upstream de la versión de `package.json` (`ghcr.io/usekaneo/kaneo:X.Y.Z`, la que lleva dentro el fork) en vez de la última release del repo, con `KANEO_UPGRADE_REPOSITORY` y `KANEO_UPGRADE_TAG`.
- **Resto de workflows de upstream** (publicación en npm, Helm, la web, avisos a Discord, bots de PR, nightly…): desactivados en Actions del fork, no borrados, para que el merge de upstream no choque. Activos: `CI`, `Intelia release`, `Intelia upstream sync`, `Intelia candidate image` y CodeQL. GitHub solo registra un workflow (y deja desactivarlo) cuando le llega su primer evento: por eso el job `disable-workflows` de `intelia-upstream-sync.yml` desactiva cada lunes todo workflow activo que no sea uno de esos (`node scripts/ci/intelia-upstream-sync.mjs disable-workflows`, con el `GITHUB_TOKEN` y `actions: write`). Así quedan cubiertos los que aún no se han registrado (`nightly`, `update-contributors`, `deploy-site`, `release-notify`, `issue-notify`, `helm-chart`, `docker`, `code-review`, `ui-review`…) y los que traiga un merge de upstream.
- **Versión** (`.github/workflows/intelia-release.yml`): al empujar un tag `vX.Y.Z-intelia.N` comprueba que el commit está en `main` con la CI en verde y que `X.Y.Z` es la versión de `package.json`; construye `Dockerfile.kaneo` (amd64 y arm64) y publica `ghcr.io/intelia-technologies/kaneo:X.Y.Z-intelia.N` con el `GITHUB_TOKEN` del propio fork. El digest queda en el resumen de la ejecución. El fork contiene únicamente la credencial de la GitHub App de sincronización, en el entorno `upstream-sync`, acotada a este repositorio; nada más. El despliegue se gestiona desde `software-factory`.

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
