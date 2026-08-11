# Interfaz WIT

Este es el contrato [WIT](https://component-model.bytecodealliance.org/design/wit.html) real
contra el que se construye todo plugin WASM — la fuente de verdad es `src-tauri/wit/plugin.wit`
en el repositorio principal; esta página lo explica, pero ese archivo es el que manda si alguna
vez difieren.

## La interfaz `host`

Cada función del host de abajo es una capacidad que implementa el lado Rust y expone a tu plugin
- primitivas deliberadamente genéricas (registro/archivo/proceso/red/almacenamiento acotado) en
lugar de funciones semánticas por integración. Un plugin de origen compone estas por sí mismo
(p. ej. interpretando el propio formato VDF/XML de un proveedor) en lugar de que Concourse
escriba un módulo a medida por fuente.

### Registro (Windows)

```wit
read-registry-string: func(hive: string, path: string, value: string) -> option<string>;
list-registry-keys: func(hive: string, path: string) -> result<list<string>, string>;
```

`hive` es `"HKLM"` o `"HKCU"`. Una clave/valor faltante devuelve `none`/una lista vacía, no un
error - "no existe" es un resultado normal y esperado (p. ej. comprobar si una plataforma está
instalada siquiera).

### Sistema de archivos

```wit
read-file: func(path: string) -> result<string, string>;
write-file: func(path: string, contents: string) -> result<_, string>;
list-dir: func(path: string) -> result<list<string>, string>;
path-exists: func(path: string) -> bool;
remove-dir: func(path: string) -> result<_, string>;
plugin-dir: func() -> result<string, string>;
```

`plugin-dir()` devuelve el propio directorio con permiso de escritura de este plugin
(`<app data>/wasm-plugins/<kind>/<plugin-id>/`) - siempre implícitamente legible/escribible.
Cualquier otra ruta necesita caer dentro de un alcance que declare tu manifiesto, o solicitarse
en tiempo de ejecución (consulta el [Modelo de seguridad](./security-model#path-scoping)).

```wit
request-read-scope: func(path: string) -> result<_, string>;
```

Para un directorio descubierto en tiempo de ejecución en lugar de conocido estáticamente
(p. ej. dondequiera que el usuario haya instalado realmente Steam) - el host solo concede esto
si reconoce el id de tu plugin *y* la ruta pasa una comprobación estructural real para ese
proveedor.

### Proceso

```wit
spawn-process: func(path: string, args: list<string>) -> result<_, string>;
run-and-wait: func(path: string, args: list<string>, cwd: string) -> result<_, string>;
```

`spawn-process` es de disparar y olvidar (sin espera/código de salida) - coincide con cómo se usa
`launch()` en el resto de la app; el propio seguimiento de tiempo de juego basado en carpetas de
Concourse cubre la duración de la sesión por separado. `run-and-wait` bloquea hasta que el
proceso termina, para los casos que realmente lo necesitan (p. ej. una ventana visible de un
instalador de terceros que tu plugin necesita saber que se ha cerrado antes de continuar). Ambas
requieren la concesión de la capacidad `"run-programs"` - consulta el
[Modelo de seguridad](./security-model).

### Red

```wit
http-get: func(url: string) -> result<string, string>;
download-bytes: func(url: string) -> result<list<u8>, string>;
http-request: func(method: string, url: string, headers: list<tuple<string, string>>, body: option<string>) -> result<string, string>;
```

`http-request` es para todo lo que `http-get` no puede expresar - cabeceras personalizadas (un
token bearer de `Authorization`) o un método distinto de GET con cuerpo (p. ej. una API de
consulta basada en POST). Usa `download-bytes` en lugar de `http-get`/`http-request` para
respuestas binarias.

### Archivos zip

```wit
extract-zip: func(bytes: list<u8>, dest-dir: string) -> result<_, string>;
unwrap-single-subdir: func(dir: string) -> result<string, string>;
replace-dir: func(src: string, dest: string) -> result<_, string>;
```

Juntas, estas cubren el flujo común de "descargar un zip de release, extraerlo, e instalarlo"
(usado por plugins `wrapper` para sus propias instalaciones gestionadas). `unwrap-single-subdir`
maneja el caso común en que un zip de release envuelve su contenido en una carpeta de nivel
superior que coincide con el nombre del archivo.

### Almacenamiento acotado

```wit
settings-get: func(key: string) -> option<string>;
settings-set: func(key: string, value: string);
plugin-data-get: func(game-id: s64, key: string) -> option<string>;
plugin-data-set: func(game-id: s64, key: string, value: string);
```

Ambos con espacio de nombres auto-asignado por el host por id de plugin - tu plugin nunca puede
leer ni escribir los settings de otro plugin ni los datos por juego de otro plugin, ni acceder
directamente a una tabla del núcleo de la app.

## Los tres mundos de plugin

Cada `kind` que un plugin WASM puede implementar exporta uno de estos mundos:

### `source-plugin-world`

```wit
interface source-plugin {
    use host.{game-entry};

    scan: func() -> result<list<game-entry>, string>;
    launch: func(entry: game-entry) -> result<_, string>;
    get-install-status: func(entry: game-entry) -> result<bool, string>;
}
```

Refleja la interfaz `SourcePlugin` de TypeScript integrada - un plugin de origen WASM es una
implementación alternativa lista para usar del mismo contrato. Consulta
[Primeros pasos](./getting-started) para un recorrido completo de cómo implementar uno.

### `wrapper-plugin-world`

```wit
interface wrapper-plugin {
    use host.{locale-profile};

    install: func() -> result<_, string>;
    uninstall: func() -> result<_, string>;
    is-installed: func() -> bool;

    list-profiles: func() -> result<list<locale-profile>, string>;
    launch: func(profile-guid: string, executable-path: string) -> result<_, string>;
}
```

Un envoltorio de compatibilidad (p. ej. un emulador de configuración regional) - totalmente
autónomo. `install()` descarga la última versión, la extrae, siembra una configuración de perfil
por defecto si no existe ninguna, y ejecuta el instalador real del proveedor para el paso de
registro que solo él puede hacer. A diferencia de los plugins de origen, no hay ninguna ruta
propiedad del host que pasar en ningún sitio - el plugin siempre se instala en (y resuelve) la
misma ubicación determinista bajo su propio `plugin-dir()`.

### `metadata-plugin-world`

```wit
interface metadata-plugin {
    record metadata-result {
        description: option<string>,
        release-date: option<string>,
        genres: list<string>,
        cover-art-url: option<string>,
        background-art-url: option<string>,
    }

    record metadata-candidate {
        id: string,
        label: string,
        image-url: option<string>,
    }

    search-candidates: func(title: string) -> result<list<metadata-candidate>, string>;
    fetch-metadata-by-id: func(id: string) -> result<option<metadata-result>, string>;
}
```

`search-candidates` devuelve toda coincidencia plausible - normalmente 0 o 1, pero puede haber
más cuando los propios listados de tu proveedor son genuinamente ambiguos (p. ej. una
reedición/duplicado que comparte el mismo título). El host elige automáticamente el único
candidato cuando vuelve exactamente uno, muestra al usuario un selector cuando vuelve más de uno,
y se salta tu proveedor por completo cuando no vuelve ninguno. `fetch-metadata-by-id` obtiene
entonces los metadatos completos de un candidato específico por su `id`.

## `game-entry` y `locale-profile`

```wit
record game-entry {
    id: string,
    title: string,
    executable-path: string,
    platform: string,
    cover-art-url: option<string>,
    install-dir: option<string>,
}

record locale-profile {
    name: string,
    guid: string,
}
```
