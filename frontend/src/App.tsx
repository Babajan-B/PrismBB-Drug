import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useParse, useAnalyze } from "./hooks/useApi";
import MoleculeViewer3D from "./components/MoleculeViewer3D";
import AdmetResults from "./components/AdmetResults";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/* ── Navbar ─────────────────────────────────────────────────── */
function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <div className="nav-logo">
          <div className="nav-logo-icon">⚗️</div>
          <span className="nav-logo-name">PrismBB</span>
          <span className="nav-logo-sub">Drug Discovery</span>
        </div>

        <ul className="nav-links">
          <li><button className="nav-link active">Analyzer</button></li>
          <li><button className="nav-link">ADMET</button></li>
          <li><button className="nav-link">Docking</button></li>
          <li><button className="nav-link">Examples</button></li>
          <li><button className="nav-link">Docs</button></li>
        </ul>

        <div className="nav-right">
          <div className="nav-status">
            <span className="status-dot"></span>
            RDKit Online
          </div>
          <button className="btn btn-primary btn-sm">Launch Analysis →</button>
        </div>
      </div>
    </nav>
  );
}

/* ── Hero Section  (split layout: text left · dark preview right) ── */
function HeroSection({ onQuickAnalyze }: { onQuickAnalyze: (s: string) => void }) {
  return (
    <div className="hero">
      {/* Left: headline + CTAs + stats */}
      <div className="hero-left">
        <div className="hero-tag">
          <span className="hero-tag-dot"></span>
          AI-Powered · RDKit Engine · ADMET Predictions
        </div>

        <h1>
          ANALYZE SMILES
          <span className="accent-line">AND DISCOVER</span>
          DRUG LEADS
        </h1>

        <p className="hero-desc">
          Parse molecular structures, compute 17+ descriptors, predict ADMET
          pharmacokinetics, and visualize 3D conformers — all in one platform
          powered by RDKit and Claude AI.
        </p>

        <div className="hero-ctas">
          <button
            className="btn btn-primary btn-lg"
            onClick={() => onQuickAnalyze('CC(=O)Oc1ccccc1C(=O)O')}
          >
            Try Aspirin Example →
          </button>
          <button className="btn btn-outline btn-lg">
            View Docs
          </button>
        </div>

        {/* Stats boxes — matching 100x "Next Masterclass / Cohort / Duration" */}
        <div className="hero-stats">
          <div className="hero-stat">
            <div className="hero-stat-label">Descriptors</div>
            <div className="hero-stat-value">17+</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label">Engine</div>
            <div className="hero-stat-value">RDKit</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label">AI Model</div>
            <div className="hero-stat-value">Claude</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label">3D Viewer</div>
            <div className="hero-stat-value">3Dmol</div>
          </div>
        </div>
      </div>

      {/* Right: dark preview panel — like 100x's community/discord preview */}
      <div className="hero-right">
        <div className="hero-preview-label">Platform Preview</div>
        <div className="hero-preview-title">
          Molecular Intelligence<br/>at Your Fingertips
        </div>
        <div className="hero-preview-desc">
          Enter any SMILES string and get instant drug-likeness analysis,
          3D conformer generation, and AI-powered ADMET predictions.
        </div>
        <div className="hero-preview-steps">
          {[
            { num: '1', label: 'Input SMILES notation',        active: true  },
            { num: '2', label: 'RDKit parses & computes',      active: false },
            { num: '3', label: 'AI predicts ADMET properties', active: false },
            { num: '4', label: 'Explore 3D structure',         active: false },
          ].map(s => (
            <div key={s.num} className={`hero-preview-step ${s.active ? 'active' : ''}`}>
              <div className="hero-preview-step-num">{s.num}</div>
              {s.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Powered-by logos row (like 100x has Lenovo, Meta, Mahindra) ── */
function LogosRow() {
  return (
    <div className="logos-row">
      <span className="logos-label">Powered by</span>
      {[
        { icon: '⚗️', name: 'RDKit'    },
        { icon: '🤖', name: 'Claude AI' },
        { icon: '🧬', name: '3Dmol.js' },
        { icon: '⚡', name: 'FastAPI'  },
        { icon: '🐍', name: 'Python'   },
      ].map(t => (
        <div key={t.name} className="logo-pill">
          <span>{t.icon}</span>{t.name}
        </div>
      ))}
    </div>
  );
}

/* ── Stepper ────────────────────────────────────────────────── */
function Stepper({ step }: { step: 'input' | 'loading' | 'results' }) {
  const steps = [
    { id: 'input',   label: 'Input SMILES', num: '1' },
    { id: 'loading', label: 'Processing',   num: '2' },
    { id: 'results', label: 'Results',      num: '3' },
  ];
  const idx = steps.findIndex(s => s.id === step);
  return (
    <div className="stepper-wrap">
      <div className="stepper">
        {steps.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
            <div className={`stepper-step ${step === s.id ? 'active' : i < idx ? 'completed' : ''}`}>
              <div className="stepper-circle">{i < idx ? '✓' : s.num}</div>
              <span className="stepper-label">{s.label}</span>
            </div>
            {i < steps.length - 1 && <div className={`stepper-line ${i < idx ? 'completed' : ''}`} />}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Example molecules ───────────────────────────────────────── */
const EXAMPLES = [
  { name: 'Aspirin',   smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O',               desc: 'Pain reliever',     cat: 'Analgesic'  },
  { name: 'Caffeine',  smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C',            desc: 'CNS stimulant',    cat: 'Stimulant'  },
  { name: 'Ibuprofen', smiles: 'CC(C)CC1=CC=C(C=C1)C(C)C(=O)O',           desc: 'Anti-inflammatory',cat: 'NSAID'      },
  { name: 'Glucose',   smiles: 'C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O)O)O)O)O', desc: 'Simple sugar', cat: 'Metabolite' },
  { name: 'Benzene',   smiles: 'c1ccccc1',                                  desc: 'Aromatic ring',    cat: 'Scaffold'   },
  { name: 'Ethanol',   smiles: 'CCO',                                        desc: 'Simple alcohol',   cat: 'Solvent'    },
];

/* ── Input Form ─────────────────────────────────────────────── */
function MoleculeForm({ onSubmit }: { onSubmit: (s: string) => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting }, watch, setValue } = useForm({
    defaultValues: { smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  });
  const current = watch('smiles');

  return (
    <div className="container">
      <div className="card accent">
        <div className="card-header">
          <div className="card-title">
            <div className="card-title-icon">⚗️</div>
            SMILES Input
          </div>
          <div className="quick-chips">
            {['Aspirin', 'Caffeine', 'Ibuprofen'].map(name => {
              const ex = EXAMPLES.find(e => e.name === name)!;
              return (
                <button key={name} className="chip" type="button"
                  onClick={() => { setValue('smiles', ex.smiles); onSubmit(ex.smiles); }}>
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        <p style={{ fontSize: 14, color: 'var(--txt-2)', marginBottom: 22, lineHeight: 1.7 }}>
          Enter a SMILES string to compute molecular descriptors, Lipinski drug-likeness,
          3D conformers, and AI-powered ADMET predictions instantly.
        </p>

        <form onSubmit={handleSubmit(d => onSubmit(d.smiles))}>
          <div className="form-section">
            <label className="form-label">SMILES Notation</label>
            <div className="input-wrapper">
              <input
                {...register('smiles', {
                  required: 'SMILES string is required',
                  pattern: { value: /^[A-Za-z0-9\[\]()=#+\-\\/@\\.%]+$/, message: 'Invalid SMILES characters' },
                })}
                className={`form-input ${errors.smiles ? 'error' : ''}`}
                placeholder="e.g.,  CCO   ·   c1ccccc1   ·   CC(=O)Oc1ccccc1C(=O)O"
                autoComplete="off" spellCheck={false}
              />
              {current && <span className="input-counter">{current.length}</span>}
            </div>
            {errors.smiles && <p className="form-error">⚠ {errors.smiles.message}</p>}
          </div>

          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }}
            disabled={isSubmitting || !!errors.smiles}>
            {isSubmitting ? <><div className="spinner"></div> Analyzing…</> : <>🔬 Analyze Molecule →</>}
          </button>
        </form>

        <div className="smiles-info-box">
          <h4>📚 SMILES Quick Reference</h4>
          <p>
            Atoms: <code>C</code> carbon · <code>O</code> oxygen · <code>N</code> nitrogen ·
            Bonds: <code>=</code> double · <code>#</code> triple ·
            Rings: <code>c1ccccc1</code> benzene · Branches: <code>()</code> · Chirality: <code>@@</code>
          </p>
        </div>
      </div>

      {/* Examples */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <div className="card-title-icon yellow">🧪</div>
            Example Molecules
          </div>
          <span className="badge gray">{EXAMPLES.length} compounds</span>
        </div>
        <div className="examples-grid">
          {EXAMPLES.map(ex => (
            <div key={ex.name} className="example-card"
              onClick={() => { setValue('smiles', ex.smiles); onSubmit(ex.smiles); }}>
              <div className="example-category">{ex.cat}</div>
              <div className="example-name">{ex.name}</div>
              <div className="example-description">{ex.desc}</div>
              <div className="example-smiles">{ex.smiles}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Loading ────────────────────────────────────────────────── */
function LoadingState() {
  return (
    <div className="container">
      <div className="card loading-card">
        <div className="spinner dark lg" style={{ margin: '0 auto' }}></div>
        <h3>Analyzing Molecule</h3>
        <p>RDKit + AI agents are parsing your SMILES and computing properties</p>
        <div className="loading-steps">
          {[
            { label: 'Validating SMILES notation',  state: 'done'   },
            { label: 'Computing RDKit descriptors', state: 'active' },
            { label: 'Generating 3D conformer',     state: ''       },
            { label: 'Running ADMET predictions',   state: ''       },
          ].map((s, i) => (
            <div className="loading-step-row" key={i}>
              <div className={`loading-step-dot ${s.state}`}></div>
              {s.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Results helpers ────────────────────────────────────────── */
const KEY_NAMES: Record<string, string> = {
  heavy_atom_count: 'Heavy Atoms',   atom_count: 'Total Atoms',     bond_count: 'Bonds',
  ring_count: 'Rings',               aromatic_ring_count: 'Aromatic Rings', logp: 'LogP',
  hbd: 'H-Bond Donors',             hba: 'H-Bond Acceptors',       rotatable_bonds: 'Rotatable Bonds',
  tpsa: 'TPSA (Ų)',                 formal_charge: 'Formal Charge', molar_refractivity: 'Molar Refractivity',
  fraction_sp3: 'Fraction Csp3',    bertz_ct: 'Bertz CT',          balaban_j: 'Balaban J',
  slogp: 'SLogP',                   lipinski_violations: 'Lipinski Violations',
};
const fmtKey = (k: string) => KEY_NAMES[k] ?? k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
function descColor(k: string, v: number) {
  if (k === 'lipinski_violations') return v === 0 ? 'good' : v <= 1 ? 'warning' : 'bad';
  if (k === 'logp') return v <= 5   ? 'good' : 'bad';
  if (k === 'hbd')  return v <= 5   ? 'good' : 'bad';
  if (k === 'hba')  return v <= 10  ? 'good' : 'bad';
  if (k === 'tpsa') return v <= 140 ? 'good' : 'warning';
  return '';
}

/* ── Results ────────────────────────────────────────────────── */
function Results({ results, onReset }: { results: any; onReset: () => void }) {
  const mol = results.molecule;
  const violations = mol.descriptors?.lipinski_violations ?? 0;
  const pass = violations === 0;

  return (
    <div className="container">
      <button className="new-analysis-btn" onClick={onReset}>＋ Start New Analysis</button>

      {/* Stats row — 100xEngineers style bordered boxes */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Formula</div>
          <div className="stat-value accent">{mol.formula}</div>
          <div className="stat-sub">Molecular formula</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Mol. Weight</div>
          <div className="stat-value">{Number(mol.weight).toFixed(1)}</div>
          <div className="stat-sub">g / mol</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">LogP</div>
          <div className={`stat-value ${Number(mol.descriptors?.logp) <= 5 ? 'green' : 'yellow'}`}>
            {Number(mol.descriptors?.logp ?? 0).toFixed(2)}
          </div>
          <div className="stat-sub">Lipophilicity</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Rule of Five</div>
          <div className={`stat-value ${pass ? 'green' : 'red'}`}>
            {pass ? 'PASS' : `${violations} fail`}
          </div>
          <div className="stat-sub">Lipinski check</div>
        </div>
      </div>

      {/* Properties */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <div className="card-title-icon">🧬</div>
            Molecular Properties
          </div>
          <span className={`badge ${pass ? 'green' : 'red'}`}>
            {pass ? '✓ Drug-like' : '✗ Lipinski Fail'}
          </span>
        </div>
        <div className="grid grid-2">
          <div>
            <p className="section-label">Identity</p>
            <div className="prop-row"><span className="prop-key">SMILES</span><span className="prop-val"><code>{mol.smiles}</code></span></div>
            <div className="prop-row"><span className="prop-key">Formula</span><span className="prop-val" style={{ color: 'var(--accent)', fontWeight: 800 }}>{mol.formula}</span></div>
            <div className="prop-row"><span className="prop-key">Molecular Weight</span><span className="prop-val">{Number(mol.weight).toFixed(3)} g/mol</span></div>
            {mol.inchikey && <div className="prop-row"><span className="prop-key">InChI Key</span><span className="prop-val"><code style={{ fontSize: 11 }}>{mol.inchikey.substring(0,14)}…</code></span></div>}
          </div>
          <div>
            <p className="section-label">Lipinski Rule of Five</p>
            {(['lipinski_violations','logp','hbd','hba','tpsa'] as const).map(k => (
              <div className="prop-row" key={k}>
                <span className="prop-key">{fmtKey(k)}</span>
                <span className={`prop-val descriptor-value ${descColor(k, mol.descriptors?.[k] ?? 0)}`}>
                  {Number(mol.descriptors?.[k] ?? 0).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Descriptors */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <div className="card-title-icon dark">📊</div>
            Complete Descriptor Profile
          </div>
          <span className="badge indigo">{Object.keys(mol.descriptors ?? {}).length} descriptors</span>
        </div>
        <div className="descriptor-grid">
          {Object.entries(mol.descriptors ?? {}).map(([k, v]) => (
            <div key={k} className="descriptor-card">
              <div className="descriptor-label">{fmtKey(k)}</div>
              <div className={`descriptor-value ${descColor(k, Number(v))}`}>{Number(v).toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 3D + ADMET */}
      <div className="grid grid-2">
        {results.pdb && <MoleculeViewer3D pdb={results.pdb} />}
        <AdmetResults data={results.admet} />
      </div>
    </div>
  );
}

/* ── Main ───────────────────────────────────────────────────── */
function MolecularAnalysis() {
  const [step, setStep]     = useState<'input' | 'loading' | 'results'>('input');
  const [results, setResults] = useState<any>(null);
  const [error, setError]   = useState('');
  const [showHero, setShowHero] = useState(true);

  const parse   = useParse();
  const analyze = useAnalyze();

  const handleAnalyze = async (smiles: string) => {
    try {
      setError('');
      setShowHero(false);
      setStep('loading');
      const molecule = await parse.mutateAsync({ smiles });
      const analysis = await analyze.mutateAsync({ smiles });
      setResults({ molecule, pdb: analysis.pdb_block, admet: analysis.admet });
      setStep('results');
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Failed to analyze. Please check your SMILES string.');
      setStep('input');
      setShowHero(false);
    }
  };

  const handleReset = () => { setStep('input'); setResults(null); setError(''); setShowHero(true); };

  return (
    <div className="page">
      <Navbar />

      {/* Hero — only on initial input screen */}
      {showHero && step === 'input' && <HeroSection onQuickAnalyze={handleAnalyze} />}

      {/* Powered-by logos strip — only on landing */}
      {showHero && step === 'input' && <LogosRow />}

      {/* Divider above analyzer section */}
      {(!showHero || step !== 'input') && (
        <div style={{ padding: '28px 28px 0', maxWidth: 'var(--max-w)', margin: '0 auto' }}>
          <div className="divider" style={{ margin: '0 0 24px' }} />
        </div>
      )}

      {/* Stepper */}
      <Stepper step={step} />

      {/* Error */}
      {error && (
        <div className="container">
          <div className="alert error">
            <span className="alert-icon">⚠</span>
            <div className="alert-content">
              <strong>Analysis Failed</strong>{error}
            </div>
          </div>
        </div>
      )}

      {/* Step content */}
      {step === 'input'   && <MoleculeForm onSubmit={handleAnalyze} />}
      {step === 'loading' && <LoadingState />}
      {step === 'results' && results && <Results results={results} onReset={handleReset} />}

      {/* Footer */}
      <footer className="footer">
        <strong>PrismBB Drug Discovery Platform</strong> · Powered by RDKit + Claude AI · {new Date().getFullYear()}
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MolecularAnalysis />
    </QueryClientProvider>
  );
}
