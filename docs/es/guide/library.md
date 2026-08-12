# Biblioteca y juegos

## Añadir juegos

**Manualmente**: el botón "Add Game" pide un título y una ruta de ejecutable (o una URI de
lanzador como `steam://run/<appid>` - ver [más abajo](#uri-launches-vs-direct-executables)).
Úsalo para cualquier cosa que un plugin de origen todavía no cubra.

**Mediante un plugin de origen**: una vez que hayas instalado y habilitado un plugin de origen
(Settings → Source), Settings tiene un botón "Scan Now" que encuentra todos los juegos que ese
plugin conoce y los añade a tu biblioteca. Volver a ejecutar un escaneo más tarde detecta los
juegos recién instalados sin duplicar los que ya están en tu biblioteca (ver deduplicación más
abajo).

## Editar un juego

Abre la página de detalle de cualquier juego (haz clic en su portada/título, o en el icono de
edición) y activa el modo de edición. Puedes sobrescribir el título, las URL de arte de
portada/fondo, la descripción (con soporte de Markdown), la fecha de lanzamiento y la plataforma.
Un botón "Fetch Metadata" vuelve a ejecutar tus proveedores de metadatos habilitados
(Settings → Metadata Provider) contra el título actual y rellena lo que encuentre - útil si la
obtención automática se saltó algo, o si los datos de un proveedor cambiaron desde que añadiste
el juego por primera vez.

## Tags y Collections

- Los **Tags** son etiquetas libres ("Co-op", "Backlog", "Completed") - créalos/renómbralos/
  elimínalos desde la pestaña Tags de la barra lateral, y asígnalos por juego desde la página de
  detalle de ese juego.
- Las **Collections** agrupan una serie/franquicia ("Final Fantasy") - un concepto distinto de
  los tags, gestionado de la misma manera desde su propia pestaña en la barra lateral.

## Búsqueda, filtrado y ordenación

La barra de búsqueda acepta texto de título simple más tres tokens especiales, todos combinables en una sola
consulta: `platform:steam`, `tag:coop`, `collection:"final fantasy"` (entrecomilla un valor que contenga
espacios). Escribir `platform:steam zelda` busca títulos que contengan "zelda" solo entre los juegos de Steam.

Debajo de la barra de búsqueda, unas píldoras clicables reflejan las mismas plataformas/tags/collections -
hacer clic en una añade o elimina su token de la barra de búsqueda, de modo que la barra de búsqueda y las
píldoras siempre coinciden entre sí. Varias píldoras del mismo tipo se combinan con **OR** (coincide cualquier
valor seleccionado - el predeterminado) o **AND** (debe coincidir con todos los valores seleccionados);
alterna cuál modo usa una categoría desde la píldora "browse all filters" (la fila tiene un límite, y esa
píldora abre un modal que lista todo sin límite, agrupado por plataforma/tags/collections). Un juego añadido
manualmente sin la plataforma de un plugin de origen aparece bajo una píldora de plataforma `manual`.

Un desplegable de orden aparte, junto al alternador de modo de vista, ofrece Título (A-Z), Jugado
recientemente, Más jugado y Añadido recientemente - tu elección persiste entre reinicios, igual que el modo
de vista en cuadrícula/lista.

## Operaciones por lotes

Haz clic en el alternador tipo casilla junto al desplegable de orden para entrar en el modo de selección: cada
tarjeta/fila se convierte en un objetivo de selección con un solo clic, con una pequeña insignia de casilla
que muestra lo que está seleccionado actualmente. Aparece una barra "N seleccionados" con los botones
Seleccionar todo (respeta el filtro/búsqueda activo en ese momento) y Borrar, además de acciones por lotes:
añadir un tag, añadir a una collection, o eliminar toda la selección de tu biblioteca. Sal del modo de
selección con el botón X para volver a la navegación normal.

## Deduplicación entre fuentes {#deduplication-across-sources}

Si el mismo juego se añade tanto manualmente como más tarde lo encuentra el escaneo de un plugin
de origen (o lo encuentran dos plugins de origen distintos), Concourse los fusiona en una sola
entrada en lugar de mostrar duplicados - haciendo coincidir por título. Cuando más de una fuente
encuentra el mismo título, el plugin que esté más adelante en el orden de prioridad de tu pestaña
Source gana en cuanto a ruta de lanzamiento/plataforma (reordena los plugins ahí si quieres que
otro tenga prioridad).

Si realmente quieres que dos entradas con el mismo título permanezcan separadas (p. ej. dos
versiones distintas del mismo juego), el formulario de edición de un juego tiene una casilla
"Keep separate from plugin scans" (`skip_dedup`) - márcala para excluir esa entrada específica de
la lógica de fusión.

## Traducción sin conexión {#offline-translation}

El título y la descripción de un juego se pueden traducir a tu idioma de interfaz actual
completamente sin conexión - sin ningún servicio de traducción externo, nada sale de tu máquina.
Desde la página de detalle de un juego, el botón "Translate" abre un menú con tres grupos
(desplázate o usa las teclas de flecha para moverte entre ellos):

- **Translate** - traduce solo el título, solo la descripción, o ambos. Volver a ejecutar esto
  con un modelo distinto seleccionado sobrescribe la traducción anterior de ese campo.
- **Show** - alterna entre el texto traducido y el original, por campo o ambos a la vez. Esta
  elección se recuerda por juego, así que volver a abrir un juego más tarde muestra lo que
  elegiste por última vez específicamente para él.
- **Remove** - borra una traducción en caché de un campo (o de ambos), revirtiendo al original
  sin dejar nada en caché.

**Configuración inicial** (Settings): descarga el motor de traducción una vez (una descarga
pequeña y única), luego elige un modelo del desplegable y descárgalo también. Se ofrecen varios
niveles de modelo, que intercambian tamaño/RAM por calidad - todos se ejecutan enteramente en la
CPU, así que un nivel más pequeño traduce más rápido y usa menos memoria mientras un juego se
ejecuta junto a él. Un nivel no tiene censura, pensado para traducir las propias descripciones de
juegos NSFW sin que un modelo ajustado a la seguridad se niegue a traducir texto legítimo de
terceros.

Una traducción en caché está vinculada al idioma de interfaz para el que se generó - cambiar tu
idioma de interfaz, o editar el título/descripción original de un juego, la invalida
automáticamente (vuelve a traducir para obtener una nueva para el idioma o el texto editado).

## Lanzamientos por URI frente a ejecutables directos {#uri-launches-vs-direct-executables}

Algunos plugins de origen (Steam, Epic) lanzan un juego mediante una URI de plataforma
(`steam://run/...`, `com.epicgames.launcher://...`) en lugar de una ruta `.exe` directa, ya que
así es como la propia plataforma espera que se le indique iniciar un juego. El seguimiento del
tiempo de juego funciona de forma distinta para estos - consulta
[Seguimiento del tiempo de juego](#playtime-tracking) más abajo.

## Seguimiento del tiempo de juego {#playtime-tracking}

Para una ruta de ejecutable directa, Concourse espera al proceso real y registra una sesión real
(inicio/fin/duración) una vez que termina. Para un juego lanzado por URI, no hay un manejador de
proceso al que esperar de la misma manera, así que una sesión no se registra de la misma forma -
las cifras de "Recently Played"/horas totales en la pestaña Stats reflejan lo que realmente es
rastreable según el método de lanzamiento.
