---
name: Tita Media
description: Consola oscura de precisión para una consultoría de comercio, tecnología y datos en LatAm.
colors:
  rizoma-verde: "#80E593"
  corriente-cian: "#52C7CF"
  canvas-ink: "#141414"
  canvas-ink-deep: "#0B0C0C"
  panel-ink: "#1A1A1A"
  surface-quiet: "#F2F4F3"
  teal-quiet: "#17747C"
  text-on-dark: "#ffffff"
  text-on-dark-muted: "rgba(255,255,255,0.72)"
  text-on-dark-faint: "rgba(255,255,255,0.42)"
  line-on-dark: "rgba(255,255,255,0.1)"
  text-on-light-muted: "#4A524E"
  text-on-light-faint: "#6A716D"
typography:
  display:
    fontFamily: "'Be Vietnam Pro', system-ui, sans-serif"
    fontSize: "clamp(32px, 4.3vw, 58px)"
    fontWeight: 300
    lineHeight: 1.07
    letterSpacing: "-0.032em"
  headline:
    fontFamily: "'Be Vietnam Pro', system-ui, sans-serif"
    fontSize: "clamp(26px, 3.2vw, 44px)"
    fontWeight: 300
    lineHeight: 1.14
    letterSpacing: "-0.028em"
  body:
    fontFamily: "'Be Vietnam Pro', system-ui, sans-serif"
    fontSize: "clamp(15.5px, 1.2vw, 18px)"
    fontWeight: 400
    lineHeight: 1.68
    letterSpacing: "normal"
  label:
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.14em"
  action:
    fontFamily: "'Be Vietnam Pro', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "normal"
rounded:
  none: "0px"
  circle: "50%"
spacing:
  gutter: "clamp(24px, 5vw, 88px)"
  section-y: "clamp(80px, 10vw, 140px)"
  container-max: "1240px"
components:
  button-primary:
    backgroundColor: "{colors.rizoma-verde}"
    textColor: "{colors.canvas-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.none}"
    padding: "16px 30px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-on-dark}"
    typography: "{typography.action}"
    rounded: "{rounded.none}"
    padding: "16px 30px"
  input-field:
    backgroundColor: "{colors.canvas-ink}"
    textColor: "{colors.text-on-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "14px 15px"
---

# Design System: Tita Media

## Overview

**Creative North Star: "El Rizoma Operativo"**

Tita Media se presenta como una red sin jerarquía, no como una torre de servicios apilados: cinco soluciones enredadas entre sí y con la operación del cliente, igual que el diagrama que abre el hero. El sistema visual traduce esa idea a una consola oscura de precisión — casi sin ornamento, casi sin sombra, donde cada acento de color es una señal deliberada y no decoración. Todo lo demás — bordes duros, tipografía ligera, etiquetas mono en mayúsculas — existe para que esa señal se lea sin ruido.

La atmósfera es **precisa y contenida**: confianza técnica silenciosa. El fondo oscuro (#141414) no es "tema oscuro" como preferencia estética; es el lienzo neutro sobre el que los dos acentos de marca (verde rizoma, cian corriente) y los gráficos generativos (red, sistema solar, filamentos) hacen todo el trabajo expresivo. El único quiebre deliberado a superficie clara (#F2F4F3, sección "La IA llegó después de entender cómo funciona el retail") funciona como una pausa editorial dentro de la consola — el sistema respira una vez, con el mismo rigor tipográfico, antes de volver al canvas oscuro.

**Key Characteristics:**
- Fondo oscuro por defecto, con una única superficie clara reservada para el "momento de pausa" reflexivo del contenido.
- Cero radio en todo lo rectangular; el círculo se reserva exclusivamente para marcadores puntuales (nodos, cursor, FAB).
- Casi sin sombra: la profundidad se transmite con transparencia y líneas, no con elevación.
- Mono en mayúsculas trackeado como firma tipográfica de "dato/etiqueta/sistema", nunca como cuerpo de texto.
- Los gráficos generativos (rizoma, sistema solar, campos neuronales) son la firma visual del sistema, no una decoración de hero aislada — reaparecen como textura de fondo y como diagrama dentro del acordeón de soluciones.

## Colors

Paleta de dos acentos sobre un solo canvas oscuro; los "neutros" son en realidad gradaciones del mismo negro verdoso (#141414 → #0B0C0C → #1A1A1A) según cuánto retrocede la superficie.

### Primary
- **Verde Rizoma** (`#80E593`): el acento de acción — CTAs, contadores de resultado, subrayados de eyebrow, checkbox de formulario. Aparece en ≤10% de cualquier vista; es la señal de "esto se puede accionar".

### Secondary
- **Cian Corriente** (`#52C7CF`): el acento de sistema/dato — línea de flujo entre nodos del diagrama de red, tono alterno del mesh gradient de fondo, variable CSS `--tm-accent2`. Nunca compite con el verde en el mismo elemento interactivo; son acentos de roles distintos (acción vs. dato en movimiento), no intercambiables.

### Neutral
- **Canvas Ink** (`#141414`): fondo base de body, inputs de formulario, y el color de texto sobre la superficie clara — el mismo valor cambia de rol según el fondo.
- **Canvas Ink Deep** (`#0B0C0C`): secciones que "retroceden" un nivel — header/nav, dropdown de soluciones, menú móvil, franja de partners, bloque de estadísticas del caso de éxito.
- **Panel Ink** (`#1A1A1A`): la sección de contacto y sus filas de checkbox — un nivel de superficie intermedio entre Canvas Ink y Canvas Ink Deep, para el bloque donde el usuario actúa.
- **Text on Dark** (`#ffffff` / `rgba(255,255,255,.72)` / `rgba(255,255,255,.42)`): jerarquía de texto sobre fondo oscuro — blanco pleno solo para titulares e ítems interactivos, `.72` para cuerpo, `.42`–`.5` para metadatos silenciosos (labels de nodos, "LOGO" placeholder).
- **Line on Dark** (`rgba(255,255,255,.1)`, variando entre `.08`–`.14` según la sección): todos los separadores y bordes de hairline — nunca un borde sólido de color.

### Light-surface exception
- **Surface Quiet** (`#F2F4F3`) con **Ink on Light** (`#141414`) y texto secundario **`#4A524E`** / **`#6A716D`**: reservado a la sección de pausa reflexiva. **Teal Quiet** (`#17747C`) es el único acento que vive exclusivamente en esta superficie clara (barra vertical de cita, filamentos del campo neuronal) — nunca aparece sobre fondo oscuro.

### Named Rules
**The Two-Accent Rule.** Verde Rizoma es acción; Cian Corriente es dato/sistema en movimiento. Un mismo componente no usa los dos como si fueran intercambiables — el color comunica qué tipo de señal es.

**The Borrowed Neutral Rule.** No hay una escala de grises independiente: los "neutros" son variaciones del mismo negro verdoso (`#141414`/`#0B0C0C`/`#1A1A1A`) y variaciones de opacidad de blanco. Nunca introducir un gris neutro nuevo (`#888`, `#ccc`, etc.) fuera de esta familia.

## Typography

**Display/Body Font:** Be Vietnam Pro (con `system-ui, sans-serif`)
**Label/Mono Font:** IBM Plex Mono (con `ui-monospace, monospace`)

**Character:** Be Vietnam Pro en peso 300 lleva toda la voz editorial — titulares grandes, ligeros, casi frágiles frente al fondo oscuro. IBM Plex Mono en mayúsculas trackeadas es la voz de "sistema": eyebrows, encabezados de columna del footer, contadores, nombres de nodo en los diagramas. Nunca se usa mono para prosa larga.

### Hierarchy
- **Display** (300, `clamp(32px,4.3vw,58px)`, line-height 1.07): el titular del hero, único por página.
- **Headline** (300, `clamp(26px,3.2vw,44px)`, line-height 1.14): titulares de sección (`h2`).
- **Title** (400–500, `clamp(20px,2.3vw,30px)`, line-height 1.2): título de cada fila del acordeón de soluciones y de preguntas del FAQ.
- **Body** (400, `clamp(15.5px,1.2vw,18px)`, line-height 1.68, max ~62ch): párrafos de contenido.
- **Label** (400, 11.5px, letter-spacing 0.14–0.2em, mayúsculas, mono): eyebrows, columnas de footer, nombres de nodo, contadores de proceso.
- **Action** (500, 15px, Be Vietnam Pro, sin tracking): el texto de botones/CTA — deliberadamente distinto del label mono; el CTA habla en la voz editorial, no en la voz de sistema.

### Named Rules
**The Mono-Is-System Rule.** IBM Plex Mono en mayúsculas significa siempre "esto es una etiqueta, un dato o una coordenada", nunca contenido narrativo. Si un texto necesita persuadir o explicar, va en Be Vietnam Pro.

## Layout

Contenedor centrado de `1240px` con gutter fluido `clamp(24px,5vw,88px)` — el mismo contenedor en cada sección, sin excepciones de ancho completo salvo el fondo (mesh gradient, franjas de logos). Ritmo vertical por sección: `clamp(80px,10vw,140px)` en secciones de contenido, `clamp(44px,5vw,66px)` en las franjas de logos (más comprimidas a propósito, son pausas, no contenido principal).

Grid principal del hero: dos columnas `1.05fr / .95fr` (copy + diagrama). El acordeón de soluciones usa una grilla de tres columnas fijas `64px` (número) · `1fr` (contenido) · `34px` (icono +). El footer usa `1.7fr / 1fr / 1.25fr`.

**Breakpoint 1080px** (tablet/mobile mayor): el hero pasa a una columna, la navegación colapsa a menú de hamburguesa fijo a pantalla completa, las grillas de 3–4 columnas (pasos de proceso, stats, footer, form) pasan a una o dos columnas.
**Breakpoint 640px** (mobile chico): los pasos de proceso pasan a una sola columna; se ocultan elementos secundarios de bajo valor en pantallas chicas (numeración decorativa del acordeón).

Header sticky de `78px` con `backdrop-filter: blur(18px)` sobre `rgba(20,20,20,.74)` — translúcido, no opaco, para que el fondo generativo se siga sintiendo detrás.

### Named Rules
**The One Container Rule.** Todo el contenido de texto vive dentro del mismo contenedor de `1240px`; solo los fondos generativos (mesh gradient, franjas de logo) tienen permiso para sangrar a los bordes de la ventana.

## Elevation & Depth

Este sistema es **plano por convicción**, no por descuido. No hay una escala de sombras estructurales: la profundidad se transmite con transparencia (bordes `rgba(255,255,255,.1)`), con `backdrop-filter: blur` en el header, y con degradados de enmascaramiento (`mask-image`) en los gráficos generativos que se funden hacia el fondo. Hay exactamente dos excepciones, y ambas son deliberadas, no una escala:

### Shadow Vocabulary
- **Signal Glow** (`@keyframes tmglow`: `box-shadow: inset 0 0 0 1px var(--tm-accent), 0 0 0 0 var(--tm-accent)` pulsando a `inset 0 0 8px 1px rgba(128,229,147,.6), 0 0 12px 2px rgba(128,229,147,.4)`): la única "sombra" que aparece en reposo-hover de un CTA — es una señal de sistema encendiéndose, no una sombra de elevación física.
- **Floating Action Shadow** (`0 6px 26px rgba(0,0,0,.4)`): reservada exclusivamente al botón flotante de WhatsApp — el único elemento que de verdad "flota" sobre el contenido y necesita leerse como tal.

### Named Rules
**The Flat-By-Default Rule.** Ningún botón, card, input o panel lleva `box-shadow` en reposo. Si algo necesita destacar, usa el Signal Glow (respuesta a interacción) o transparencia/borde — nunca una sombra nueva inventada para el caso.

## Shapes

Todo lo rectangular tiene radio `0` — botones, inputs, cards del acordeón, tiles de logo, chips de dato en los gráficos 3D. El único radio permitido es `50%`, y solo para marcadores que son conceptualmente un punto: el cursor personalizado (`#tmcur`), los puntos de proceso (`data-dot`), los nodos de los diagramas, y el botón flotante de WhatsApp.

### Named Rules
**The Hard Edge Rule.** Si un elemento es un contenedor o un control (botón, input, card, tile), su esquina es recta. Si un elemento es un punto de datos o un marcador puntual, es un círculo perfecto. No hay estado intermedio (nada de `border-radius: 8px`).

## Components

### Buttons
- **Shape:** rectas, radio 0 (`{rounded.none}`).
- **Primary:** fondo `{colors.rizoma-verde}`, texto `{colors.canvas-ink}`, borde `1px solid` del mismo verde, padding `16px 30px`, tipografía Action (15px/500, Be Vietnam Pro).
- **Ghost:** fondo transparente, texto y borde en el color de contraste local (blanco sobre oscuro, `#141414` sobre la superficie clara) — mismo padding y tipografía que Primary.
- **Hover/Focus:** Primary dispara el Signal Glow (ver Elevation); todo el sistema usa además un anillo de foco global (`outline: 2px solid var(--tm-accent); outline-offset: 3px`) sobre `:focus-visible`, nunca un cambio de fondo.
- **Carácter:** precisos y sin fricción — la superficie del botón no cambia de forma ni de volumen; solo emite la señal (glow) cuando corresponde.

### Cards / Acordeón de soluciones
- **Corner Style:** recta (radio 0).
- **Background:** degradado sutil `linear-gradient(90deg, #141414 0%, #181919 100%)` — casi imperceptible, deja espacio para el diagrama generativo que sangra desde el borde derecho con máscara de degradado.
- **Shadow Strategy:** ninguna (ver Elevation).
- **Border:** solo como divisor horizontal entre filas (`rgba(255,255,255,.12)`), nunca un borde propio de la card.
- **Comportamiento distintivo:** el `+` gira y el panel se expande con `max-height` animado; solo una fila abierta a la vez es la convención del bloque (misma lógica que el FAQ).

### Inputs / Fields
- **Style:** fondo `{colors.canvas-ink}`, borde `1px solid rgba(255,255,255,.14)`, radio 0, sin placeholder decorativo.
- **Focus:** el anillo de foco global (`outline`), no un cambio de borde o fondo.
- **Checkbox:** nativo, con `accent-color: {colors.rizoma-verde}` — no se reconstruye como componente custom.

### Navigation
- **Header:** sticky, translúcido con blur, logo en mono ligero trackeado (`letter-spacing: .42em`) — el logo usa el mismo peso 300 que los titulares, nunca bold.
- **Mega-menú "Soluciones":** dropdown de 2 columnas con título + descripción por ítem, cierra con un CTA de conversión ("Hablemos") integrado al pie del propio menú.
- **Mobile:** colapsa a panel de pantalla completa fijo bajo el header, cada ítem se convierte en fila de ancho completo con separador — no es un drawer lateral.

### Signature Component: Cursor contextual
Un cursor circular custom (`#tmcur`, 84px, `border-radius:50%`, fondo Verde Rizoma) sigue el puntero y muestra una etiqueta mono corta (`data-cursor="EXPLORAR"`, `"CONECTAR"`, `"VER CASO"`) según sobre qué elemento flota. Es la firma de interacción del sistema: el cursor mismo comunica la acción disponible, en vez de depender solo del estilo del elemento.

### Signature Component: Diagramas generativos
Rizoma (red arrastrable), sistema solar (órbitas), campos neuronales/de pausa y micro-diagramas del acordeón — todos three.js o SVG, todos usan exclusivamente los dos acentos de marca sobre el canvas oscuro (o Teal Quiet sobre la superficie clara). No son ilustraciones decorativas: cada uno visualiza literalmente el posicionamiento ("una operación, varias soluciones conectadas").

## Do's and Don'ts

### Do:
- **Do** usar radio 0 en todo lo rectangular; reservar el círculo perfecto para marcadores puntuales (The Hard Edge Rule).
- **Do** usar IBM Plex Mono en mayúsculas solo para etiquetas/datos, nunca para prosa (The Mono-Is-System Rule).
- **Do** mantener Verde Rizoma como el único color de acción y Cian Corriente como el único color de "dato en movimiento" (The Two-Accent Rule).
- **Do** dejar que los gráficos generativos sangren fuera del contenedor de texto con máscaras de degradado; el texto siempre respeta el contenedor de `1240px` (The One Container Rule).

### Don't:
- **Don't** agregar `box-shadow` en reposo a botones, cards o inputs — la única sombra en reposo del sistema es la del FAB de WhatsApp (The Flat-By-Default Rule).
- **Don't** introducir un gris neutro fuera de la familia `#141414`/`#0B0C0C`/`#1A1A1A` + opacidades de blanco (The Borrowed Neutral Rule).
- **Don't** usar Teal Quiet (`#17747C`) sobre fondo oscuro, ni Verde Rizoma/Cian Corriente como texto de cuerpo sobre la superficie clara — son acentos de superficie específica, no intercambiables entre los dos mundos de color del sistema.
- **Don't** rellenar los bloques de logos ("marcas que han confiado en TITA", "partners") con placeholders inventados más allá de los ya confirmados en `PRODUCT.md`.
