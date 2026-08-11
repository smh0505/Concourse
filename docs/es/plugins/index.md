# Visión general de la arquitectura de plugins

Concourse agrupa juegos de muchas fuentes en una sola biblioteca, y se re-skinnea a sí misma, a
través de un único sistema de plugins con cinco tipos. Todos los tipos comparten un mismo formato
de manifiesto y un mismo cargador; lo que cambia es el contrato que implementa un plugin de ese
tipo.

## Los cinco tipos de plugin

| Tipo | Función | Selección |
|---|---|---|
| `source` | Escanea una plataforma (Steam, GOG, Epic, ...) en busca de juegos instalados, los lanza | multi-habilitado |
| `theme` | Cambia colores/fuentes/visuales de las tarjetas | exclusivo (uno activo a la vez) |
| `metadata` | Obtiene descripción/fecha de lanzamiento/arte de un juego desde una base de datos externa | multi-habilitado |
| `controller` | Mapea botones/ejes físicos del gamepad para la navegación de Big Picture | exclusivo |
| `wrapper` | Lanza un juego a través de una capa de compatibilidad que gestiona él mismo (p. ej. un emulador de configuración regional) | multi-habilitado |

Los plugins de source y de proveedor de metadatos se habilitan de forma independiente y
**múltiple** (casillas en Settings) — puedes ejecutar varios plugins de origen y varios
proveedores de metadatos a la vez, cada uno aportando juegos/campos que los demás no. Los plugins
de theme y de mapeo de controlador son de **selección única exclusiva** (radio) — siempre estás
viendo un skin y usando un esquema de entrada física a la vez.

## Dos formas de distribuir un plugin

1. **Plugin WASM** — un componente `.wasm` instalado por separado, descargado por URL (o a
   través del registro seleccionado) en tiempo de ejecución, que se ejecuta en una instancia
   aislada (sandboxed) del Component Model de [wasmtime](https://wasmtime.dev/). Esta es la vía
   actual para plugins de terceros de tipo `source`/`wrapper`/`metadata` — consulta
   [Primeros pasos](./getting-started) y la referencia de la [Interfaz WIT](./wit-interface).
2. **Manifiesto de tema solo con datos** — para plugins `theme` específicamente, un manifiesto
   puede ser JSON puro (`cssVariables`/`cardVisual`/`fontFaces`, sin ningún código) si no
   necesita toda la maquinaria de un plugin WASM completo. Consulta
   [Manifiestos de tema](./theme-manifests).

Los plugins WASM solo existen para los tres tipos para los que se ha definido un
[mundo WIT](https://component-model.bytecodealliance.org/design/wit.html) hasta ahora: `source`,
`wrapper`, `metadata`. Construir un plugin `theme` de terceros hoy significa usar la vía del
manifiesto solo con datos descrita arriba. Actualmente no existe una vía de terceros para plugins
de mapeo `controller` - los mapeos de gamepad integrados de Concourse están compilados
directamente dentro de la app, y añadir uno nuevo hoy significa contribuir al propio Concourse en
lugar de distribuir un plugin separado.

## Por qué WASM, y no código nativo o scripting

Concourse llegó a considerar ejecutables nativos descargables y un lenguaje de scripting para
plugins de terceros. Ambos fueron rechazados por la misma razón: un plugin necesita acceso real
al sistema de archivos/registro/red/procesos para hacer su trabajo (escanear una instalación de
Steam, lanzar un juego a través de un wrapper), y ninguna de las dos opciones puede conceder
acceso *acotado* — un binario nativo o un script sin aislamiento obtiene los mismos privilegios
que toda la app. WASM a través del Component Model consigue en cambio un aislamiento genuino
basado en capacidades: un plugin solo obtiene una función de la interfaz `host` si el lado Rust
de Concourse la implementa y se la concede, e incluso entonces, la mayoría de las funciones están
además acotadas por plugin (consulta el [Modelo de seguridad](./security-model)).

## Siguientes pasos

- [Primeros pasos](./getting-started) — construye un plugin de origen WASM mínimo de principio a fin
- [Referencia del manifiesto](./manifest-reference) — todos los campos de `plugin.json`
- [Manifiestos de tema](./theme-manifests) — `cssVariables`/`cardVisual`/`fontFaces` para plugins de tema
- [Interfaz WIT](./wit-interface) — la superficie real de capacidades del host y los mundos de plugin
- [Modelo de seguridad](./security-model) — alcances de rutas, control de capacidades, firmas
- [Publicación](./publishing) — cómo enviar tu plugin al registro seleccionado
