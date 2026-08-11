# Plugins y temas

Settings tiene un panel con pestañas que cubre todos los tipos de plugin: **Source**, **Theme**,
**Metadata Provider**, **Controller** y **Wrapper**. Si estás construyendo un plugin en lugar de
instalar uno, consulta la [documentación de plugins](/es/plugins/) - esta página es el lado
orientado al usuario. Consulta [Plugins oficiales](./official-plugins) para ver la lista actual
de plugins/temas mantenidos.

## Instalar un plugin

Haz clic en "Add Plugin" desde cualquier pestaña. Tienes dos opciones:

- **Registro seleccionado** - una lista revisada y verificada por hash de plugins conocidos como
  buenos. Elige uno y haz clic en Install; Concourse verifica su contenido contra un hash fijado
  antes de instalarlo, así que lo que obtienes es exactamente lo que se revisó.
- **Pegar una URL de manifiesto** - instala cualquier otra cosa pegando un enlace directo a su
  `plugin.json`. Esto funciona para cualquier plugin, esté listado en el registro o no, pero se
  salta la verificación de hash que sí tiene la ruta del registro - confías directamente en quien
  publicó esa URL. Concourse igualmente te muestra lo que el plugin declara necesitar (acceso a
  archivos/registro/red, si puede ejecutar otros programas) antes de que confirmes.

## Habilitar/deshabilitar y ordenar

- Los plugins de **Source** y **Metadata Provider** se habilitan de forma independiente y
  múltiple (casillas) - puedes ejecutar varios plugins de origen y varios proveedores de
  metadatos a la vez. Su orden importa: para los plugins de origen, decide cuál gana cuando el
  mismo juego lo encuentra más de uno (ver
  [deduplicación](./library#deduplication-across-sources)); para los proveedores de metadatos,
  decide qué respuesta de proveedor gana por campo (descripción, fecha de lanzamiento, arte de
  portada/fondo) cuando más de uno tiene algo que decir. Reordena cualquiera de las dos listas
  con las flechas junto a cada entrada.
- Los plugins de **Theme** y **Controller** son exclusivos (selección única/radio) - siempre
  estás viendo un skin y usando un mapeo de controlador físico a la vez.
- Los plugins de **Wrapper** (capas de compatibilidad, p. ej. un emulador de configuración
  regional) se habilitan de forma múltiple, cada uno instalable/gestionable de forma
  independiente, y seleccionable por juego desde el formulario de edición de ese juego.

## Actualizaciones

Concourse comprueba automáticamente si hay actualizaciones de plugins/temas (al iniciar la app,
al enfocar la ventana de la app, y cada vez que abres Settings o el diálogo Add Plugin) y muestra
una insignia "Update to vX.Y.Z" junto a cualquier elemento con una versión más nueva disponible.
Haz clic en ella para actualizar en el sitio.

## Desinstalar

Todo plugin/tema instalado (que no sea integrado) tiene una acción Remove/Uninstall en su propia
fila. Los temas y los plugins de source/metadata/wrapper que gestionan sus propios archivos
descargados (p. ej. el runtime instalado de un wrapper) también los limpian, no solo la entrada
del manifiesto.
