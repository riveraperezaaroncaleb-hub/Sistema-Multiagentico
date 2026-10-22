---
name: Ecosistema IA — Swarm Enterprise
description: Sistema de diseño para un chat multi-IA con orquestadora, aprobación humana, control de gasto y trazabilidad.
colors:
  background: '#0f131c'
  surface-lowest: '#0a0e16'
  surface-low: '#181c24'
  surface: '#1c2028'
  surface-high: '#262a33'
  surface-highest: '#31353e'
  on-surface: '#dfe2ee'
  on-surface-variant: '#cbc3d7'
  outline: '#958ea0'
  outline-variant: '#494454'
  primary: '#a078ff'
  primary-soft: '#d0bcff'
  on-primary: '#23005c'
  secondary: '#4edea3'
  on-secondary: '#003824'
  warning: '#ffb95f'
  on-warning: '#472a00'
  error: '#ffb4ab'
  error-strong: '#ef4444'
  agent-directora: '#a855f7'
  agent-programadora: '#06b6d4'
  agent-redactora: '#f97316'
  agent-investigadora: '#14b8a6'
  agent-analista: '#ec4899'
  agent-creativa: '#eab308'
  agent-revisora: '#10b981'
  agent-acciones: '#60a5fa'
typography:
  display:   {fontFamily: Plus Jakarta Sans, fontSize: 40px, fontWeight: '700', lineHeight: 48px, letterSpacing: -0.02em}
  headline-lg: {fontFamily: Plus Jakarta Sans, fontSize: 28px, fontWeight: '600', lineHeight: 36px, letterSpacing: -0.01em}
  headline-md: {fontFamily: Plus Jakarta Sans, fontSize: 20px, fontWeight: '600', lineHeight: 28px}
  title:     {fontFamily: Inter, fontSize: 16px, fontWeight: '600', lineHeight: 24px}
  body-lg:   {fontFamily: Inter, fontSize: 16px, fontWeight: '400', lineHeight: 26px}
  body-md:   {fontFamily: Inter, fontSize: 14px, fontWeight: '400', lineHeight: 22px}
  label:     {fontFamily: Inter, fontSize: 12px, fontWeight: '500', lineHeight: 16px, letterSpacing: 0.02em}
  overline:  {fontFamily: Inter, fontSize: 11px, fontWeight: '600', lineHeight: 14px, letterSpacing: 0.06em}
  mono:      {fontFamily: JetBrains Mono, fontSize: 12px, fontWeight: '400', lineHeight: 18px}
rounded: {sm: 6px, md: 8px, lg: 12px, xl: 16px, 2xl: 24px, full: 9999px}
spacing: {xs: 4px, sm: 8px, md: 16px, lg: 24px, xl: 40px}
---

## 1. Principios

1. **Confianza visible.** Todo lo que hizo una IA (quién, cuánto costó, si fue revisado) se ve sin abrir menús.
2. **El humano manda.** Ninguna acción real (enviar, borrar, gastar, agendar) ocurre sin un botón de aprobar.
3. **Calma.** Fondo oscuro sobrio; el color se reserva para significado (agente, estado, alerta), nunca decoración.
4. **Primero que funcione.** Pocos componentes, bien hechos y reutilizables.

## 2. Reglas de color

- **Una sola fuente de verdad:** usa los tokens de arriba. No inventes hex nuevos.
- **Violeta `primary`:** acción principal y foco. Una sola acción primaria por vista.
- **Esmeralda `secondary`:** verificado, aprobado, código revisado, recibo válido.
- **Ámbar `warning`:** presupuesto al 80%, aprobación pendiente, failover en uso.
- **Rojo `error`:** fallo de conexión, tope superado, acción rechazada.
- **Colores de agente:** solo en avatar, línea izquierda del mensaje, chip `@mención` y gráficos. Nunca para botones ni estados.
- **Nunca solo color:** todo estado lleva también icono y texto (accesibilidad daltonismo).
- **Contraste:** texto normal mínimo 4.5:1, texto grande y bordes de controles 3:1.

## 3. Tipografía

- **Plus Jakarta Sans:** títulos, nombres de agentes, métricas grandes.
- **Inter:** chat, tablas, formularios, todo el texto corrido.
- **JetBrains Mono:** código, tokens, hashes, latencia (ms), costos.
- **Importante:** declarar siempre la pila con fallback (`'Inter', system-ui, sans-serif`). En las pantallas actuales algunos textos caen a serif; eso no debe pasar.
- Las respuestas de IA usan `body-md`/`body-lg` con interlineado 155–160%. Máximo 75 caracteres por línea.
- Números en tablas y medidores: `font-variant-numeric: tabular-nums`.

## 4. Layout

- **Escritorio (≥1200px):** 3 zonas. Navegación izquierda 260px · chat central (máx. 880px) · panel derecho de inspección 360px (colapsable).
- **Tablet (768–1199px):** navegación como barra de iconos; inspección como panel superpuesto.
- **Móvil (<768px):** una columna. Navegación en barra inferior (Chat, Panel, Skills, Ajustes). Inspección y aprobaciones como *bottom sheet*.
- **Barra superior fija:** estado de la directora, medidor de gasto del día, botón "Compartir pantalla", notificaciones.
- **Espaciado:** múltiplos de 4px. Padding de tarjetas 16–24px. Gap entre mensajes 16px.
- **Regla de ancho mínimo:** ninguna tarjeta de acción o aprobación baja de 320px. En la pantalla actual la tarjeta de aprobación queda angosta y el texto se parte en cada palabra: debe ocupar el ancho completo del chat, con el texto a la izquierda y los botones a la derecha (en móvil, botones debajo).

## 5. Elevación

Profundidad por capas tonales, no por sombras pesadas.

| Nivel | Fondo | Uso |
|---|---|---|
| 0 | `background` | Lienzo |
| 1 | `surface-low` + borde `outline-variant` al 40% | Paneles, barras |
| 2 | `surface` + borde `outline-variant` | Tarjetas, mensajes |
| 3 | `surface-high` + blur 16px + sombra `0 24px 48px -12px rgba(0,0,0,.65)` | Modales, aprobaciones, consentimiento |

**Glow:** solo en el agente que está trabajando ahora o en una aprobación pendiente. Un solo elemento con glow a la vez. Pulso de 2s, y se desactiva con `prefers-reduced-motion`.

## 6. Componentes

### Botones
- **Primario:** fondo `primary`, texto `on-primary`, radio `xl`, alto 40px. Hover: más claro + halo 8px.
- **Aprobar:** fondo `secondary`, texto `on-secondary`. **Rechazar:** fantasma con borde `outline`.
- **Destructivo:** fondo `error-strong` solo tras confirmación.
- **Secundario/Fantasma:** sin relleno, texto `on-surface-variant`, hover `surface-high`.
- Estado deshabilitado: opacidad 40% y cursor `not-allowed`. Estado cargando: spinner + texto ("Enviando…").

### Command Dock (campo de mensaje)
- Fijo abajo, radio `2xl`, borde `outline-variant`, foco con borde `primary` + anillo 3px al 20%.
- Contiene: adjuntar, selector de agente/skill, campo, contador de tokens (mono), micrófono, enviar.
- La **skill activa** se muestra como un solo chip encima del campo. Si hay varias, se agrupan en "+2" con menú (hoy se amontonan en una línea).
- Enter envía; Shift+Enter hace salto de línea (mostrarlo como pista pequeña).

### Mensaje de IA
- Avatar 36px con borde del color del agente, nombre, chip del modelo (mono), hora.
- Línea izquierda de 3px del color del agente.
- Debajo del contenido, en este orden: sello de seguridad (si hubo código), botón **Ver comprobante**, costo del mensaje.
- Bloque colapsable "Razonamiento" cerrado por defecto, fondo `surface-lowest`, texto mono.
- Mientras responde: puntos animados + glow del agente. Si falla: borde `error` y botón "Reintentar".

### Aprobación humana (tarjeta crítica)
- Nivel 3, borde superior ámbar, ancho completo del chat.
- Estructura: icono · "Aprobación requerida" (overline ámbar) · una frase clara de qué hará la IA · datos clave (fecha, destinatarios, costo) en lista corta · botones **Rechazar / Aprobar**.
- Tras decidir, la tarjeta se colapsa a una línea con el resultado ("Aprobado por Elena · 10:42") y queda en el registro.
- Nunca se auto-aprueba ni expira en silencio: si caduca, dice "Caducó sin respuesta".

### Medidor de gasto
- Barra delgada en la barra superior: `$ gastado / tope` + porcentaje. Verde <60%, ámbar 60–99%, rojo al llegar al tope.
- Al 80%: aviso en ámbar. Al 100%: la IA se detiene y aparece "Tope alcanzado · Continuar con +$X" (acción explícita del usuario).

### Tarjeta de proveedor (llaves)
- Logo, nombre, estado (Conectado / Error / En espera) con icono, latencia (mono).
- La llave siempre enmascarada (`sk-ant-…c9fa`); se puede reemplazar, **nunca ver completa de nuevo**. Sin botón de copiar la llave completa.
- Acciones: Probar conexión, Reemplazar. Errores explican la causa en lenguaje simple ("Cuota agotada, usando IA de reserva").

### Tabla de roles y failover
- Columnas: Puesto · IA titular · IA de reserva · Criterio de cambio · Estado.
- Estados: **Titular** (verde), **Failover en uso** (ámbar), **Sin reserva** (rojo).
- En móvil se convierte en tarjetas apiladas, una por puesto.

### Badges
Pastilla `full`, relleno al 12%, borde 1px y texto del mismo tono, siempre con icono: Verificado, Revisión humana, Failover, Error, Código revisado, Generado por IA.

### Etiqueta "Generado por IA"
Obligatoria en todo mensaje de agente (pequeña, junto al nombre). En el primer ingreso se muestra el aviso "Estás hablando con una IA".

### Pantalla compartida (consentimiento)
- Modal antes de compartir: qué verá la IA, que no se guardan capturas, botones **Cancelar / Entiendo, compartir**.
- Mientras se comparte: indicador **rojo fijo** "Compartiendo pantalla" en la barra superior con botón **Detener** siempre visible.
- Las capturas se envían reducidas y solo cuando el usuario lo pide.

### Creador de skills
- Editor de texto grande con ejemplo de plantilla ("Nombre · Cuándo usarla · Instrucciones · Qué no debe hacer").
- Estado de la skill: Borrador → En revisión → Activa. Toda skill nueva inicia **sin permiso para actuar** (interruptor apagado y etiqueta visible).
- Vista previa lateral: cómo la vería la directora (solo nombre y descripción).

### Panel empresarial / auditoría
- Tarjetas de métricas arriba (gasto, tareas completadas, horas ahorradas, tasa de aprobación).
- Registro de acciones filtrable por agente, fecha y estado, con exportar CSV.
- Cada fila: hora, agente, acción, costo, sello, enlace al comprobante.

### Toggles y checkboxes
Carril `surface-highest`; activado `primary`. Checkbox radio `sm`, activado `primary` con check blanco. Área táctil mínima 44px.

## 7. Estados que toda vista debe tener

Cargando (esqueletos, no spinners en pantalla completa) · Vacío (icono + una frase + un botón) · Error (qué pasó + cómo seguir) · Sin conexión · Sin presupuesto · Sin llaves configuradas (lleva a Ajustes).

## 8. Movimiento

- Transiciones de 150–200ms (`ease-out`). Paneles y sheets 250ms.
- Solo se animan: aparición de mensajes, glow del agente activo, colapso de aprobaciones.
- Respetar `prefers-reduced-motion`: sin pulsos ni deslizamientos.

## 9. Accesibilidad (mínimos obligatorios)

- Navegación completa con teclado; foco visible (anillo `primary` 2px con separación 2px).
- Orden de foco lógico; el modal atrapa el foco y se cierra con Esc.
- `aria-live="polite"` para mensajes nuevos de IA; `aria-live="assertive"` para aprobaciones y errores.
- Iconos con texto alternativo; ningún dato solo por color.
- Objetivos táctiles ≥44×44px en móvil.

## 10. Textos (español de Costa Rica, tono directo)

- Usar "tú/usted" de forma consistente: **tú**.
- Botones con verbos: "Aprobar", "Probar conexión", "Guardar skill".
- Errores sin tecnicismos: "No pude conectar con OpenAI. Revisa tu llave."
- Moneda en USD con dos decimales (`$0,40`); fechas `22 oct 2026, 10:42`.

## 11. Iconos

Material Symbols Outlined, trazo 400, 20px en interfaz y 24px en navegación. Un solo estilo en toda la app; relleno (`FILL 1`) solo para el elemento activo.

## 12. Qué NO hacer

- No usar más de un botón primario por vista.
- No mostrar llaves completas ni permitir copiarlas.
- No poner dos elementos con glow al mismo tiempo.
- No esconder el costo ni el estado de revisión de una respuesta.
- No mezclar fuentes fuera de las tres definidas.
- No usar colores de agente para estados (verde/ámbar/rojo son solo de estado).
