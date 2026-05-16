import { useForm } from "react-hook-form";
type FormValues = { smiles: string };
interface Props { onSubmit: (smiles: string) => void; }

export default function MoleculeInput({ onSubmit }: Props) {
  const { register, handleSubmit, formState: { errors, isSubmitting }, watch } = useForm<FormValues>({
    defaultValues: { smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  });
  const current = watch('smiles');

  return (
    <div className="card accent">
      <div className="card-header">
        <div className="card-title"><div className="card-title-icon">⚗️</div>SMILES Input</div>
        <span className="badge indigo">SMILES</span>
      </div>
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
              placeholder="e.g., CCO  ·  c1ccccc1  ·  CC(=O)Oc1ccccc1C(=O)O"
              autoComplete="off" spellCheck={false} disabled={isSubmitting}
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
        <h4>📚 SMILES Reference</h4>
        <p>
          Atoms: <code>C</code> · <code>O</code> · <code>N</code> ·
          Double bond: <code>=</code> · Triple: <code>#</code> ·
          Benzene: <code>c1ccccc1</code> · Branches: <code>()</code>
        </p>
      </div>
    </div>
  );
}
