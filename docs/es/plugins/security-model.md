# Modelo de seguridad

Instalar un plugin WASM por URL sigue ejecutando código arbitrario que tú no escribiste - el
mismo riesgo del mundo real que ejecutar cualquier `.exe` descargado. Concourse no pretende que
el sandbox WASM por sí solo resuelva eso; esta página es lo que realmente hace al respecto, y lo
que no hace.

## El propio sandbox de wasmtime

Todo plugin WASM se ejecuta dentro de una instancia del Component Model de
[wasmtime](https://wasmtime.dev/) sin ningún acceso ambiental a nada - sin sistema de archivos,
sin red, sin generación de procesos, nada, a menos que una función `host` específica lo conceda.
Esta es la base: un plugin solo puede hacer lo que expone la interfaz `host` (consulta la
[Interfaz WIT](./wit-interface)), nunca nada más allá, sin importar lo que intente el propio
código del plugin.

## Acotamiento de rutas {#path-scoping}

`plugin-dir()` (`<app data>/wasm-plugins/<kind>/<plugin-id>/`) siempre es implícitamente
legible/escribible - cada plugin obtiene un directorio de sandbox privado de forma gratuita.
Cualquier cosa más allá de eso necesita uno de:

- **Un alcance estático declarado** - una clave+prefijo de registro fija o un prefijo de ruta de
  sistema de archivos que un plugin realmente necesita en una ubicación conocida (p. ej. las
  claves de registro de proveedor fijas de una plataforma, o un directorio de manifiestos fijo).
  Declarado una vez, comprobado por el host en cada llamada de archivo/registro.
- **Un alcance solicitado en tiempo de ejecución** (`request-read-scope`) - para un directorio
  solo detectable en tiempo de ejecución (dondequiera que la instalación de Steam del usuario
  haya puesto realmente sus carpetas de biblioteca). El host solo concede esto si reconoce el id
  del plugin *y* la ruta solicitada pasa una comprobación estructural real para ese proveedor
  (p. ej. exigir un subdirectorio `steamapps`) - un id de plugin no reconocido se rechaza
  directamente, nunca se confía en él silenciosamente.

En cualquier caso, los alcances declarados en el manifiesto de un plugin (o mostrados en la
confirmación de instalación) se muestran al usuario antes de instalarlo, así que "qué puede tocar
esto realmente en mi disco" es visible desde el principio, no solo aplicado en silencio.

## Control de generación de procesos

`spawn-process`/`run-and-wait` están controlados detrás de una concesión explícita de la
capacidad `"run-programs"` - un plugin que declare esto en el campo `capabilities` de su
manifiesto activa un aviso real de "este plugin ejecuta otros programas en tu sistema" en la UI
de confirmación de instalación, que el usuario tiene que aceptar afirmativamente. El host aplica
este control independientemente de lo que declare el manifiesto (un plugin no puede simplemente
omitir el campo para saltarse el aviso y aun así llamar a la función) - el campo `capabilities`
solo controla si la UI pide la concesión siquiera.

## Acotamiento de red

`http-get`/`http-request`/`download-bytes` están en lista blanca/limitados en tasa por plugin, no
es una concesión general de "puede acceder a todo internet".

## Lo que esto *no* resuelve: confianza, no solo aislamiento

El acotamiento de rutas/procesos/red limita *a qué* puede llegar un plugin, pero no dice nada
sobre si el propio código hace algo malicioso dentro de ese alcance (un plugin de origen
realmente necesita `spawn-process` para lanzar juegos - eso no es algo que un sandbox pueda
distinguir de lanzar otra cosa). Dos capas más abordan eso:

### Firma de código (consultiva)

Las versiones publicadas de plugins pueden llevar una atestación de
[Sigstore](https://www.sigstore.dev/) - prueba verificable de qué compilación de CI produjo un
binario `.wasm` dado y desde qué commit de origen. Esto es **consultivo, no una puerta obligatoria
en el momento de la instalación** - Concourse no se niega a instalar un plugin sin firmar, ya que
eso bloquearía igual de fácilmente a un autor de plugin que aún no ha configurado la firma. La
revisión consultiva aparece en la UI de confirmación de instalación, y *sí* se aplica de forma
obligatoria para el registro seleccionado de abajo.

### Registro seleccionado (con control obligatorio)

[`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry) es una lista
revisada y fijada por hash de plugins - cada entrada fija el manifiesto/WASM de un plugin a un
SHA de commit y un hash de contenido exactos. Instalar a través del registro (en lugar de una URL
pegada libremente) **rechaza obligatoriamente ante una discrepancia de hash** - si lo que
realmente se sirve ya no coincide con lo que se revisó, la instalación falla directamente en
lugar de avisar y continuar. Retirar una entrada del registro *es* el mecanismo de revocación
(solo en el momento de la instalación - no alcanza a las copias ya instaladas).

**En resumen**: los plugins instalados vía registro obtienen garantías de integridad reales y
aplicadas. Los plugins instalados por URL libre obtienen aislamiento y alcances declarados
visibles, pero la decisión de confianza real sigue siendo tuya - consulta
[Publicación](./publishing) si quieres que tu propio plugin alcance el nivel más sólido y
revisado.
