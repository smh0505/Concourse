# Primeros pasos

Concourse es una aplicación de escritorio que agrupa juegos de muchas fuentes en una sola
biblioteca, con un modo "Big Picture" a pantalla completa al estilo consola para una navegación
centrada en el mando. Esta guía cubre el uso diario de la aplicación. Si en cambio estás
construyendo un plugin, consulta la
[documentación de plugins](/es/plugins/).

## Instalación

Descarga el instalador más reciente desde la
[página de Releases](https://github.com/smh0505/Concourse/releases/latest) (por ahora solo
Windows). Concourse comprueba e instala sus propias actualizaciones automáticamente una vez en
ejecución - no es necesario volver a descargarla manualmente después de la primera instalación.

## Primer inicio

En el primer inicio, tu biblioteca está vacía. Puedes poblarla de dos maneras, y la mayoría de la
gente termina usando ambas:

1. **Añadir un juego manualmente** - el botón "Add Game" (barra lateral) pide un título y una
   ruta de ejecutable, para cualquier cosa que un plugin de origen todavía no cubra (un emulador,
   una descarga de itch.io, ...).
2. **Instalar un plugin de origen** - la pestaña Settings → Source permite instalar un plugin que
   escanea una plataforma existente (Steam, GOG, Epic, ...) en busca de juegos que ya posees, y
   mantiene esa lista sincronizada en escaneos posteriores. Consulta
   [Biblioteca y juegos](./library) para saber cómo funcionan el escaneo/la deduplicación, y
   [Plugins y temas](./plugins-and-themes) para instalar uno realmente.

## Dónde está cada cosa

- **Library** (barra lateral) - tu cuadrícula/lista de juegos, la vista predeterminada.
- **Stats** - total de juegos/horas, Más jugados, Jugados recientemente.
- **Tags** / **Collections** - dos conceptos organizativos independientes: los tags son
  etiquetas libres ("Co-op", "Backlog"); las collections agrupan una serie/franquicia
  ("Final Fantasy"). Gestiona ambos desde sus propias pestañas en la barra lateral, o asígnalos
  por juego desde la página de detalle de un juego.
- **Settings** - todo lo relacionado con plugins/temas/preferencias de la app, consulta
  [Plugins y temas](./plugins-and-themes); también es donde configuras la traducción sin
  conexión - consulta [Biblioteca y juegos](./library#offline-translation).
