import { useState } from 'react';
import { MetricTile } from '../components/MetricTile';
import { SetTable } from '../components/SetTable';
import type { SessionsModel } from '../presenters/sessions';
import { navigate } from '../router';

export function Sessions({ model }: { model: SessionsModel }) {
  const [filter, setFilter] = useState('Todas');
  const visible = model.summaries.filter((s) => filter === 'Todas' || s.dayName === filter);
  const [selected, setSelected] = useState<number | undefined>(visible[0]?.id);
  const current = visible.some((s) => s.id === selected) ? selected : visible[0]?.id;
  const detail = current === undefined ? undefined : model.detailFor(current);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '344px 1fr', gap: 20, alignItems: 'start' }}>
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>Historial de sesiones</h3>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {model.filters.map((f) => (
            <button
              key={f.dayName}
              onClick={() => setFilter(f.dayName)}
              style={{
                padding: '6px 11px', fontSize: 12.5, fontFamily: 'var(--font-heading)',
                borderRadius: 'var(--radius-md)', cursor: 'pointer', background: 'transparent',
                color: filter === f.dayName ? 'var(--color-accent)' : 'var(--color-text)',
                border: `1px solid ${filter === f.dayName ? 'var(--color-accent)' : 'var(--color-divider)'}`,
              }}
            >
              {f.dayName} <span style={{ opacity: 0.6 }}>{f.count}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 'calc(100vh - 180px)', overflow: 'auto' }}>
          {visible.map((s) => (
            <div
              key={s.id}
              onClick={() => setSelected(s.id)}
              style={{
                padding: 'var(--space-4) var(--space-6)', borderRadius: 'var(--radius-md)',
                cursor: 'pointer', background: 'var(--color-surface)',
                boxShadow: s.id === current ? '0 0 0 1px var(--color-accent)' : 'var(--shadow-sm)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, lineHeight: 1.1 }}>{s.dayName}</div>
                  <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>{s.dateLabel} · {s.timeRange}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 11, fontSize: 12 }}>
                <span><span className="text-muted">Vol </span>{s.tonnage}</span>
                <span><span className="text-muted">Dur </span>{s.durationMinutes}m</span>
                <span><span className="text-muted">Series </span>{s.setCount}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <section style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {detail === undefined ? (
          <p className="text-muted">No hay sesiones para este filtro.</p>
        ) : (
          <>
            <div>
              <h2 style={{ margin: 0, fontSize: 30 }}>{detail.dayName}</h2>
              <p className="text-muted" style={{ margin: '5px 0 0', fontSize: 13 }}>
                {detail.dateLabel} · {detail.timeRange}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <MetricTile label="Duración" value={String(detail.durationMinutes)} unit="min" />
              <MetricTile label="Tonelaje" value={detail.tonnage} />
              <MetricTile label="Descanso medio" value={String(detail.avgRestSeconds)} unit="s" />
              <MetricTile label="Series efectivas" value={String(detail.setCount)} />
            </div>

            {detail.comparison !== undefined && (
              <div className="card" style={{
                padding: 'var(--space-6) var(--space-8)',
                background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-accent) 5%, var(--color-surface)), var(--color-surface))',
                boxShadow: '0 0 0 1px var(--color-accent-800), var(--shadow-sm)',
                flexDirection: 'row', alignItems: 'center', gap: 24, flexWrap: 'wrap',
              }}>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  frente a {detail.dayName} del {detail.comparison.prevLabel}
                </span>
                <span style={{ display: 'flex', gap: 7, fontSize: 14 }}>
                  <span className="text-muted" style={{ fontSize: 12 }}>Tonelaje</span>
                  <span style={{ fontFamily: 'var(--font-heading)', color: detail.comparison.tonnageColor }}>
                    {detail.comparison.tonnageDelta}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 7, fontSize: 14 }}>
                  <span className="text-muted" style={{ fontSize: 12 }}>Duración</span>
                  <span style={{ fontFamily: 'var(--font-heading)' }}>{detail.comparison.durationDelta}</span>
                </span>
                <span style={{ display: 'flex', gap: 7, fontSize: 14 }}>
                  <span className="text-muted" style={{ fontSize: 12 }}>Ejercicios que progresaron</span>
                  <span style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-accent-300)' }}>
                    {detail.comparison.liftsUp} / {detail.comparison.liftsTotal}
                  </span>
                </span>
              </div>
            )}

            {detail.notes !== undefined && (
              <p style={{ margin: 0, padding: '2px 4px', fontSize: 13, fontStyle: 'italic',
                          color: 'color-mix(in srgb, var(--color-text) 75%, transparent)' }}>
                {detail.notes}
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {detail.exercises.map((ex) => (
                <div key={ex.exerciseId} className="card elev-sm" style={{ padding: 'var(--space-6) var(--space-8)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 'var(--space-4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        onClick={() => navigate('exercise', ex.exerciseId)}
                        style={{ fontFamily: 'var(--font-heading)', fontSize: 16, background: 'none',
                                 border: 'none', color: 'var(--color-text)', cursor: 'pointer', padding: 0 }}
                      >
                        {ex.name}
                      </button>
                      <span className="tag tag-accent">{ex.muscleLabel}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                      <span className="text-muted">Mejor {ex.topSet}</span>
                      <span style={{ fontFamily: 'var(--font-heading)', color: ex.deltaColor }}>{ex.delta}</span>
                    </div>
                  </div>
                  <SetTable rows={ex.sets} />
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
