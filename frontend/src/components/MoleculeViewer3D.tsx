import { useEffect, useRef, useState } from "react";
declare global { interface Window { $3Dmol: any } }

type Style = 'stick' | 'sphere' | 'line';
const STYLES: { key: Style; label: string }[] = [
  { key: 'stick',  label: 'Stick'  },
  { key: 'sphere', label: 'Sphere' },
  { key: 'line',   label: 'Line'   },
];

export default function MoleculeViewer3D({ pdb }: { pdb: string }) {
  const ref    = useRef<HTMLDivElement>(null);
  const viewer = useRef<any>(null);
  const [style, setStyle]     = useState<Style>('stick');
  const [atoms, setAtoms]     = useState(0);

  useEffect(() => {
    if (pdb) setAtoms(pdb.split('\n').filter(l => l.startsWith('HETATM') || l.startsWith('ATOM')).length);
  }, [pdb]);

  useEffect(() => {
    if (!ref.current || !window.$3Dmol || !pdb) return;
    const v = window.$3Dmol.createViewer(ref.current, { backgroundColor: '#020408', antialias: true });
    viewer.current = v;
    v.addModel(pdb, 'pdb');
    v.setStyle({}, { [style]: {} });
    v.zoomTo(); v.render();
    return () => v.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdb]);

  useEffect(() => {
    if (!viewer.current) return;
    viewer.current.setStyle({}, { [style]: {} });
    viewer.current.render();
  }, [style]);

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">
          <div className="card-title-icon dark">🧪</div>
          3D Structure
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {atoms > 0 && <span className="badge indigo">{atoms} atoms</span>}
          <div style={{ display: 'flex', gap: 4 }}>
            {STYLES.map(s => (
              <button key={s.key}
                className={`btn btn-sm ${style === s.key ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '4px 10px', fontSize: 11 }}
                onClick={() => setStyle(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="viewer-container" ref={ref} />
      <div className="viewer-controls">
        <span className="viewer-control-hint"><span className="viewer-key">Drag</span> Rotate</span>
        <span className="viewer-control-hint"><span className="viewer-key">Scroll</span> Zoom</span>
        <span className="viewer-control-hint"><span className="viewer-key">R-drag</span> Pan</span>
      </div>
    </div>
  );
}
