# Publicación

## Instalación libre por URL (siempre disponible)

Cualquiera puede instalar tu plugin hoy sin estar listado en ningún sitio - el diálogo "Add
Plugin" de Concourse acepta una URL directa a un manifiesto `plugin.json`. Publica una release de
GitHub con tu `.wasm` compilado y el manifiesto como assets de la release, comparte la URL del
asset del manifiesto de la release, y ya está. Esta es una vía de instalación real y de primera
clase, no un mecanismo de respaldo - un autor de plugin no necesita estar en ningún registro para
que su plugin sea instalable.

Para que la comprobación de actualizaciones funcione bien contra una URL libre, publica las
releases de la forma habitual (versiones etiquetadas, p. ej. `v0.2.0`) y dirige a la gente a la
URL del asset de esa etiqueta específica en lugar de a un enlace `.../releases/latest/...`, para
que una instalación concreta permanezca fijada a lo que realmente se instaló.

### Firma de código (recomendada)

Si el CI del repositorio de tu plugin atestigua la procedencia de compilación de sus artefactos
de release (p. ej.
[`actions/attest-build-provenance`](https://github.com/actions/attest-build-provenance)),
Concourse muestra eso como verificación consultiva en la UI de confirmación de instalación -
prueba de que el `.wasm` que un usuario está a punto de instalar realmente proviene del CI de tu
propio repositorio, no de una copia manipulada. Esto no es obligatorio, pero es lo único que una
instalación por URL libre no puede obtener por otra vía y que sí puede obtener una entrada de
registro (consulta el [Modelo de seguridad](./security-model)).

## El registro seleccionado

[`concourse-plugin-registry`](https://github.com/smh0505/concourse-plugin-registry) es una lista
seleccionada a mano y fijada por hash que obtiene una verificación de contenido obligatoria en el
momento de la instalación (una discrepancia se rechaza directamente, no solo se marca) - una
garantía significativamente más sólida que una instalación por URL libre. Honestamente, a fecha
de escribir esto, se documenta a sí misma como revisada por una sola persona (`smh0505`, el mismo
mantenedor que Concourse) en lugar de un proceso de envío de comunidad abierto - "revisado"
significa que alguien realmente leyó el código fuente de esa versión específica fijada, lo cual
no escala a aceptar pull requests arbitrarios de terceros sin cambiar antes esa política. Si
quieres que tu plugin sea considerado para inclusión, abre un issue en ese repositorio en lugar
de asumir que se aceptará tal cual una PR que añada tu propia entrada.

### Qué fija realmente un listado

```json
{
  "id": "your-plugin-id",
  "name": "Your Plugin",
  "kind": "source",
  "repo": "you/your-plugin-repo",
  "manifestUrl": "https://github.com/you/your-plugin-repo/releases/download/v0.2.0/plugin.json",
  "wasmSha256": "<sha256 of the pinned .wasm, computed by the reviewer>"
}
```

`manifestUrl` siempre apunta a un asset de release específico e inmutable - nunca a
`.../latest/...` - ya que todo el sentido de una entrada seleccionada es que lo que se instala
hoy es exactamente lo que se revisó, no lo que publiques a continuación. `wasmSha256` se calcula
a partir del artefacto real de tu release por quien lo revise, y luego se comprueba contra los
bytes realmente descargados en cada instalación a través de este registro.

### Mantener actualizado un listado

Si tu plugin llega a estar listado, el propio CI del registro puede detectar automáticamente tus
nuevas releases (mediante un `repository_dispatch` que envía tu flujo de trabajo de release) y
abrir una PR de actualización de versión contra el registro automáticamente - volviendo a
obtener, recalcular el hash y refijar el asset de tu nueva release para revisión, en lugar de que
alguien tenga que notar que publicaste una actualización. Esa PR sigue necesitando una fusión
humana, el mismo listón de revisión que un listado inicial.
