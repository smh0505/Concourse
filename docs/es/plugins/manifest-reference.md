# Referencia del manifiesto

Todo plugin — TypeScript integrado, WASM, o un tema solo con datos — se describe mediante un
manifiesto `plugin.json`. Esta página documenta todos los campos que entiende el cargador de
Concourse (fuente: la interfaz `PluginManifest` de `src/plugins/manifest.ts`).

## Campos principales (todo plugin)

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `id` | `string` | sí | Identificador único. Se usa como nombre del directorio de instalación para plugins WASM - mantenlo seguro para el sistema de archivos. |
| `name` | `string` | sí | Nombre mostrado en Settings. |
| `version` | `string` | sí | SemVer plano, independiente de la versión de la propia app. Consulta [versionado](#versioning) más abajo. |
| `kind` | `"source" \| "theme" \| "metadata" \| "controller" \| "wrapper"` | sí | Qué capacidad ofrece este plugin - determina qué debe exportar su módulo/componente de entrada. |
| `entry` | `string` | sí | Ruta al archivo `.wasm` compilado, relativa a la propia carpeta del plugin. |
| `runtime` | `"wasm" \| "data"` | no | Establece `"wasm"` para un plugin WASM, o `"data"` para un manifiesto de tema sin código (sin `entry` que cargar en absoluto - `cssVariables` *es* todo el plugin). Un manifiesto de terceros siempre debería establecer uno de estos dos. (`"ts"`/ausente es un tercer valor que el cargador también reconoce, pero significa un módulo TypeScript de tiempo de compilación empaquetado dentro de la propia app - solo interno, nunca algo que establecerías en un manifiesto que distribuyes.) |
| `installable` | `boolean` | no | True si este plugin implementa el ciclo de vida de instalación/desinstalación (`install()`/`uninstall()`/`isInstalled()`) - determina si se muestra automáticamente la UI genérica del botón "Install". |

Los manifiestos de tema tienen su propio conjunto dedicado de campos (`cssVariables`/
`cardVisual`/`fontFaces`) - consulta [Manifiestos de tema](./theme-manifests) en lugar de esta
página para esos.

## Campos de plugin WASM

| Campo | Tipo | Notas |
|---|---|---|
| `settingsSchema` | array de `{ key, label, type? }` | Declara ajustes configurables por el usuario (p. ej. una clave de API) - el host renderiza un formulario de settings genérico a partir de esto en lugar de que tu plugin necesite su propia UI de settings personalizada. `type: "password"` enmascara la entrada. |
| `capabilities` | `string[]` | Qué capacidades controladas del host llama realmente este plugin. Hoy solo `"run-programs"` (controla `spawn-process`/`run-and-wait`) - consulta el [Modelo de seguridad](./security-model). El host aplica este control independientemente de lo que declares aquí; este campo solo determina si la UI de confirmación de instalación pide al usuario una concesión explícita. |

`pathScopes`/`httpScopes` (acceso de lectura declarado más allá del propio directorio de tu
plugin, y hosts de red permitidos) se muestran en el diálogo de confirmación de instalación para
visibilidad del usuario, pero son calculados por el host a partir de las solicitudes reales a
nivel WIT de tu plugin, no declarados directamente en `plugin.json` - consulta el
[Modelo de seguridad](./security-model) para saber cómo funciona realmente el acotamiento.

## Campos añadidos por el host (nunca los establezcas tú mismo)

| Campo | Tipo | Notas |
|---|---|---|
| `sourceUrl` | `string` | La URL exacta desde la que se instaló - añadida por el host en el momento de la instalación para que una comprobación de actualización posterior pueda volver a obtenerla y comparar versiones. |
| `installedViaRegistry` | `boolean` | True si se instaló a través del registro seleccionado con hash fijado en lugar de una URL pegada libremente - cambia cómo funciona la comprobación de actualizaciones (un `sourceUrl` fijado por el registro tiene el SHA de un commit y está congelado para siempre; comprobar una actualización significa volver a obtener la entrada *actual* del registro para este id, no volver a obtener `sourceUrl` de nuevo). |

## Ejemplo: un manifiesto de plugin de origen mínimo

```json
{
  "id": "my-scanner-plugin",
  "name": "My Scanner Plugin",
  "version": "0.1.0",
  "kind": "source",
  "entry": "my_scanner_plugin.wasm"
}
```

Consulta [Manifiestos de tema](./theme-manifests) para ver un ejemplo de manifiesto de tema.

## Versionado {#versioning}

Las versiones de los plugins son SemVer plano, rastreado de forma independiente a la versión de
la propia app:

- **Patch**: corrección de errores, sin cambios en el manifiesto/comportamiento.
- **Minor**: nueva capacidad, compatible hacia atrás - sigue funcionando contra la misma interfaz
  WIT del host (plugins WASM) o la misma forma de `PluginBase` (plugins TS).
- **Major**: cambio incompatible - cambia la forma del manifiesto, o (plugins WASM) el plugin
  ahora requiere una versión de la interfaz `wit/plugin.wit` que una compilación más antigua de
  Concourse no tiene. Esta es la señal de "no instales esto en una compilación más antigua de la
  app."

Los plugins WASM instalados por separado y los manifiestos de tema solo con datos convencionalmente
empiezan en `0.1.0`/`1.0.0` respectivamente - un manifiesto de tema solo con contenido es lo
bastante estable como para empezar en `1.0.0`, mientras que un plugin WASM con lógica real de
instalación/lanzamiento normalmente empieza en `0.1.0` hasta demostrarse en uso real.
