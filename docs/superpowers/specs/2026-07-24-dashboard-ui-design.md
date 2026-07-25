# Dashboard web — capa de interfaz (Fase 3, parte 1)

Fecha: 2026-07-24
Estado: aprobado, pendiente de plan de implementación

## 1. Alcance

Construir `apps/web`: las cuatro pantallas del dashboard como SPA, alimentadas por un
adaptador de datos ficticios. **No** entran en este trabajo la API HTTP, el magic link,
la cookie de sesión ni los tests de Playwright. Eso es la segunda parte de la Fase 3.

El criterio de terminado: `pnpm --filter @gym-tracker/web dev` levanta la SPA, se navega
entre las cuatro pantallas, y todas las cifras que muestran salen de cálculos reales de
`@gym-tracker/core` sobre series ficticias.

## 2. Origen del diseño

Proyecto de Claude Design `793b55ba-f555-423a-97c3-a42d81c862bf`
(«# Dashboard de entrenamientos con pesas», marca *IRONLOG*), importado vía el MCP
`claude_design`. Archivos tomados como referencia:

| Archivo | Aporta |
|---|---|
| `Overview.dc.html` | Pantalla Resumen |
| `Sessions.dc.html` | Pantalla Historial de sesión |
| `Routines.dc.html` | Pantalla Rutinas |
| `_ds/nocturne-…/styles.css` | Sistema de diseño Nocturne: tokens y clases |
| `_ds/nocturne-…/_ds_bundle.js` | Vacío (`"components":[]`). Nocturne es CSS puro |
| `support.js` | Runtime del previsualizador. Andamiaje, no producto |

La lógica dentro de los bloques `<script data-dc-script>` genera datos ficticios, pero
documenta comportamiento que sí queremos conservar: comparativa contra la sesión anterior
del mismo día de rutina, cálculo del *top set* con peso corporal, delta por ejercicio
(`+2.5 kg` / `+1 rep` / `held`), y el acotado de los campos numéricos del editor de rutinas.

## 3. Decisiones que se apartan de SPEC.md

Estas cinco resuelven conflictos entre el diseño importado y la especificación. SPEC.md y
DECISIONS.md se actualizan en consecuencia.

1. **Nocturne en vez de Tailwind + shadcn/ui.** `styles.css` se copia como hoja de tokens y
   los componentes usan sus clases y variables. Motivo: fidelidad exacta al diseño y un
   árbol de dependencias más pequeño, que es lo que persigue SPEC §12.
2. **SVG a mano en vez de Recharts.** Las gráficas del diseño (sparkline, área con
   degradado, heatmap, barras con banda de referencia) son ~15 líneas de SVG cada una y se
   ven mejor que Recharts por defecto. Recharts sale del stack.
3. **Textos en español.** El diseño está en inglés; SPEC §12 manda español. Se traduce, y se
   mantiene coherencia con `apps/server/src/bot/texts.ts`.
4. **Router propio.** Cuatro rutas planas sobre `hashchange`, ~30 líneas. No se añade
   `react-router`.
5. **Grupos musculares: el enum real.** El diseño usa dos conjuntos ad-hoc e incompatibles
   entre sí (Overview: Chest/Back/Shoulders/Quads/…; Sessions: Chest/Back/Legs/Arms/Core).
   Se ignoran ambos: manda `MUSCLE_GROUPS` de `packages/core/src/types.ts` (17 grupos) con
   `MUSCLE_GROUP_LABELS` para mostrar.

Además, se conserva el `@import` de Inter desde `fonts.googleapis.com` tal como viene en
`styles.css`. Decisión explícita del autor. Contrapartida asumida: una petición externa en
cada carga en frío; sin red, la tipografía cae al fallback `system-ui` del propio token.

## 4. Arquitectura

```
apps/web/
  index.html
  vite.config.ts
  src/
    main.tsx
    router.ts                 router hash, 4 rutas
    styles/nocturne.css       tokens + clases, del sistema de diseño
    data/
      types.ts                contratos de datos de pantalla
      mock.ts                 generador de series ficticias
    presenters/
      overview.ts  sessions.ts  routines.ts  exercise.ts
    components/
      Nav  Card  Tag  MetricTile  Sparkline  AreaChart
      Heatmap  VolumeBar  SetTable
    screens/
      Overview  Sessions  Routines  ExerciseDetail
```

### Regla estructural

**Los componentes no calculan.** Todo lo que en los `.dc.html` vive dentro de `renderVals()`
se traslada a `presenters/`: funciones puras que reciben datos de dominio y devuelven el
modelo de vista ya formateado. Los componentes reciben ese modelo y lo pintan. Es el mismo
principio que SPEC §3 impone al bot y a la API, aplicado a la capa de presentación.

**Los cálculos de negocio se importan, no se reescriben.** Tonelaje, series efectivas,
1RM estimado, récords, volumen semanal y estancamiento salen de `@gym-tracker/core`.
Ninguna de esas fórmulas puede aparecer en `apps/web`. Es SPEC §7 literal: dashboard y bot
invocan exactamente la misma lógica.

### Flujo de datos

```
mock.ts  ──▶  series crudas (weight_kg, reps, is_warmup, created_at, exercise_id)
                    │
                    ▼
            @gym-tracker/core  ──▶  tonelaje, 1RM, récords, estancamiento, volumen
                    │
                    ▼
            presenters/*.ts    ──▶  modelo de vista (cadenas ya formateadas, estilos)
                    │
                    ▼
            screens/*.tsx      ──▶  DOM
```

El mock produce **series crudas, no agregados**. Esto importa: cuando se conecte la API,
solo cambia el origen de las series. Presenters y componentes no se tocan. También respeta
SPEC §4, que prohíbe guardar agregados como fuente de verdad.

## 5. Pantallas

### 5.1 Resumen (`Overview`)

Del diseño, en este orden: cabecera con rutina activa y selector de semana; fila de cuatro
KPIs (series totales, tonelaje, sesiones, duración media) con variación respecto a la semana
anterior; **bloque de ejercicios estancados** como elemento más destacado, con tarjeta por
ejercicio (semanas estancado, sparkline plano, serie de trabajo actual); volumen semanal por
grupo muscular con banda de referencia 10–20 series; récords recientes; tendencia de tonelaje
en área; heatmap de consistencia de 13 semanas.

El bloque de estancamiento se alimenta de `detectStagnation` de `core`. El texto de sugerencia
que muestra el diseño («Deload to 90 kg, rebuild for 3 wks») es contenido inventado del
mockup: **no se implementa**, porque SPEC §12 prohíbe inventar funcionalidad no especificada.
En su lugar la tarjeta muestra el dato objetivo: semanas sin superar el máximo previo.

### 5.2 Historial de sesión (`Sessions`)

Panel izquierdo: chips de filtro por día de rutina con conteo, y lista de sesiones con
tonelaje, duración y número de series. Panel derecho: cabecera, tira de cuatro métricas,
banda de comparación contra la última vez que se entrenó ese mismo día de rutina, notas de
la sesión, y una tarjeta por ejercicio con su tabla de series (número o `W` para calentamiento,
peso × reps, RPE, descanso).

La comparación contra la sesión anterior del mismo día es requisito de SPEC §8.3, y el
diseño ya define su forma exacta: delta de tonelaje absoluto y porcentual, delta de duración,
y recuento de ejercicios que progresaron sobre el total comparable.

### 5.3 Rutinas (`Routines`)

Sidebar con rutinas activas y archivadas, marca de rutina activa, duplicar y archivar.
Editor con nombre editable, chips de día con conteo de ejercicios, y tabla de ejercicios
reordenable por arrastre con series objetivo, rango de repeticiones y descanso objetivo.
Panel de alta con buscador del catálogo y formulario de ejercicio propio con grupo muscular.

Acotados tomados del diseño: series 1–20, repeticiones 1–50, descanso 0–600 s en pasos de 15.

### 5.4 Detalle de ejercicio (`ExerciseDetail`)

No existe en el proyecto de diseño; se construye con los mismos patrones y tokens. Contenido
según SPEC §8.2: cabecera con nombre y tag de grupo muscular; tira de métricas (1RM estimado
actual, mejor histórico, series totales, descanso medio); gráfica de área de evolución del 1RM
con los récords marcados como puntos; barras de volumen por sesión; tabla del histórico de
series reutilizando `SetTable`; y comparación entre la mejor serie histórica y la más reciente.

## 6. Dependencias nuevas

| Paquete | Justificación |
|---|---|
| `react`, `react-dom` | Exigidos por SPEC §3 |
| `vite`, `@vitejs/plugin-react` | Exigidos por SPEC §3 |
| `@testing-library/react`, `jsdom` | Pruebas de componentes |

No se añaden Tailwind, shadcn/ui, Recharts ni react-router. Ver §3.

## 7. Pruebas

- **`presenters/`**: prioridad. Son funciones puras; se prueban con Vitest igual que `core`.
  Cubrir en particular el cálculo de deltas entre sesiones, el *top set* con peso corporal,
  el reparto de niveles del heatmap y la clasificación dentro/fuera de la banda 10–20.
- **`components/`**: pruebas de render con Testing Library, acotadas a los que tienen lógica
  de presentación propia (`SetTable`, `VolumeBar`, `Heatmap`).
- **`data/mock.ts`**: una prueba que verifique que produce series crudas consumibles por
  `core` sin adaptación.
- Playwright queda fuera de este trabajo.

## 8. Fuera de alcance

API HTTP, endpoints REST, magic link con token de un solo uso, cookie de sesión, rate
limiting, servido de estáticos desde `apps/server`, y end-to-end con Playwright. Todo eso
es la segunda parte de la Fase 3 y va en su propio spec.
