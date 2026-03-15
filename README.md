# LeerTexto

App de escritorio (Windows) para **seleccionar un rectángulo en la pantalla**, hacer **OCR** y **leer en voz alta** el texto (útil para juegos donde el texto no se puede copiar).

## Ejecutar

```bash
npm install
npm start
```

## Uso

- `Ctrl+Shift+S` seleccionar área
- `Ctrl+Shift+L` OCR + leer
- `Ctrl+Shift+C` activar/desactivar lectura continua
- En la pantalla de selección: arrastra para dibujar el rectángulo. `ESC` cancela.
- El primer OCR puede demorar porque descarga datos del idioma.

## Notas

- Si el OCR no reconoce bien, prueba cambiar el idioma a `eng` o ajusta el rectángulo a solo el panel de texto.
- Algunos juegos con anti-cheat pueden bloquear capturas de pantalla; esta app no intenta evadir esas protecciones.
  - La captura se hace con `screenshot-desktop` (depende del sistema operativo).

## Más voces (Windows)

Las voces salen de Windows/Chromium. Para tener más opciones, instala voces en el sistema:

- Configuración → **Hora e idioma** → **Voz** → **Administrar voces** → **Agregar voces**
- O desde la app: botón **Agregar voces**

Luego reinicia la app para que aparezcan en la lista.

Tip: en el selector **Voz** tienes 7 presets por defecto (Auto/Default/ES/EN/JA y ES femenina/masculina) además de tus voces instaladas.

## Logs / errores

- Ejecuta con `npm start` desde una consola (PowerShell/CMD) para ver logs y errores (main + renderer) en esa misma consola.
