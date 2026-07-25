import { AreaChart } from '../components/AreaChart';
import { MetricTile } from '../components/MetricTile';
import { SetTable } from '../components/SetTable';
import type { ExerciseModel } from '../presenters/exercise';

export function ExerciseDetail({ model }: { model: ExerciseModel }) {
  const maxTonnage = Math.max(1, ...model.sessionVolume.map((v) => v.tonnage));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 30 }}>{model.name}</h2>
        <span className="tag tag-accent">{model.muscleLabel}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <MetricTile label="1RM estimado" value={model.current1RM} />
        <MetricTile label="Mejor histórico" value={model.best1RM} />
        <MetricTile label="Series efectivas" value={String(model.totalSets)} />
        <MetricTile label="Descanso medio" value={String(model.avgRestSeconds)} unit="s" />
      </div>

      <div className="card elev-sm" style={{ padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
          <h5 style={{ margin: 0, fontSize: 13, letterSpacing: '0.04em' }}>Evolución del 1RM estimado</h5>
          <span className="text-muted" style={{ fontSize: 11 }}>
            {model.trend.filter((p) => p.isRecord).length} récords
          </span>
        </div>
        {model.trend.length < 2 ? (
          <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
            Sin estimación de 1RM: este ejercicio es de peso corporal y no registramos tu peso.
          </p>
        ) : (
          <AreaChart
            points={model.trend.map((p) => p.estimated1RM)}
            markers={model.trend.map((p) => p.isRecord)}
          />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="card elev-sm" style={{ padding: 'var(--space-8)' }}>
          <h5 style={{ margin: '0 0 var(--space-6)', fontSize: 13, letterSpacing: '0.04em' }}>Volumen por sesión</h5>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {model.sessionVolume.slice(0, 10).map((entry) => (
              <div key={entry.dateLabel} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 60px', gap: 10, alignItems: 'center' }}>
                <span className="text-muted" style={{ fontSize: 12 }}>{entry.dateLabel}</span>
                <div style={{ height: 9, background: 'var(--color-neutral-900)', borderRadius: 5 }}>
                  <div style={{
                    height: '100%', width: `${(entry.tonnage / maxTonnage) * 100}%`,
                    background: 'var(--color-accent-400)', borderRadius: 5,
                  }} />
                </div>
                <span style={{ fontSize: 12, textAlign: 'right' }}>{Math.round(entry.tonnage)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card elev-sm" style={{ padding: 'var(--space-8)', gap: 'var(--space-4)' }}>
          <h5 style={{ margin: 0, fontSize: 13, letterSpacing: '0.04em' }}>Mejor serie frente a la más reciente</h5>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span className="text-muted">Mejor histórica</span>
            <span style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-accent-300)' }}>{model.bestEver}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span className="text-muted">Más reciente</span>
            <span style={{ fontFamily: 'var(--font-heading)' }}>{model.mostRecent}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h5 style={{ margin: 0, fontSize: 13, letterSpacing: '0.04em' }}>Histórico de series</h5>
        {model.history.slice(0, 8).map((entry) => (
          <div key={entry.dateLabel} className="card elev-sm" style={{ padding: 'var(--space-6) var(--space-8)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-4)' }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 15 }}>{entry.dateLabel}</span>
              <span className="tag tag-neutral">{entry.dayName}</span>
            </div>
            <SetTable rows={entry.sets} />
          </div>
        ))}
      </div>
    </div>
  );
}
