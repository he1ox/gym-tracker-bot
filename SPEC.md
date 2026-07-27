# Especificación del proyecto — Gym Tracker Bot

Eres el desarrollador principal de este proyecto. Este documento es la fuente de verdad.
Léelo completo antes de escribir código y reléelo al inicio de cada sesión de trabajo.

---

## 1. Qué vamos a construir

Una aplicación personal de registro de entrenamientos de gimnasio compuesta por dos
interfaces sobre un mismo backend:

- Un **bot de Telegram** para registrar las series en tiempo real, durante el entrenamiento.
- Un **dashboard web** para analizar el progreso histórico y gestionar rutinas.

Todo corre en la máquina del usuario final (local-first, self-hosted). No hay nube, no hay
cuentas, no hay servicio central. Los datos nunca salen del equipo del usuario salvo por el
propio Telegram.

**Objetivo real del proyecto:** que su autor lo use todos los días en el gimnasio. La
usabilidad durante el entrenamiento tiene prioridad sobre cualquier otra consideración.

---

## 2. Principios de producto

1. **Fricción cero durante el entreno.** Registrar una serie debe tomar menos de 3 segundos
   y como máximo dos toques. Si una decisión de diseño añade un paso al flujo de captura,
   está mal.
2. **Nada de rutinas predefinidas.** El sistema no impone ninguna estructura de
   entrenamiento. El usuario crea sus propias rutinas, con los nombres, días y ejercicios
   que quiera. No asumas Push/Pull/Legs, Full Body, Arnold ni ninguna otra.
3. **Instalación en un comando.** Cualquier persona debe poder instalarlo sin editar
   archivos de configuración ni instalar servicios adicionales.
4. **Cero dependencias externas en tiempo de ejecución.** Sin base de datos externa, sin
   Redis, sin colas, sin servicios en la nube.
5. **Sin gamificación.** Nada de medallas, puntos, rachas motivacionales ni funciones
   sociales. El usuario quiere datos para decidir qué peso poner mañana.

---

## 3. Arquitectura

Un único proceso que hace tres cosas:

- Corre el bot de Telegram mediante **long polling**.
- Expone una **API HTTP** de lectura y escritura.
- Sirve el **dashboard** como archivos estáticos, en el mismo puerto.

Los datos viven en un archivo **SQLite**.

Regla estructural innegociable: **el bot y la API son adaptadores delgados**. Toda la lógica
de negocio vive en un paquete de dominio que no sabe que Telegram ni HTTP existen. Si te
encuentras calculando volumen o detectando récords dentro de un handler de Telegram, estás
violando la arquitectura.

### Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node 22+ (o Bun si se opta por binario único; decidir en Fase 4) |
| Lenguaje | TypeScript en modo estricto |
| Bot | grammY + `@grammyjs/conversations` |
| Servidor HTTP | Hono |
| Base de datos | SQLite mediante `node:sqlite` o `bun:sqlite` |
| ORM y migraciones | Drizzle ORM + Drizzle Kit |
| Frontend | Vite + React + TypeScript |
| Estilos | CSS plano con custom properties (sistema de diseño Nocturne) |
| Gráficas | SVG escrito a mano en el dashboard; Chart.js sobre skia-canvas en el bot |
| Enrutado del dashboard | router propio sobre `hashchange` |
| Tests | Vitest + Testing Library |
| Monorepo | pnpm workspaces |

Las tres filas de estilos, gráficas y enrutado se apartan de la intención original
(Tailwind + shadcn/ui, Recharts, `react-router`). El motivo y la contrapartida de cada una
están en `DECISIONS.md`.

**Prohibido usar `better-sqlite3`** ni cualquier otro módulo nativo que **exija un compilador**
en la máquina del usuario: rompe las instalaciones de quien no lo tiene. Sí se admiten módulos
nativos que distribuyan **binarios precompilados por plataforma** y no compilen nada al
instalarse; `skia-canvas`, que rasteriza las gráficas del bot, entra por esa puerta
(ver `DECISIONS.md`).

### Estructura del repositorio

```
apps/
  server/       bot (grammY) + API (Hono) + servido de estáticos
  web/          dashboard (Vite + React)
packages/
  core/         lógica de dominio pura, sin dependencias de I/O
  db/           esquema Drizzle, migraciones, repositorios
cli/            asistente de instalación
Dockerfile
docker-compose.yml
```

`packages/core` no puede importar nada de grammY, Hono, Drizzle ni del navegador. Solo
funciones puras sobre tipos propios.

---

## 4. Modelo de datos

```
users
  id, telegram_user_id, timezone, created_at

exercises
  id, user_id (nullable = catálogo base), name, muscle_group, is_custom, archived

routines
  id, user_id, name, is_active, archived, created_at

routine_days
  id, routine_id, name, position

routine_exercises
  id, routine_day_id, exercise_id, position,
  target_sets, target_reps_min, target_reps_max, target_rest_seconds

workouts
  id, user_id, routine_day_id (NULLABLE), day_name_snapshot,
  started_at, finished_at, notes

sets
  id, workout_id, exercise_id, position, weight_kg, reps,
  rpe (nullable), rest_seconds (nullable), is_warmup, created_at

processed_updates
  update_id, processed_at
```

### Reglas de integridad

- **`routine_day_id` es nullable**: se permiten entrenamientos libres sin rutina asociada.
- **`day_name_snapshot`**: al crear un workout se guarda el nombre del día tal como estaba
  en ese momento. Editar o archivar una rutina jamás debe alterar el histórico.
- **Nunca borrar físicamente** rutinas ni ejercicios que tengan histórico asociado. Usar la
  bandera `archived`.
- **Granularidad por serie individual.** No guardes agregados: volumen, récords y 1RM
  estimado se calculan a partir de `sets`. Si necesitas rendimiento, usa vistas o caché,
  nunca columnas desnormalizadas como fuente de verdad.
- El usuario puede crear ejercicios propios y asignarles grupo muscular. Toda la analítica
  por músculo depende de esa asignación.

---

## 5. Lógica de dominio (`packages/core`)

Implementa y testea estas funciones antes que cualquier otra cosa:

- **Tonelaje** de una serie: `weight_kg × reps`. De una sesión: suma de sus series efectivas.
- **Series efectivas**: series con `is_warmup = false`.
- **Volumen semanal por grupo muscular**: conteo de series efectivas agrupadas por
  `muscle_group` dentro de una ventana de 7 días.
- **1RM estimado** (fórmula de Epley): `weight_kg × (1 + reps / 30)`. Considera solo series
  efectivas. El 1RM de una sesión es el máximo entre sus series.
- **Récord personal**: nuevo máximo histórico de 1RM estimado para un ejercicio dado.
- **Detección de estancamiento**: ejercicios cuyo mejor 1RM estimado no ha superado su
  máximo previo en 3 o más semanas, considerando solo semanas en las que sí se entrenó ese
  ejercicio. Este cálculo es el insight más valioso del producto; documéntalo bien y
  cúbrelo con tests exhaustivos, incluyendo casos borde.
- **Parser de texto libre**: convierte cadenas como `60x8`, `60 x 8`, `60x8 rpe8`,
  `press inclinado 32.5x10` en una serie estructurada. Debe ser tolerante a espacios,
  comas decimales y mayúsculas.
- **Descanso**: se deriva de la diferencia entre los `created_at` de series consecutivas
  del mismo workout, no se pide al usuario.

Todas estas funciones son puras y deterministas. Reciben datos, devuelven datos.

---

## 6. Bot de Telegram

### Flujo de captura

Máquina de estados por usuario. El bot mantiene **un solo mensaje activo** por sesión y lo
actualiza con `editMessageText`; nunca envía un mensaje nuevo por cada serie. El chat debe
quedar limpio al terminar el entrenamiento.

Flujo mínimo:

1. `/start` inicia una sesión. Ofrece elegir un día de una rutina existente o entrenar libre.
2. Muestra los ejercicios del día con teclado inline. Permite agregar uno fuera de la rutina.
3. Al elegir ejercicio, muestra la última serie registrada de ese ejercicio como referencia
   (peso y reps de la sesión anterior). Esto es esencial: es la información que el usuario
   necesita para decidir el peso de hoy.
4. Registra series por dos vías, ambas disponibles siempre:
   - **Botones**: repetir la serie anterior, ajustar peso, ajustar reps.
   - **Texto libre**: `60x8`, procesado por el parser.
5. Al terminar una serie, opcionalmente programa un aviso de descanso.
6. `/finish` cierra la sesión, calcula el resumen, avisa de récords conseguidos y envía la
   gráfica del volumen de la semana por grupo muscular.

### Otros comandos

- `/dashboard` — genera un enlace de acceso de un solo uso al dashboard.
- `/routines` — gestión de rutinas desde el bot (crear, editar días y ejercicios).
- `/backup` — envía el archivo `.db` por Telegram.
- `/last <ejercicio>` — consulta rápida del histórico reciente de un ejercicio.
- `/stagnant` — ejercicios cuyo mejor 1RM estimado lleva 3 o más semanas entrenadas sin
  superar su máximo previo.
- `/settings` — idioma (español/inglés) y unidad de peso (kg/lb), además del salto de los
  botones de peso (1, 2.5, 5, 10).

### Idioma y unidades

El idioma inicial sale del `language_code` de Telegram: si empieza por `es` el bot habla
español, y en cualquier otro caso inglés, que es el idioma de reserva.

**La unidad de peso es solo una etiqueta: cambiarla no convierte nada.** `sets.weight_kg`
guarda el número tal cual lo escribió el usuario, en la unidad que tuviera configurada en
ese momento, así que el histórico de quien cambie de unidad mezcla kg y lb, y los agregados
que crucen el cambio (tonelaje, récords, 1RM) suman valores heterogéneos.

### Robustez

- Guarda cada `update_id` procesado en `processed_updates` y descarta duplicados: Telegram
  reintenta y no debe registrarse la misma serie dos veces.
- Toda escritura de una serie debe ser atómica.
- Si el proceso se reinicia a mitad de un entrenamiento, la sesión debe poder retomarse.

---

## 7. API HTTP

REST sobre JSON. Cubre lectura de analítica y CRUD completo de rutinas, ejercicios y
sesiones, porque **el dashboard también escribe**.

- Autenticación por cookie de sesión, obtenida al canjear un token de un solo uso generado
  por el comando `/dashboard`. El token expira en 5 minutos y solo puede canjearse una vez.
- Rate limiting en el endpoint de canje.
- El dashboard y el bot invocan exactamente la misma lógica de `core`. Ninguna regla de
  negocio puede estar duplicada entre ambos.

---

## 8. Dashboard

Cuatro pantallas. Estilo minimalista, modo oscuro por defecto, un solo color de acento
reservado para lo accionable, cifras en fuente monoespaciada, gráficas despojadas de
adornos. Escritorio a 1440px como referencia; Resumen y Rutinas deben funcionar bien a
390px.

1. **Resumen** — métricas de la semana con variación respecto a la anterior; volumen semanal
   por grupo muscular con referencia del rango 10-20 series; **alerta de estancamiento**
   (elemento más destacado de la pantalla); récords recientes; tendencia de tonelaje de las
   últimas 8-12 semanas; heatmap de consistencia de 3 meses.
2. **Detalle de ejercicio** — evolución del 1RM estimado con récords marcados; volumen por
   sesión; tabla del histórico de series; mejor serie histórica frente a la más reciente;
   evolución del descanso promedio.
3. **Historial de sesión** — lista filtrable; vista de sesión con todas sus series y
   comparación contra la última vez que se entrenó ese mismo día de rutina.
4. **Rutinas** — pantalla de edición: lista de rutinas con duplicar y archivar; editor con
   días y ejercicios reordenables por arrastre, series objetivo, rango de repeticiones y
   descanso objetivo; buscador del catálogo con opción de crear ejercicio propio.

---

## 9. Instalación, distribución y operación

Dos perfiles, un mismo artefacto:

| | Escritorio | Servidor |
|---|---|---|
| Escucha en | `127.0.0.1` | `0.0.0.0` |
| Abre navegador al arrancar | Sí | No |
| Autenticación | Opcional | Obligatoria |

### Requisitos del instalador

- Modo **interactivo**: pide el token del bot (con instrucciones para obtenerlo de
  @BotFather y validación contra la API de Telegram), detecta la zona horaria del sistema y
  ofrece instalar el servicio de arranque automático.
- Modo **no interactivo** por flags y variables de entorno, para provisionar servidores:
  `--token`, `--tz`, `--profile`, `--port`, `--service`.
- Instala el servicio del sistema: systemd en Linux, launchd en macOS, Task Scheduler en
  Windows. Genera la unidad automáticamente; el usuario nunca la escribe a mano.
- Ejecuta las migraciones pendientes en cada arranque.
- Si el puerto está ocupado, busca el siguiente libre y avisa; no truena.

### Servicio

- Usuario dedicado, nunca root. `Restart=always` con `RestartSec`.
- El token vive en un archivo de entorno con permisos `600`, jamás en el repositorio ni en
  la imagen.
- Logs a **stdout** exclusivamente; journald o Docker se encargan del resto. No implementes
  rotación de logs propia.
- Manejo de `SIGTERM`: cierra el polling y hace flush a SQLite antes de terminar.
- Healthcheck que verifique que el polling sigue vivo, no solo que el proceso existe.

### Datos

- El archivo `.db` vive en la ruta estándar del sistema operativo
  (`~/.local/share/`, `~/Library/Application Support/`, `%APPDATA%`), nunca junto al
  ejecutable. Una actualización jamás debe poder borrar entrenamientos.
- En Docker, ese directorio va en un volumen.
- Respaldo semanal automático además del comando `/backup`.

### Multiusuario

Aislamiento por `user_id` correcto desde el inicio, aunque el uso típico sea de una persona.
Variable `ALLOWED_TELEGRAM_IDS`; por defecto, solo el dueño de la instancia.

### Otros detalles

- Zona horaria: guarda todo en UTC y la zona del usuario por separado. Un entrenamiento de
  las 8 PM en UTC-6 no puede registrarse como del día siguiente.
- Imágenes Docker versionadas (`:1.2.0` además de `:latest`).

---

## 10. Testing

El autor del proyecto es ingeniero de QA especializado en automatización; la calidad de la
suite de pruebas importa tanto como la del código.

- **`packages/core`**: cobertura alta con tests unitarios. Es la prioridad absoluta.
- **Bot**: guarda fixtures JSON de updates reales de Telegram y ejecútalos contra los
  handlers. Es la suite de regresión del flujo conversacional.
- **API**: tests de integración contra una base SQLite en memoria.
- **Dashboard**: end-to-end con Playwright sobre los flujos críticos.

---

## 11. Plan de trabajo

Trabaja **una fase a la vez**. No avances a la siguiente sin que la anterior cumpla su
criterio de aceptación. Al terminar cada fase, detente y reporta.

**Fase 0 — Fundaciones.** Monorepo, esquema Drizzle con migraciones, y `packages/core`
completo con sus tests. Ninguna línea de Telegram todavía.
*Aceptación:* los tests calculan volumen, 1RM, récords y estancamiento sobre datos ficticios.

**Fase 1 — Bot mínimo.** Polling, máquina de estados, escritura a SQLite. Sin dashboard, sin
instalador.
*Aceptación:* se puede registrar un entrenamiento completo desde Telegram con menos de 3
segundos de fricción por serie.

**Fase 2 — Uso real.** Sin funciones nuevas. Solo corrección de fricción a partir del uso
diario del autor.
*Aceptación:* la decide el autor tras usarlo varias semanas.

**Fase 3 — Dashboard.** API, SPA, magic link y las cuatro pantallas.
*Aceptación:* se puede ver la progresión de un ejercicio y editar una rutina desde la web.

**Fase 4 — Empaquetado.** Dockerfile multi-stage, unidad de servicio, asistente de
instalación, comando de respaldo, README con GIF del flujo.
*Aceptación:* una persona ajena al proyecto lo instala sin hacer preguntas.

**Fase 5 — Refinamiento.** Exportación a CSV, recordatorios, webhook opcional, binario único.

---

## 12. Cómo quiero que trabajes

- **Pregunta antes de asumir.** Ante cualquier ambigüedad de producto, detente y consulta.
  No inventes funcionalidades que no están en este documento.
- **Commits pequeños y descriptivos**, en inglés, formato Conventional Commits.
- **Código e identificadores en inglés. Textos de interfaz y del bot en español.**
- **Justifica cada dependencia nueva** antes de agregarla. El objetivo es un árbol de
  dependencias pequeño: cada paquete es superficie de fallo en instalaciones ajenas.
- **TypeScript estricto.** Nada de `any` sin comentario que lo justifique.
- **Mantén un `DECISIONS.md`** con las decisiones técnicas relevantes y su motivo. Este
  documento describe el qué; ese registra el porqué de lo que vaya surgiendo.
- **Tests junto al código**, no al final del proyecto.
- **No optimices prematuramente.** Con años de datos de un usuario, SQLite y consultas
  directas sobran.

---

## 13. Decisiones abiertas

Consúltalas con el autor cuando llegues al punto en que importen. No las resuelvas por tu
cuenta.

1. Si el usuario agrega un ejercicio desde el bot en medio de un entrenamiento, ¿se modifica
   la rutina de forma permanente o solo la sesión de hoy?
2. ¿El aviso de descanso es automático tras cada serie o se activa manualmente?
3. ¿Qué debe contener el catálogo base de ejercicios, o se arranca completamente vacío?
4. Runtime definitivo para el binario único: Node con SEA o Bun compile.
