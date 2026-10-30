# Kaneo — fork de Intelia

Este repositorio es el fork de [Kaneo](https://github.com/usekaneo/kaneo) que mantiene Intelia (`intelia-technologies/kaneo`). Desplegamos Kaneo desde nuestras imágenes, no desde las públicas. Diseño de referencia: [diseño 11: fork de Kaneo](https://github.com/intelia-technologies/software-factory/blob/main/docs/design/11-fork-kaneo.md) en `intelia-technologies/software-factory`.

Además de este fichero, el fork solo añade sus workflows `intelia-*.yml` y sus scripts `scripts/ci/intelia-*` (ver «CI y versiones»). El `README.md` original y el `ci.yml` de upstream se conservan intactos.

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

Para incorporar una versión nueva de upstream:

```sh
git remote add upstream https://github.com/usekaneo/kaneo.git   # una sola vez
git fetch upstream --tags
git checkout -b upstream/vX.Y.Z main
git merge vX.Y.Z          # merge, nunca rebase
# PR hacia main; .github/workflows/ci.yml es el de upstream, nunca choca
```

## CI y versiones

**Lista blanca de Actions:** en el fork solo están activos los `intelia-*.yml` y CodeQL (`dynamic/github-code-scanning/codeql`). Todo lo demás de upstream, `ci.yml` incluido, está desactivado en Actions con `gh workflow disable`, no borrado, para que el merge de upstream no choque. Si upstream añade un workflow nuevo, se desactiva igual. Comprobación:

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
| CodeQL (setup por defecto) | cada PR y push a `main`, y semanal | solo `javascript-typescript` (Settings → Code security → CodeQL analysis). |

- **Escaneo de secretos** (`scripts/ci/intelia-secret-scan.sh`, TruffleHog 3.97.9 con `--no-update`): en las PR, desde la base de la PR; en push a `main`, desde el commit anterior; a mano o en la versión, desde el merge-base con `main`. Falla solo con hallazgos verificados o sin verificar por error que no estén en `scripts/ci/intelia-secret-baseline.tsv`, y los lista en el resumen y como anotaciones, sin el valor. La línea base tiene detector, commit, fichero y línea de los 49 candidatos del historial de upstream en `v2.48.0`: todos los marca el detector de GitLab sobre identificadores de código o el de URI sobre URL de ejemplo en tests. Cuáles salen en cada ejecución depende del límite de peticiones de GitLab al verificar (HTTP 429), por eso están todos. Un falso positivo nuevo se añade a la línea base tras comprobar que no es una credencial; uno real se rota.
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
- Si upstream acepta una función nuestra, se migra de nuestras tablas a las suyas con una migración propia que mueve los datos.
