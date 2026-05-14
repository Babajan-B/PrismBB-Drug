/**
 * Molecular Docking workbench controller (v2 UI).
 * Reads receptor + ligand, converts to PDBQT via /api/docking/convert-pdbqt,
 * then runs /api/docking/run-docking and visualises poses with 3Dmol.js.
 */
(function () {
    'use strict';

    const state = {
        protein: null,   // {fileName, fileContent, fileType, fileSize}
        ligand:  null,
        proteinPdbqt: null,
        ligandPdbqt: null,
        dockingResult: null,
        viewer: null,
        backendMode: 'stub',
    };

    // -------- helpers -------------------------------------------------
    const $ = (id) => document.getElementById(id);
    const fmtBytes = (n) => {
        if (!n) return '0 B';
        const u = ['B','KB','MB']; let i = 0;
        while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
        return `${n.toFixed(1)} ${u[i]}`;
    };
    const setStep = (active) => {
        const order = ['upload','convert','grid','dock'];
        const cur = order.indexOf(active);
        document.querySelectorAll('#dockSteps .step').forEach(el => {
            const idx = order.indexOf(el.dataset.step);
            el.classList.remove('active','completed');
            if (idx === cur) el.classList.add('active');
            else if (idx < cur) el.classList.add('completed');
        });
        document.querySelectorAll('#dockSteps .step-connector').forEach((c, i) => {
            c.classList.toggle('completed', i < cur);
        });
    };
    const toast = (msg, type = 'info') => {
        if (window.molecularApp) window.molecularApp.showMessage(msg, type);
    };
    const readFileAsText = (file) => new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsText(file);
    });

    // -------- backend mode badge --------------------------------------
    async function fetchBackendMode() {
        try {
            const r = await fetch('/api/docking/health');
            const data = await r.json();
            state.backendMode = data.mode || 'stub';
            const el = $('dockBackendBadge');
            if (data.mode === 'vina-binary') {
                el.classList.add('live');
                el.textContent = 'Engine: real AutoDock Vina binary detected';
            } else {
                el.classList.add('stub');
                el.textContent = 'Engine: stub mode (install the `vina` binary for production runs)';
            }
        } catch (e) {
            $('dockBackendBadge').textContent = `Engine: unknown (${e.message})`;
        }
    }

    // -------- file handlers -------------------------------------------
    function bindFileSlot(kind) {
        const input = $(kind + 'Input');
        const drop  = $(kind + 'Drop');
        const info  = $(kind + 'Info');

        const handle = async (file) => {
            if (!file) return;
            const ext = file.name.split('.').pop().toLowerCase();
            const allowed = kind === 'protein' ? ['pdb','ent'] : ['pdb','sdf','mol'];
            if (!allowed.includes(ext)) {
                toast(`${kind} file must be one of: ${allowed.join(', ')}`, 'error');
                return;
            }
            const text = await readFileAsText(file);
            state[kind] = { fileName: file.name, fileType: ext, fileContent: text, fileSize: file.size };
            info.style.display = 'flex';
            info.querySelector('.file-name').textContent = file.name;
            info.querySelector('.file-size').textContent = fmtBytes(file.size);
            drop.style.display = 'none';
            updateConvertButton();
        };

        input.addEventListener('change', (e) => handle(e.target.files[0]));
        drop.addEventListener('click', () => input.click());
        drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
        drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('dragover');
            handle(e.dataTransfer.files[0]);
        });
    }
    function clearSlot(kind) {
        state[kind] = null;
        const input = $(kind + 'Input'); if (input) input.value = '';
        const info  = $(kind + 'Info');  if (info)  info.style.display = 'none';
        const drop  = $(kind + 'Drop');  if (drop)  drop.style.display = '';
        updateConvertButton();
    }
    function updateConvertButton() {
        const btn  = $('btnConvert');
        const hint = $('convertHint');
        const ready = state.protein && state.ligand;
        btn.disabled = !ready;
        hint.textContent = ready ? 'Ready — click to convert both files to PDBQT.' : 'Upload both files to enable conversion.';
    }

    // -------- conversion ----------------------------------------------
    async function convertOne(kind) {
        const f = state[kind];
        const body = {
            file_content: f.fileContent,
            file_type:    f.fileType === 'ent' ? 'pdb' : f.fileType,
            molecule_type: kind === 'protein' ? 'protein' : 'ligand',
            filename: f.fileName,
        };
        const r = await fetch('/api/docking/convert-pdbqt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err.detail || err.error || `HTTP ${r.status}`);
        }
        return r.json();
    }

    async function convertAll() {
        setStep('convert');
        $('btnConvert').disabled = true;
        $('convertHint').textContent = 'Converting…';
        try {
            const [pRes, lRes] = await Promise.all([convertOne('protein'), convertOne('ligand')]);
            state.proteinPdbqt = pRes.pdbqt_content;
            state.ligandPdbqt  = lRes.pdbqt_content;
            renderPdbqt('protein', pRes);
            renderPdbqt('ligand',  lRes);
            $('conversionCard').classList.remove('hidden');
            $('paramsCard').classList.remove('hidden');
            setStep('grid');
            toast('PDBQT conversion complete', 'success');
            $('paramsCard').scrollIntoView({behavior:'smooth', block:'start'});
        } catch (e) {
            toast(`Conversion failed: ${e.message}`, 'error');
            setStep('upload');
        } finally {
            $('btnConvert').disabled = false;
        }
    }
    function renderPdbqt(kind, res) {
        const pre = $(kind + 'Pdbqt');
        const stats = $(kind + 'Stats');
        pre.textContent = res.pdbqt_content;
        const atomCount = (res.pdbqt_content.match(/^(ATOM|HETATM)/gm) || []).length;
        const lines = res.pdbqt_content.split('\n').length;
        stats.innerHTML = `<span>Atoms <strong>${atomCount}</strong></span><span>Lines <strong>${lines}</strong></span><span>File <strong>${res.filename}</strong></span>`;
    }

    // -------- ligand auto-center --------------------------------------
    function autoGridFromLigand() {
        if (!state.ligand || state.ligand.fileType !== 'pdb') {
            toast('Auto-detect needs a ligand PDB to read coordinates', 'warning');
            return;
        }
        const xs=[], ys=[], zs=[];
        for (const line of state.ligand.fileContent.split('\n')) {
            if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
                const x = parseFloat(line.substring(30,38));
                const y = parseFloat(line.substring(38,46));
                const z = parseFloat(line.substring(46,54));
                if (Number.isFinite(x)) { xs.push(x); ys.push(y); zs.push(z); }
            }
        }
        if (!xs.length) { toast('No atom coordinates found in ligand', 'error'); return; }
        const avg = (a) => a.reduce((s,v)=>s+v,0)/a.length;
        const span = (a) => Math.max(20, Math.ceil((Math.max(...a) - Math.min(...a)) + 10));
        $('cx').value = avg(xs).toFixed(2);
        $('cy').value = avg(ys).toFixed(2);
        $('cz').value = avg(zs).toFixed(2);
        $('sx').value = Math.min(50, span(xs));
        $('sy').value = Math.min(50, span(ys));
        $('sz').value = Math.min(50, span(zs));
        toast('Grid auto-centered on ligand', 'success');
    }

    // -------- run docking ---------------------------------------------
    async function runDocking() {
        const grid = {
            center_x: parseFloat($('cx').value) || 0,
            center_y: parseFloat($('cy').value) || 0,
            center_z: parseFloat($('cz').value) || 0,
            size_x:   parseFloat($('sx').value) || 20,
            size_y:   parseFloat($('sy').value) || 20,
            size_z:   parseFloat($('sz').value) || 20,
        };
        const params = {
            forcefield: $('ff').value,
            num_modes:  parseInt($('nmodes').value, 10) || 9,
            exhaustiveness: parseInt($('exh').value, 10) || 8,
            energy_range: parseFloat($('erange').value) || 3.0,
        };

        setStep('dock');
        $('dockLoadingCard').classList.remove('hidden');
        $('resultsCard').classList.add('hidden');
        $('btnDock').disabled = true;

        try {
            const r = await fetch('/api/docking/run-docking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    protein_pdbqt: state.proteinPdbqt,
                    ligand_pdbqt:  state.ligandPdbqt,
                    grid_config: grid,
                    docking_params: params,
                }),
            });
            if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                throw new Error(err.detail || err.error || `HTTP ${r.status}`);
            }
            state.dockingResult = await r.json();
            renderResults(state.dockingResult);
            toast(state.dockingResult.message || 'Docking complete', 'success');
        } catch (e) {
            toast(`Docking failed: ${e.message}`, 'error');
        } finally {
            $('dockLoadingCard').classList.add('hidden');
            $('btnDock').disabled = false;
        }
    }

    function renderResults(data) {
        $('resultsCard').classList.remove('hidden');
        $('bestAffinity').textContent = data.best_affinity?.toFixed(3) ?? '—';
        $('avgAffinity').textContent  = data.average_affinity?.toFixed(3) ?? '—';
        $('totalModes').textContent   = data.total_modes ?? '—';
        $('engineMode').textContent   = state.backendMode;

        // poses table
        const tbody = document.querySelector('#posesTable tbody');
        tbody.innerHTML = data.poses.map((p, i) => `
            <tr data-mode="${p.mode}" class="${i === 0 ? 'active' : ''}">
                <td>${p.mode}</td>
                <td class="affinity-cell">${p.affinity.toFixed(3)}</td>
                <td>${p.rmsd_lb.toFixed(3)}</td>
                <td>${p.rmsd_ub.toFixed(3)}</td>
            </tr>
        `).join('');
        tbody.querySelectorAll('tr').forEach(row => {
            row.addEventListener('click', () => {
                tbody.querySelectorAll('tr').forEach(r => r.classList.remove('active'));
                row.classList.add('active');
                // (Re-rendering of a specific pose requires splitting the multi-model PDBQT;
                //  for now the viewer shows protein + best ligand pose.)
            });
        });

        $('vinaLog').textContent = data.vina_log || '(no log)';
        renderViewer(state.proteinPdbqt, data.docked_pdbqt);
        $('resultsCard').scrollIntoView({behavior:'smooth', block:'start'});
    }

    // -------- 3D viewer -----------------------------------------------
    function renderViewer(proteinPdbqt, ligandPdbqt) {
        const el = $('dockViewer3D');
        if (!el || typeof $3Dmol === 'undefined') return;
        if (state.viewer) {
            try { state.viewer.clear(); } catch (e) {}
        }
        const theme = document.documentElement.getAttribute('data-theme') || 'dark';
        const bg = theme === 'dark' ? '#0b0d12' : '#f5f6fb';

        const v = $3Dmol.createViewer(el, { defaultcolors: $3Dmol.rasmolElementColors });
        v.setBackgroundColor(bg);
        if (proteinPdbqt) {
            v.addModel(proteinPdbqt, 'pdbqt');
            v.setStyle({}, { cartoon: { color: 'spectrum' }, stick: { hidden: true } });
        }
        if (ligandPdbqt) {
            const lig = v.addModel(ligandPdbqt, 'pdbqt');
            v.setStyle({ model: lig }, { stick: { radius: 0.18 }, sphere: { scale: 0.22 } });
        }
        v.zoomTo();
        v.render();
        state.viewer = v;
    }

    // -------- wiring --------------------------------------------------
    document.addEventListener('DOMContentLoaded', () => {
        fetchBackendMode();
        bindFileSlot('protein');
        bindFileSlot('ligand');

        document.querySelectorAll('[data-clear]').forEach(btn => {
            btn.addEventListener('click', () => clearSlot(btn.dataset.clear));
        });
        document.querySelectorAll('[data-download]').forEach(btn => {
            btn.addEventListener('click', () => {
                const kind = btn.dataset.download;
                const content = kind === 'protein' ? state.proteinPdbqt : state.ligandPdbqt;
                if (!content) return;
                const blob = new Blob([content], { type: 'text/plain' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${kind}.pdbqt`;
                a.click();
                URL.revokeObjectURL(a.href);
            });
        });
        $('btnConvert').addEventListener('click', convertAll);
        $('btnAutoGrid').addEventListener('click', autoGridFromLigand);
        $('btnDock').addEventListener('click', runDocking);
        $('btnReset').addEventListener('click', () => {
            ['conversionCard','paramsCard','dockLoadingCard','resultsCard'].forEach(id => $(id).classList.add('hidden'));
            clearSlot('protein'); clearSlot('ligand');
            state.proteinPdbqt = state.ligandPdbqt = state.dockingResult = null;
            setStep('upload');
        });
    });
})();
