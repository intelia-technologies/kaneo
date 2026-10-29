# Kaneo — fork de Intelia

Este repositorio es el fork de [Kaneo](https://github.com/usekaneo/kaneo) que mantiene Intelia (`intelia-technologies/kaneo`). Desplegamos Kaneo desde nuestras imágenes, no desde las públicas. Diseño de referencia: [diseño 11: fork de Kaneo](https://github.com/intelia-technologies/software-factory/blob/main/docs/design/11-fork-kaneo.md) en `intelia-technologies/software-factory`.

Además de este fichero, el fork solo adapta la CI de upstream a runners de GitHub y añade el workflow de versión (ver «CI y versiones»). El `README.md` original se conserva intacto.

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
# PR hacia main; si ci.yml choca, tomar el de upstream y reaplicar la tabla de «CI y versiones»
```

## CI y versiones

- **CI:** el `.github/workflows/ci.yml` de upstream entero (`quality`, `unit`, `integration`, `smoke` y el resto de sus jobs), en push a `main` y en cada PR. Upstream corre en runners de Blacksmith, que el fork no tiene; la única diferencia es esta sustitución:

  | Upstream | Fork |
  |---|---|
  | `runs-on: blacksmith-4vcpu-ubuntu-2404` | `runs-on: ubuntu-24.04` |
  | `useblacksmith/checkout` | `actions/checkout` |
  | `useblacksmith/setup-docker-builder` | `docker/setup-buildx-action` |
  | `useblacksmith/build-push-action` | `docker/build-push-action` |

- **Prueba de actualización** (`scripts/ci/upgrade.sh`, job `docker-build`): parte de la imagen de upstream de la versión de `package.json` (`ghcr.io/usekaneo/kaneo:X.Y.Z`, la que lleva dentro el fork) en vez de la última release del repo, con `KANEO_UPGRADE_REPOSITORY` y `KANEO_UPGRADE_TAG`.
- **Resto de workflows de upstream** (publicación en npm, Helm, la web, avisos a Discord, bots de PR, nightly…): desactivados en Actions del fork con `gh workflow disable`, no borrados, para que el merge de upstream no choque. Activos: `CI`, `Intelia release` y CodeQL. Si upstream añade un workflow nuevo, se desactiva igual.
- **Versión** (`.github/workflows/intelia-release.yml`): al empujar un tag `vX.Y.Z-intelia.N` comprueba que el commit está en `main` con la CI en verde y que `X.Y.Z` es la versión de `package.json`; construye `Dockerfile.kaneo` (amd64 y arm64) y publica `ghcr.io/intelia-technologies/kaneo:X.Y.Z-intelia.N` con el `GITHUB_TOKEN` del propio fork. El digest queda en el resumen de la ejecución. El fork no guarda credenciales de Intelia ni avisa a nadie: el despliegue se lanza desde `software-factory`.

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
