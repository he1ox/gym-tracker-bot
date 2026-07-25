import { useState } from 'react';
import { clampInt } from '../presenters/routines';
import type { RoutineExerciseRow, RoutinesModel } from '../presenters/routines';

/** Only the numeric targets are editable; the name and label come from the catalog. */
type EditableField = 'targetSets' | 'targetRepsMin' | 'targetRepsMax' | 'targetRestSeconds';

export function Routines({ model }: { model: RoutinesModel }) {
  const firstCard = model.cards.find((c) => !c.archived) ?? model.cards[0];
  const [routineId, setRoutineId] = useState<number | undefined>(firstCard?.id);
  const days = routineId === undefined ? [] : model.daysFor(routineId);
  const [dayId, setDayId] = useState<number | undefined>(days[0]?.id);
  const currentDayId = days.some((d) => d.id === dayId) ? dayId : days[0]?.id;

  const [rows, setRows] = useState<RoutineExerciseRow[]>(
    routineId !== undefined && currentDayId !== undefined ? model.exercisesFor(routineId, currentDayId) : [],
  );
  const [dragId, setDragId] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const selectDay = (id: number) => {
    setDayId(id);
    if (routineId !== undefined) setRows(model.exercisesFor(routineId, id));
  };
  const selectRoutine = (id: number) => {
    setRoutineId(id);
    const next = model.daysFor(id)[0];
    setDayId(next?.id);
    setRows(next === undefined ? [] : model.exercisesFor(id, next.id));
  };
  const update = (id: number, field: EditableField, value: number) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };
  const move = (fromId: number, toId: number) => {
    setRows((prev) => {
      const from = prev.findIndex((r) => r.id === fromId);
      const to = prev.findIndex((r) => r.id === toId);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (moved === undefined) return prev;
      next.splice(to, 0, moved);
      return next;
    });
  };

  const query = search.trim().toLowerCase();
  const results = model.catalog.filter((c) => query === '' || c.name.toLowerCase().includes(query)).slice(0, 40);
  const COLUMNS = '26px 1fr 66px 108px 78px 34px';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>Rutinas</h3>
        {model.cards.filter((c) => !c.archived).map((card) => (
          <div
            key={card.id}
            onClick={() => selectRoutine(card.id)}
            style={{
              padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
              background: 'var(--color-surface)',
              boxShadow: card.id === routineId ? '0 0 0 1px var(--color-accent)' : 'var(--shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15 }}>{card.name}</div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>{card.meta}</div>
              </div>
              {card.isActive && <span className="tag tag-outline" style={{ flex: 'none' }}>Activa</span>}
            </div>
          </div>
        ))}
        {model.cards.some((c) => c.archived) && (
          <>
            <div className="text-muted" style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Archivadas
            </div>
            {model.cards.filter((c) => c.archived).map((card) => (
              <div
                key={card.id}
                onClick={() => selectRoutine(card.id)}
                style={{
                  padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  background: 'var(--color-surface)', boxShadow: 'var(--shadow-sm)', opacity: 0.75,
                }}
              >
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 14 }}>{card.name}</div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>{card.meta}</div>
              </div>
            ))}
          </>
        )}
      </aside>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {days.map((day) => (
            <button
              key={day.id}
              onClick={() => selectDay(day.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px',
                fontFamily: 'var(--font-heading)', fontSize: 14, borderRadius: 'var(--radius-md)',
                cursor: 'pointer', background: 'transparent',
                color: day.id === currentDayId ? 'var(--color-accent)' : 'var(--color-text)',
                border: `1px solid ${day.id === currentDayId ? 'var(--color-accent)' : 'var(--color-divider)'}`,
              }}
            >
              {day.name}
              <span style={{
                fontSize: 11, padding: '1px 7px', borderRadius: 20,
                background: day.id === currentDayId
                  ? 'color-mix(in srgb, var(--color-accent) 20%, transparent)'
                  : 'var(--color-neutral-800)',
              }}>{day.count}</span>
            </button>
          ))}
        </div>

        <div className="card elev-sm" style={{ padding: 'var(--space-8)', gap: 'var(--space-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={() => setAddOpen(!addOpen)} style={{ padding: '6px 12px' }}>
              {addOpen ? 'Cerrar' : 'Añadir ejercicio'}
            </button>
          </div>

          {addOpen && (
            <div style={{
              border: '1px solid var(--color-accent-700)', borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg)', padding: 'var(--space-6)',
              display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
            }}>
              <input
                className="input"
                placeholder="Buscar en el catálogo de ejercicios…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 260, overflow: 'auto' }}>
                {results.length === 0 ? (
                  <div className="text-muted" style={{ fontSize: 12, padding: '10px 8px' }}>
                    Sin coincidencias en el catálogo.
                  </div>
                ) : results.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => setRows((prev) => [...prev, {
                      id: -Date.now(), exerciseId: entry.id, name: entry.name,
                      muscleLabel: entry.muscleLabel, targetSets: 3,
                      targetRepsMin: 8, targetRepsMax: 12, targetRestSeconds: 90,
                    }])}
                    style={{
                      display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 8px',
                      background: 'transparent', border: 'none',
                      borderBottom: '1px solid var(--color-divider)', cursor: 'pointer',
                      color: 'var(--color-text)', textAlign: 'left', font: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{entry.name}</span>
                    <span className="tag tag-accent">{entry.muscleLabel}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{
            display: 'grid', gridTemplateColumns: COLUMNS, gap: 12, padding: '0 4px 8px',
            fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'color-mix(in srgb, var(--color-text) 55%, transparent)',
          }}>
            <span /><span>Ejercicio</span>
            <span style={{ textAlign: 'center' }}>Series</span>
            <span style={{ textAlign: 'center' }}>Repeticiones</span>
            <span style={{ textAlign: 'center' }}>Descanso</span>
            <span />
          </div>

          {rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', border: '1px dashed var(--color-divider)', borderRadius: 'var(--radius-md)' }}>
              <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Este día no tiene ejercicios todavía.</p>
            </div>
          ) : rows.map((row) => (
            <div
              key={row.id}
              draggable
              onDragStart={() => setDragId(row.id)}
              onDragOver={(e) => { e.preventDefault(); if (dragId !== undefined && dragId !== row.id) move(dragId, row.id); }}
              onDragEnd={() => setDragId(undefined)}
              style={{
                display: 'grid', gridTemplateColumns: COLUMNS, gap: 12, alignItems: 'center',
                padding: '8px 4px', borderBottom: '1px solid var(--color-divider)',
                opacity: dragId === row.id ? 0.5 : 1,
              }}
            >
              <span style={{ cursor: 'grab', textAlign: 'center', color: 'color-mix(in srgb, var(--color-text) 40%, transparent)' }} title="Arrastra para reordenar">⋮⋮</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: 'var(--font-heading)', fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.name}
                </span>
                <span className="tag tag-accent" style={{ marginTop: 4 }}>{row.muscleLabel}</span>
              </span>
              <input className="input" type="number" value={row.targetSets} style={{ minHeight: 34, textAlign: 'center', padding: 4 }}
                     onChange={(e) => update(row.id, 'targetSets', clampInt(e.target.value, 1, 20))} />
              <span style={{ display: 'flex', gap: 5, justifyContent: 'center', alignItems: 'center' }}>
                <input className="input" type="number" value={row.targetRepsMin} style={{ minHeight: 34, textAlign: 'center', padding: 4, width: 44 }}
                       onChange={(e) => update(row.id, 'targetRepsMin', clampInt(e.target.value, 1, 50))} />
                <span className="text-muted" style={{ fontSize: 13 }}>–</span>
                <input className="input" type="number" value={row.targetRepsMax} style={{ minHeight: 34, textAlign: 'center', padding: 4, width: 44 }}
                       onChange={(e) => update(row.id, 'targetRepsMax', clampInt(e.target.value, 1, 50))} />
              </span>
              <span style={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center' }}>
                <input className="input" type="number" step={15} value={row.targetRestSeconds} style={{ minHeight: 34, textAlign: 'center', padding: 4, width: 52 }}
                       onChange={(e) => update(row.id, 'targetRestSeconds', clampInt(e.target.value, 0, 600))} />
                <span className="text-muted" style={{ fontSize: 12 }}>s</span>
              </span>
              <button className="btn btn-icon btn-ghost" title="Quitar" style={{ width: 30, height: 30 }}
                      onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}>
                ×
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
