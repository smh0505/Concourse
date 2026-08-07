# Concourse

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) |
[简体中文](README.zh-Hans.md) | [Français](README.fr.md) | [Deutsch](README.de.md) |
[Português (Brasil)](README.pt-BR.md) | [Русский](README.ru.md) | [Italiano](README.it.md)

*Esta traducción es una traducción automática (el mismo enfoque divulgado que los propios
locales de la interfaz de la app - ver [Localization](#funcionalidades) más abajo), aún sin
revisión por hablantes nativos.*

Una aplicación de escritorio que reúne juegos de múltiples fuentes (Steam, Epic, GOG, entradas
manuales y más a través de plugins) en una única biblioteca unificada, con un modo "Big Picture"
de estilo consola pensado ante todo para mando - similar en espíritu a Playnite o a la propia
biblioteca de Steam.

La app principal se mantiene ligera; casi todo lo que va más allá de la biblioteca base
(escáneres de fuentes, temas, proveedores de metadatos, mapeos de controlador, wrappers de
compatibilidad) es un plugin.

## Funcionalidades

- **Núcleo de biblioteca** - "añadir juego" manual, almacenamiento respaldado por SQLite,
  vistas de cuadrícula y lista, etiquetado, búsqueda/filtrado
- **Metadatos y medios** - carátula vía SteamGridDB, descripción/género/fecha de lanzamiento
  vía IGDB, anulación manual
- **Lanzamiento y seguimiento de tiempo jugado** - lanzamiento unificado sin importar la fuente
  (exe directo, URIs `steam://` de Steam, manejadores de protocolo de Epic/GOG, juegos
  lanzados mediante wrapper de compatibilidad), con seguimiento de tiempo jugado basado en el
  cierre del proceso o en la carpeta según cómo se haya lanzado el juego
- **Modo Big Picture** - interfaz de pantalla completa navegable con mando, con cuadrícula de
  mosaicos y una vista de diapositivas tipo coverflow, transición cruzada del arte de fondo,
  interruptor de auto-lanzamiento al inicio
- **Wrappers de compatibilidad** - perfiles de Locale Remulator / Locale Emulator por juego
  para títulos que necesitan un idioma/región no predeterminado para funcionar
- **Sistema de plugins** - cinco tipos de plugin (fuente, tema, proveedor de metadatos,
  mapeo de controlador, wrapper de compatibilidad), cargados ya sea en tiempo de compilación
  (plugins de TypeScript empaquetados bajo `src/plugins/`) o en tiempo de ejecución (plugins
  de WebAssembly descargables - ver más abajo)
- **Localización** - interfaz disponible en 10 idiomas (inglés más 9 locales traducidos
  automáticamente), un `--font-family` configurable desde el tema para re-skinning de toda la
  app, y un nivel de tema solo de datos (`cssVariables` + una anulación opcional de
  `cardVisual` en JSON-AST para la región de la carátula, sin necesidad de código)
- **Traducción sin conexión** - el título/descripción de un juego pueden traducirse al idioma
  actual de la interfaz completamente en el propio dispositivo (sin servicio externo):
  descarga una vez el binario de servidor precompilado de llama.cpp, elige un modelo (varios
  niveles amigables con la CPU, uno sin censura para descripciones de juegos NSFW), y luego
  traduce/alterna la vista/revoca el título y el contenido de forma independiente desde la
  página de detalle del juego. Las traducciones se conservan por juego y por campo, y se
  invalidan automáticamente al cambiar de idioma o editar el original
- **Actualización automática** - tanto la propia app como cada plugin/tema instalado
  comprueban y aplican actualizaciones automáticamente

## Stack tecnológico

- **Tauri 2** (backend en Rust) + frontend **Vue 3** (`<script setup>`, TypeScript)
- **SQLite** vía `tauri-plugin-sql`, con el esquema evolucionando mediante migraciones
  versionadas
- **Pinia** para el estado del frontend, un store por dominio
- **wasmtime** (Wasm Component Model) para el sistema de plugins descargables en tiempo de
  ejecución

## Desarrollo

Este repositorio usa [`bun`](https://bun.sh), no npm/yarn/pnpm.

```sh
bun install          # instalar dependencias de JS
bun run dev           # solo el servidor de desarrollo de Vite (frontend)
bunx tauri dev         # app completa (frontend + backend Rust), con recarga en caliente
bunx tauri build        # binario de escritorio de producción
```

Desde `src-tauri/`: `cargo check` para una comprobación rápida de compilación de Rust sin una
build completa.

## Arquitectura de plugins

Cada plugin tiene un manifiesto `plugin.json` (`{ id, name, version, kind, entry }`) e
implementa una de cinco interfaces según `kind`:

- `source` - `scan()` / `launch()` / `getInstallStatus()`, para integraciones de fuentes de
  juegos (activación múltiple)
- `theme` - variables CSS (colores, fuentes, bordes/radios) más una anulación opcional en
  JSON-AST de `cardVisual` para la región de la carátula (activación única); un manifiesto
  que solo tenga `cssVariables` no necesita código alguno. Las anulaciones de slot de
  componente (sustituir un componente Vue personalizado completo) se soportaron al principio,
  pero se retiraron en favor de este nivel de AST de vocabulario cerrado - no existe ninguna
  ruta de código eval/ejecutable para que un tema inyecte código
- `metadata` - `fetchMetadata(title)`, para proveedores de carátula / descripción / género
  (activación múltiple)
- `controller` - un `GamepadMapping` (índices de botones/ejes) para un diseño físico de
  controlador específico (activación única)
- `wrapper` - wrappers de compatibilidad (p. ej. Locale Remulator/Emulator) que gestionan su
  propia instalación y lanzan un ejecutable objetivo a través de un perfil de idioma/región

Los plugins de tiempo de compilación viven bajo `src/plugins/<id>/` y se descubren vía
`import.meta.glob` de Vite. Los plugins en tiempo de ejecución son componentes WebAssembly
(tipos `source`/`wrapper`/`metadata`) instalados desde una URL de manifiesto (Configuración →
la pestaña correspondiente → Añadir plugin) o descargados/extraídos manualmente en el
directorio de datos de la app, cargados mediante un host `wasmtime` embebido en el backend de
Rust. Los temas solo de datos (solo `cssVariables`, sin código) son un nivel de instalación por
URL independiente, sin código, que no necesita ningún sandboxing WASM.

### Plugins oficiales

Consulta **[Official Plugins](https://smh0505.github.io/Concourse/guide/official-plugins)** en
el sitio de documentación para la lista completa (enlaces al repositorio, enlaces de descarga
de la última versión, instrucciones de instalación).

**Nota de seguridad (Milestone 12, cerrado):** el sandbox del Component Model de wasmtime
garantiza la seguridad de memoria (un plugin no puede corromper la memoria del host ni escapar
de su propia ejecución), y toda función del host expuesta a los plugins que pudiera causar daño
real ahora está controlada por permisos:
- `spawn-process`/`run-and-wait` necesitan una concesión explícita y visible por plugin - un
  plugin debe declarar `capabilities: ["run-programs"]` en su manifiesto, y la app se niega a
  ejecutar nada en su nombre hasta que realmente se lo hayas concedido (una casilla en el
  diálogo de confirmación de instalación para instalación por URL, o una fila "Se necesita
  permiso" con un botón Conceder en Configuración para un plugin ya instalado).
- `write-file`/`remove-dir` están confinados de forma estricta e incondicional al propio
  directorio del plugin, sin excepciones. `read-file`/`list-dir`/`path-exists`/acceso al
  registro se limitan a una lista blanca declarada en el manifiesto (`pathScopes`), más, para
  el único plugin cuya ubicación de instalación genuinamente no se puede conocer de antemano
  (Steam), una solicitud de alcance en tiempo de ejecución verificada - el host comprueba una
  firma estructural real (un subdirectorio `steamapps`) antes de conceder acceso, y rechaza
  directamente cualquier id de plugin para el que no tenga un validador.
- `http-get`/`http-request`/`download-bytes` se limitan a una lista blanca de nombres de host
  declarada en el manifiesto (`httpScopes`) - un plugin solo puede alcanzar los hosts que
  declara (coincidencia exacta o subdominio), no una URL arbitraria controlada por un atacante.

Instala solo plugins de fuentes en las que confíes plenamente de todos modos - esto cierra "un
plugin puede alcanzar silenciosamente cualquier parte de tu sistema o red", no es un modelo de
confianza de nivel app-store completo.

**Modelo de confianza (Milestone 13, cerrado):** dos capas complementarias e independientes.
- **Firma** - cada lanzamiento oficial de plugin se firma con una atestación de procedencia de
  build de [Sigstore](https://www.sigstore.dev/), vinculando el `.wasm` publicado al commit
  exacto y la ejecución de CI que lo construyó. Concourse comprueba esto al instalar y muestra
  el resultado - **solo informativo, no una barrera obligatoria**. Confirma que un artefacto
  realmente vino de la propia CI de ese repositorio, sin modificaciones desde entonces (detecta
  manipulaciones, un token de lanzamiento comprometido, un repositorio secuestrado que cuela
  una build maliciosa) - **no** avala las intenciones del autor del repositorio. El propio
  código de un autor malicioso también obtiene una firma perfectamente válida, ya que su propia
  CI realmente construyó y firmó exactamente lo que él mismo hizo commit.
- **Registro curado** -
  [`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry), una
  lista mantenida a mano de plugins cuya versión fijada realmente se ha leído, cada entrada
  bloqueada a un lanzamiento específico y su SHA256 real. El diálogo "Añadir plugin" muestra
  estas entradas junto al campo de URL libre; instalar desde el registro es un **rechazo
  estricto** si el hash no coincide, a diferencia de la comprobación informativa de la firma -
  este hash se eligió a mano tras una revisión, así que una discrepancia es una señal real de
  "esto no es lo que se revisó". Retirar una entrada del registro *es* una revocación para
  futuras instalaciones (aún no retroactiva contra copias ya instaladas). La instalación por
  URL libre sigue funcionando exactamente igual que antes en cualquier caso - el registro es
  una ruta adicional, más confiable, no una barrera obligatoria.

## Documentación

La documentación completa para desarrolladores de plugins y usuarios se publica en
**[smh0505.github.io/Concourse](https://smh0505.github.io/Concourse/)** (fuente en
[`docs/`](docs/), construida con VitePress) - una guía de usuario (instalación, gestión de la
biblioteca, modo Big Picture) y una referencia para desarrolladores de plugins (resumen de
arquitectura, guía de inicio, la referencia completa de manifiesto/interfaz WIT, el modelo de
seguridad, y cómo publicar un plugin).

## Estado

En desarrollo activo, hito a hito. Consulta
[`.claude/proposal.md`](.claude/proposal.md) para la propuesta de diseño original,
[`.claude/milestones.md`](.claude/milestones.md) para el seguimiento de progreso actualizado
frente a ella, y [`.claude/devlog.md`](.claude/devlog.md) para el historial de
implementación/razonamiento detrás de cada elemento de hito.

A día de hoy: la biblioteca principal, el seguimiento de metadatos/tiempo jugado, el modo Big
Picture, el sistema de plugins (incluyendo el pipeline de plugins en tiempo de ejecución
WebAssembly y la instalación gestionada de los wrappers de compatibilidad), el sandboxing de
permisos de plugins WASM (Milestone 12), un modelo de confianza/firma de plugins
(Milestone 13), un pase continuo de pulido de la interfaz de escritorio (Milestone 14), el
nivel de tema JSON-AST que reemplaza el theming por intercambio de componentes
(Milestones 17/19), un pase de convención de estilos compartidos (Milestone 18), la
actualización automática de la app + plugins/temas (Milestone 20), la localización en 10
idiomas más la traducción sin conexión en el propio dispositivo de títulos/descripciones de
juegos (Milestone 21), y este sitio de documentación (Milestone 22) están todos completos.
Todos los plugins oficiales listados arriba están en producción. El trabajo pendiente incluye
un plugin de escáner de emuladores/ROM y plugins de fuente adicionales (Xbox/EA/Ubisoft,
Milestone 16).

## Licencia

MIT - ver [`LICENSE`](LICENSE).

### Avisos de terceros

El propio código fuente de Concourse tiene licencia MIT; no se empaqueta contenido de terceros
ni en el repositorio ni en el binario compilado. La función de traducción sin conexión
(Milestone 21) descarga dos tipos de contenido de terceros directamente a tu máquina en tiempo
de ejecución, bajo sus propios términos separados - se cubre aquí por transparencia, no porque
Concourse redistribuya nada de esto:

- **[llama.cpp](https://github.com/ggml-org/llama.cpp)** (MIT) - el propio motor de
  traducción. Concourse descarga su binario de lanzamiento oficial precompilado para Windows
  desde GitHub y lo ejecuta como un subproceso; ningún código de llama.cpp se compila en
  Concourse ni se distribuye con él.
- **Los pesos de los modelos**, descargados desde Hugging Face según tu propia selección en
  Configuración, cada uno bajo la licencia de su propia ficha de modelo -
  `qwen2.5-1.5b`/`qwen3-4b`/`gemma4-e2b` son todos Apache 2.0 (Gemma 4 pasó específicamente a
  Apache 2.0 en abril de 2026, reemplazando la licencia más restrictiva bajo la que se
  distribuían las generaciones anteriores de Gemma). Los dos niveles sin censura
  (`qwen3-4b-abliterated`, `gemma4-e2b-abliterated`) heredan la licencia de su modelo base;
  comprueba la ficha de modelo de Hugging Face de cada uno antes de usarlo comercialmente.
