import { AreaChart } from '../components/AreaChart';
import { Heatmap } from '../components/Heatmap';
import { MetricTile } from '../components/MetricTile';
import { Sparkline } from '../components/Sparkline';
import { VolumeBar } from '../components/VolumeBar';
import { ACCENT_DOWN } from '../presenters/format';
import type { OverviewModel } from '../presenters/overview';
import { navigate } from '../router';

export function Overview({ model }: { model: OverviewModel }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: '0 0 3px', fontSize: 26 }}>Resumen</h3>
          <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>{model.weekLabel}</p>
        </div>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {model.kpis.map((kpi) => (
          <MetricTile
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            {...(kpi.unit === undefined ? {} : { unit: kpi.unit })}
            footer={
              <>
                <span style={{ color: kpi.deltaColor }}>{kpi.delta}</span>
                <span className="text-muted">{kpi.caption}</span>
              </>
            }
          />
        ))}
      </section>

      <section className="card" style={{
        padding: 'var(--space-8)', gap: 'var(--space-4)',
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-accent) 6%, var(--color-surface)), var(--color-surface))',
        boxShadow: '0 0 0 1px var(--color-accent-700), var(--shadow-md)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h4 style={{ margin: 0, fontSize: 20 }}>Ejercicios estancados</h4>
          <span className="tag tag-neutral">
            {model.stalled.length} ejercicios · sin progreso en 3+ semanas
          </span>
        </div>
        {model.stalled.length === 0 ? (
          <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
            Ningún ejercicio estancado. Todo progresando.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {model.stalled.slice(0, 3).map((item) => (
              <button
                key={item.exerciseId}
                onClick={() => navigate('exercise', item.exerciseId)}
                className="card elev-sm"
                style={{
                  padding: 'var(--space-6)', gap: 'var(--space-3)', background: 'var(--color-bg)',
                  border: 'none', cursor: 'pointer', color: 'var(--color-text)', textAlign: 'left',
                  font: 'inherit',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{item.name}</div>
                    <span className="tag tag-accent" style={{ marginTop: 4 }}>{item.muscleLabel}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, lineHeight: 1, color: ACCENT_DOWN }}>
                    {item.weeks}
                    <span style={{ fontSize: 13, color: 'color-mix(in srgb, var(--color-text) 55%, transparent)' }}> sem</span>
                  </div>
                </div>
                <Sparkline points={item.history} color={ACCENT_DOWN} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span className="text-muted">Serie de trabajo</span>
                  <span>{item.workingSet}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 14 }}>
        <div className="card elev-sm" style={{ padding: 'var(--space-8)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 'var(--space-6)' }}>
            <h5 style={{ margin: 0, fontSize: 13, letterSpacing: '0.04em' }}>Volumen semanal por grupo muscular</h5>
            <span className="text-muted" style={{ fontSize: 11 }}>series efectivas · objetivo 10–20</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {model.volume.map((row) => (
              <VolumeBar key={row.group} label={row.label} count={row.count} max={model.volumeMax} />
            ))}
          </div>
        </div>

        <div className="card elev-sm" style={{ padding: 'var(--space-8)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 'var(--space-4)' }}>
            <h5 style={{ margin: 0, fontSize: 13, letterSpacing: '0.04em' }}>Récords recientes</h5>
            <span className="text-muted" style={{ fontSize: 11 }}>últimos 10 días</span>
          </div>
          {model.records.length === 0 ? (
            <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>Sin récords en los últimos 10 días.</p>
          ) : model.records.map((record) => (
            <div key={record.name} style={{
              display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 2, alignItems: 'center',
              padding: '10px 0', borderBottom: '1px solid var(--color-divider)',
            }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 15 }}>{record.name}</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 15, color: 'var(--color-accent-300)', textAlign: 'right' }}>
                {record.estimated1RM} <span className="text-muted" style={{ fontSize: 11 }}>1RM est.</span>
              </span>
              <span className="text-muted" style={{ fontSize: 12 }}>{record.detail}</span>
              <span className="text-muted" style={{ fontSize: 11, textAlign: 'right' }}>{record.when}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="card elev-sm" style={{ padding: 'var(--space-8)' }}>
          <h5 style={{ margin: '0 0 var(--space-6)', fontSize: 13, letterSpacing: '0.04em' }}>Tendencia de tonelaje</h5>
          <AreaChart points={model.tonnageTrend} />
        </div>
        <div className="card elev-sm" style={{ padding: 'var(--space-8)' }}>
          <h5 style={{ margin: '0 0 var(--space-6)', fontSize: 13, letterSpacing: '0.04em' }}>Constancia</h5>
          <Heatmap weeks={model.heatmap} />
        </div>
      </section>
    </div>
  );
}
