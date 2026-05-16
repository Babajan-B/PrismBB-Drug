interface AdmetPrediction { property: string; value: number | string; probability?: number; unit?: string; }
interface AdmetResultsProps { data: AdmetPrediction[] | null; }

const PROP_META: Record<string, { icon: string; bg: string; border: string }> = {
  solubility:      { icon: '💧', bg: '#eff6ff', border: '#bfdbfe' },
  permeability:    { icon: '🔬', bg: '#ecfdf5', border: '#a7f3d0' },
  absorption:      { icon: '📈', bg: '#fffbeb', border: '#fde68a' },
  distribution:    { icon: '🌐', bg: '#eef2ff', border: '#c7d2fe' },
  metabolism:      { icon: '⚗️', bg: '#f0f9ff', border: '#bae6fd' },
  excretion:       { icon: '🔄', bg: '#ecfdf5', border: '#a7f3d0' },
  toxicity:        { icon: '⚠️', bg: '#fef2f2', border: '#fecaca' },
  bioavailability: { icon: '📊', bg: '#eff6ff', border: '#bfdbfe' },
  clearance:       { icon: '🔄', bg: '#ecfdf5', border: '#a7f3d0' },
  half_life:       { icon: '⏱',  bg: '#eef2ff', border: '#c7d2fe' },
};
function getMeta(p: string) {
  const k = Object.keys(PROP_META).find(k => p.toLowerCase().includes(k));
  return k ? PROP_META[k] : { icon: '🧪', bg: '#eef2ff', border: '#c7d2fe' };
}
function getBadge(prop: string, value: number | string) {
  if (typeof value !== 'number') return 'gray';
  const p = prop.toLowerCase();
  if (p.includes('toxic')) return value > 0.5 ? 'red' : 'green';
  if (p.includes('solubility') || p.includes('bioavailability') || p.includes('permeability'))
    return value > 0.7 ? 'green' : value > 0.3 ? 'yellow' : 'red';
  return 'indigo';
}
function getRisk(prop: string, value: number | string) {
  if (typeof value !== 'number') return '';
  const p = prop.toLowerCase();
  if (p.includes('toxic')) return value > 0.5 ? 'High Risk' : 'Safe';
  if (p.includes('solubility')) return value > 0.7 ? 'High' : value > 0.3 ? 'Medium' : 'Low';
  return '';
}

export default function AdmetResults({ data }: AdmetResultsProps) {
  if (!data || data.length === 0) return (
    <div className="card">
      <div className="card-header">
        <div className="card-title"><div className="card-title-icon">🧬</div>ADMET Predictions</div>
      </div>
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--txt-3)', fontSize: 14 }}>
        No ADMET data available for this molecule.
      </div>
    </div>
  );

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title"><div className="card-title-icon">🧬</div>ADMET Predictions</div>
        <span className="badge indigo">{data.length} properties</span>
      </div>

      {data.map((pred, i) => {
        const meta = getMeta(pred.property);
        const badge = getBadge(pred.property, pred.value);
        const risk = getRisk(pred.property, pred.value);
        const display = typeof pred.value === 'number' ? pred.value.toFixed(3) : String(pred.value);
        return (
          <div className="admet-item" key={i}>
            <div className="admet-item-left">
              <div className="admet-icon" style={{ background: meta.bg, borderColor: meta.border }}>
                {meta.icon}
              </div>
              <div>
                <div className="admet-name">{pred.property.replace(/_/g, ' ')}</div>
                {pred.probability !== undefined && (
                  <div className="admet-confidence">
                    <div className="confidence-bar-track">
                      <div className="confidence-bar-fill" style={{ width: `${pred.probability * 100}%` }} />
                    </div>
                    <span className="confidence-label">{(pred.probability * 100).toFixed(0)}% conf.</span>
                  </div>
                )}
              </div>
            </div>
            <div className="admet-item-right">
              <div className="admet-value">{display}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 3 }}>
                {pred.unit && <span className="admet-unit">{pred.unit}</span>}
                {risk && <span className={`badge ${badge}`} style={{ padding: '1px 7px', fontSize: 10 }}>{risk}</span>}
              </div>
            </div>
          </div>
        );
      })}

      <div className="admet-about">
        <p>
          <strong>ADMET</strong> — Absorption, Distribution, Metabolism, Excretion &amp; Toxicity.
          AI-predicted pharmacokinetic properties for evaluating drug candidates. Validate experimentally.
        </p>
      </div>
    </div>
  );
}
