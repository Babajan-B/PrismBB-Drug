/**
 * Molecular Docking workbench controller (v4).
 *
 * Modes:
 *   Single — one protein + one ligand → PDBQT conversion → Vina → poses
 *   Virtual Screening — one protein + N ligands → sequential docking → ranked table
 *
 * New in v4:
 *   • 3D preview after conversion (protein + ligand + orange grid box)
 *   • Live grid-box update as the user adjusts center/size inputs
 *   • Blind docking toggle → auto-computes full-protein bounding box
 *   • Stub-mode warning banner in the params card
 *   • .mol file type correctly mapped to "sdf" for the backend
 */
(function () {
    'use strict';

    const state = {
        protein: null,          // {fileName, fileContent, fileType, fileSize}
        ligand:  null,
        proteinPdbqt:  null,
        ligandPdbqt:   null,
        ligandPreviewContent: null,
        ligandPreviewFormat: null,
        sourceLigandPreviewContent: null,
        dockingResult: null,
        selectedPoseMode: 1,
        selectedComplexPdbqt: null,
        selectedInteractions: [],
        interactionTypes: new Set(['hbond', 'hydrophobic', 'ionic']),

        previewViewer:  null,   // viewer in params card (protein + ligand + box)
        sourceLigandPreviewViewer: null,
        ligandPreviewViewer: null,
        gridBoxShape:   null,   // current box shape object (for removeShape)
        viewer:         null,   // single-docking results viewer
        vsViewer:       null,   // VS results viewer

        backendMode: 'stub',
        mode: 'single',         // 'single' | 'vs'
        virtualLigands: [],
        vsResults: [],
        vsAborted: false,
        directPdbqtPreviewKey: null,
    };

    // ─── helpers ──────────────────────────────────────────────────────────────
    const $ = (id) => document.getElementById(id);
    const fmtBytes = (n) => {
        if (!n) return '0 B';
        const u = ['B','KB','MB']; let i = 0;
        while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
        return `${n.toFixed(1)} ${u[i]}`;
    };
    const show = (id) => { const el = $(id); if (el) el.classList.remove('hidden'); };
    const hide = (id) => { const el = $(id); if (el) el.classList.add('hidden'); };
    const toast = (msg, type = 'info') => {
        if (window.molecularApp) window.molecularApp.showMessage(msg, type);
    };
    const readFileAsText = (file) => new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload  = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsText(file);
    });

    // Normalize file extension to a type the backend accepts
    const normFileType = (ext) => (ext === 'mol' || ext === 'ent') ? (ext === 'ent' ? 'pdb' : 'sdf') : ext;

    // ─── step indicator ───────────────────────────────────────────────────────
    function setStep(active) {
        const order = ['upload','convert','grid','dock'];
        const cur = order.indexOf(active);
        document.querySelectorAll('#dockSteps .step').forEach(el => {
            const idx = order.indexOf(el.dataset.step);
            el.classList.remove('active','completed');
            if (idx === cur)      el.classList.add('active');
            else if (idx < cur)   el.classList.add('completed');
        });
        document.querySelectorAll('#dockSteps .step-connector').forEach((c, i) => {
            c.classList.toggle('completed', i < cur);
        });
    }

    // ─── backend health / mode badge ──────────────────────────────────────────
    async function fetchBackendMode() {
        try {
            const r    = await fetch('/api/docking/health');
            const data = await r.json();
            state.backendMode = data.mode || 'stub';
            const el = $('dockBackendBadge');
            if (data.mode === 'vina-binary') {
                el.classList.add('live');
                el.textContent = '✓ Engine: real AutoDock Vina binary detected';
                hide('stubWarning');
            } else {
                el.classList.add('stub');
                el.textContent = '⚠ Engine: stub mode — install the `vina` binary for real docking';
                // stub warning in params card shown after conversion
            }
        } catch (e) {
            $('dockBackendBadge').textContent = `Engine: unknown (${e.message})`;
        }
    }

    // ─── mode toggle ──────────────────────────────────────────────────────────
    function setMode(m) {
        state.mode = m;
        const isSingle = m === 'single';

        $('modeSingleBtn').classList.toggle('active', isSingle);
        $('modeVSBtn').classList.toggle('active', !isSingle);
        $('modeSingleBtn').setAttribute('aria-selected', isSingle);
        $('modeVSBtn').setAttribute('aria-selected', !isSingle);

        $('singleLigandPanel').classList.toggle('hidden', !isSingle);
        $('vsLigandPanel').classList.toggle('hidden', isSingle);

        $('btnConvert').classList.toggle('hidden', !isSingle);
        $('btnConvertVS').classList.toggle('hidden', isSingle);

        $('btnDock').classList.toggle('hidden', !isSingle);
        $('btnRunVS').classList.toggle('hidden', isSingle);

        const slc = $('singleLigandConversion');
        if (slc) slc.classList.toggle('hidden', !isSingle);

        $('uploadDesc').textContent = isSingle
            ? 'Drop a protein PDB/PDBQT and a ligand PDB/SDF/MOL/PDBQT below.'
            : 'Drop a protein PDB/PDBQT and upload your ligand library (multi-molecule SDF or multiple .pdb / .mol / .pdbqt files).';

        updateConvertButton();
    }

    // ─── file slots ───────────────────────────────────────────────────────────
    function bindFileSlot(kind) {
        const input = $(kind + 'Input');
        const drop  = $(kind + 'Drop');
        const info  = $(kind + 'Info');

        const handle = async (file) => {
            if (!file) return;
            const ext     = file.name.split('.').pop().toLowerCase();
            const allowed = kind === 'protein' ? ['pdb','ent','pdbqt'] : ['pdb','sdf','mol','pdbqt'];
            if (!allowed.includes(ext)) {
                toast(`${kind} file must be: ${allowed.join(', ')}`, 'error');
                return;
            }
            const text = await readFileAsText(file);
            state[kind] = { fileName: file.name, fileType: ext, fileContent: text, fileSize: file.size };
            info.style.display = 'flex';
            info.querySelector('.file-name').textContent = file.name;
            info.querySelector('.file-size').textContent = fmtBytes(file.size);
            drop.style.display = 'none';
            updateConvertButton();
            maybeShowDirectPdbqtPreview();
        };

        input.addEventListener('change', (e) => handle(e.target.files[0]));
        drop.addEventListener('click', () => input.click());
        drop.addEventListener('dragover',  (e) => { e.preventDefault(); drop.classList.add('dragover'); });
        drop.addEventListener('dragleave', ()  => drop.classList.remove('dragover'));
        drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('dragover');
            handle(e.dataTransfer.files[0]);
        });
    }

    function clearSlot(kind) {
        state[kind] = null;
        state.directPdbqtPreviewKey = null;
        const input = $(kind + 'Input'); if (input) input.value = '';
        const info  = $(kind + 'Info');  if (info)  info.style.display = 'none';
        const drop  = $(kind + 'Drop');  if (drop)  drop.style.display = '';
        updateConvertButton();
    }

    function updateConvertButton() {
        if (state.mode === 'single') {
            const ready = !!(state.protein && state.ligand);
            $('btnConvert').disabled = !ready;
            $('convertHint').textContent = ready
                ? 'Ready — click to convert both files to PDBQT.'
                : 'Upload both protein and ligand to enable conversion.';
        } else {
            const ready = !!(state.protein && state.virtualLigands.length > 0);
            $('btnConvertVS').disabled = !ready;
            $('convertHint').textContent = ready
                ? `Ready — ${state.virtualLigands.length} ligand(s) in library. Click to convert receptor.`
                : 'Upload protein and at least one ligand to proceed.';
            const txt = $('btnRunVSText');
            if (txt) txt.textContent = `Run virtual screening (${state.virtualLigands.length} ligands)`;
        }
    }

    function maybeShowDirectPdbqtPreview() {
        if (state.mode !== 'single') return;
        if (!state.protein || !state.ligand) return;
        if (state.protein.fileType !== 'pdbqt' || state.ligand.fileType !== 'pdbqt') return;

        const key = `${state.protein.fileName}:${state.protein.fileSize}|${state.ligand.fileName}:${state.ligand.fileSize}`;
        if (state.directPdbqtPreviewKey === key) return;
        state.directPdbqtPreviewKey = key;

        state.proteinPdbqt = state.protein.fileContent;
        state.ligandPdbqt  = state.ligand.fileContent;
        renderPdbqt('protein', {
            pdbqt_content: state.proteinPdbqt,
            filename: state.protein.fileName,
        });
        renderPdbqt('ligand', {
            pdbqt_content: state.ligandPdbqt,
            filename: state.ligand.fileName,
        });
        show('conversionCard');
        show('paramsCard');
        setStep('grid');
        if (state.backendMode !== 'vina-binary') show('stubWarning');
        autoGridFromPdbqt(state.ligandPdbqt, { silent: true });
        renderPreviewViewer();
        toast('PDBQT files loaded — preview and grid box are ready', 'success');
        $('paramsCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ─── VS ligand library ────────────────────────────────────────────────────
    function parseSDF(content, baseName) {
        const blocks = content.split(/\$\$\$\$/).map(b => b.trim()).filter(b => b.length > 0);
        return blocks.map((block, idx) => {
            const lines = block.split('\n');
            const name  = (lines[0] || '').trim() || `${baseName}_mol${idx + 1}`;
            return { name, fileType: 'sdf', fileContent: block + '\n$$$$', fileSize: block.length };
        });
    }

    async function handleVSFiles(files) {
        const added = [];
        for (const file of files) {
            const ext = file.name.split('.').pop().toLowerCase();
            if (!['sdf','pdb','mol','pdbqt'].includes(ext)) {
                toast(`Skipping ${file.name} — use .sdf, .pdb, .mol, or .pdbqt`, 'warning');
                continue;
            }
            const content = await readFileAsText(file);
            if (ext === 'sdf') {
                const mols = parseSDF(content, file.name.replace(/\.[^.]+$/, ''));
                added.push(...mols);
                toast(`Loaded ${mols.length} molecule(s) from ${file.name}`, 'success');
            } else {
                added.push({
                    name: file.name.replace(/\.[^.]+$/, ''),
                    fileType: ext,
                    fileContent: content,
                    fileSize: file.size,
                });
            }
        }
        if (added.length) {
            state.virtualLigands.push(...added);
            renderVSLibrary();
            updateConvertButton();
        }
    }

    function renderVSLibrary() {
        const tbody   = $('vsLibraryTbody');
        const wrap    = $('vsLibraryWrap');
        const countEl = $('vsLigandCount');
        if (!state.virtualLigands.length) { wrap.classList.add('hidden'); return; }
        wrap.classList.remove('hidden');
        countEl.textContent = `${state.virtualLigands.length} ligand(s) loaded`;
        tbody.innerHTML = state.virtualLigands.map((lig, i) => `
            <tr>
                <td>${i + 1}</td>
                <td><strong>${lig.name}</strong></td>
                <td><code>${lig.fileType}</code></td>
                <td>${fmtBytes(lig.fileSize)}</td>
                <td><button class="btn btn-small btn-ghost" data-remove-lig="${i}"
                    style="padding:2px 8px;font-size:0.72rem">✕</button></td>
            </tr>`).join('');
        tbody.querySelectorAll('[data-remove-lig]').forEach(btn => {
            btn.addEventListener('click', () => {
                state.virtualLigands.splice(parseInt(btn.dataset.removeLig, 10), 1);
                renderVSLibrary();
                updateConvertButton();
            });
        });
    }

    // ─── PDBQT conversion ─────────────────────────────────────────────────────
    async function convertOne(kind) {
        const f = state[kind];
        if (f.fileType === 'pdbqt') {
            return {
                pdbqt_content: f.fileContent,
                filename: f.fileName,
                status: 'success',
                message: `Using uploaded ${kind} PDBQT directly`,
            };
        }
        const r = await fetch('/api/docking/convert-pdbqt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_content:  f.fileContent,
                file_type:     normFileType(f.fileType),
                molecule_type: kind === 'protein' ? 'protein' : 'ligand',
                filename:      f.fileName,
            }),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err.detail || err.error || `HTTP ${r.status}`);
        }
        return r.json();
    }

    async function convertVSLigand(lig) {
        if (lig.fileType === 'pdbqt') {
            return {
                pdbqt_content: lig.fileContent,
                filename: `${lig.name}.pdbqt`,
                status: 'success',
                message: 'Using uploaded ligand PDBQT directly',
            };
        }
        const r = await fetch('/api/docking/convert-pdbqt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_content:  lig.fileContent,
                file_type:     normFileType(lig.fileType),   // mol → sdf fix
                molecule_type: 'ligand',
                filename:      lig.name + '.' + lig.fileType,
            }),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err.detail || err.error || `HTTP ${r.status}`);
        }
        return r.json();
    }

    function renderPdbqt(kind, res) {
        const pre   = $(kind + 'Pdbqt');
        const stats = $(kind + 'Stats');
        if (pre)   pre.textContent = res.pdbqt_content;
        if (stats) {
            const atoms = (res.pdbqt_content.match(/^(ATOM|HETATM)/gm) || []).length;
            const lines = res.pdbqt_content.split('\n').length;
            stats.innerHTML = `<span>Atoms <strong>${atoms}</strong></span><span>Lines <strong>${lines}</strong></span><span>File <strong>${res.filename}</strong></span>`;
        }
        if (kind === 'ligand') {
            state.ligandPreviewContent = res.preview_sdf_content || res.preview_pdb_content || res.pdbqt_content;
            state.ligandPreviewFormat = res.preview_sdf_content ? 'sdf' : (res.preview_pdb_content ? 'pdb' : 'pdbqt');
            state.sourceLigandPreviewContent = res.source_sdf_content || res.source_pdb_content || state.ligand?.fileContent || '';
            renderLigandConversionPreview(res);
        }
    }

    function renderLigandConversionPreview(res) {
        const ligandPdbqt = res.pdbqt_content;
        renderSourceLigandPreview();
        const el = $('ligandPreview3D');
        if (!el || !state.ligandPreviewContent || typeof $3Dmol === 'undefined') return;
        if (state.ligandPreviewViewer) {
            try { state.ligandPreviewViewer.clear(); } catch (e) {}
        }
        const v = $3Dmol.createViewer(el, { defaultcolors: $3Dmol.rasmolElementColors });
        v.setBackgroundColor(makeBg());
        const prepared = viewerModelFromStructure(state.ligandPreviewContent, state.ligandPreviewFormat);
        const lig = v.addModel(prepared.content, prepared.format);
        v.setStyle({ model: lig }, {
            stick:  { radius: 0.42, colorscheme: 'orangeCarbon' },
            sphere: { scale: 0.34, colorscheme: 'orangeCarbon' },
        });
        v.zoomTo();
        v.render();
        state.ligandPreviewViewer = v;

        const bb = computeProteinBBox(ligandPdbqt);
        const info = $('ligandPreviewInfo');
        if (info && bb) {
            const spanX = (bb.maxX - bb.minX).toFixed(2);
            const spanY = (bb.maxY - bb.minY).toFixed(2);
            const spanZ = (bb.maxZ - bb.minZ).toFixed(2);
            const sourceStats = getSourceLigandStats();
            const preparedSmiles = ligandPdbqt.match(/^REMARK SMILES\s+(.+)$/m)?.[1] || '';
            const smilesText = preparedSmiles ? ` · SMILES ${preparedSmiles}` : '';
            const notes = res.conversion_notes?.length ? ` · ${res.conversion_notes.join(' ')}` : '';
            info.textContent = `${sourceStats} · Docking PDBQT atoms ${countAtoms(ligandPdbqt)} · Prepared 3D span ${spanX} × ${spanY} × ${spanZ} Å${smilesText}${notes}`;
        }
    }

    function renderSourceLigandPreview() {
        const el = $('sourceLigandPreview3D');
        if (!el || !state.sourceLigandPreviewContent || typeof $3Dmol === 'undefined') return;
        if (state.sourceLigandPreviewViewer) {
            try { state.sourceLigandPreviewViewer.clear(); } catch (e) {}
        }
        const v = $3Dmol.createViewer(el, { defaultcolors: $3Dmol.rasmolElementColors });
        v.setBackgroundColor(makeBg());
        const fmt = resHasSdfBlock(state.sourceLigandPreviewContent)
            ? 'sdf'
            : /(^|\n)(ATOM|HETATM)\s+/m.test(state.sourceLigandPreviewContent)
            ? 'pdb'
            : (({ sdf: 'sdf', mol: 'sdf', pdb: 'pdb', pdbqt: 'pdbqt' })[state.ligand.fileType] || 'sdf');
        const lig = v.addModel(state.sourceLigandPreviewContent, fmt);
        v.setStyle({ model: lig }, {
            stick:  { radius: 0.38, colorscheme: 'greenCarbon' },
            sphere: { scale: 0.30, colorscheme: 'greenCarbon' },
        });
        v.zoomTo();
        v.render();
        state.sourceLigandPreviewViewer = v;
    }

    function resHasSdfBlock(text) {
        return /\n\s*\d+\s+\d+\s+.*V2000/.test(text || '');
    }

    function countAtoms(structureText) {
        return (structureText.match(/^(ATOM|HETATM)/gm) || []).length;
    }

    function pdbqtToPdbForViewer(pdbqtText) {
        const atomLines = (pdbqtText || '').split('\n')
            .filter(line => /^(ATOM|HETATM)/.test(line))
            .map(line => line.slice(0, 66));
        return atomLines.length ? `${atomLines.join('\n')}\nEND\n` : '';
    }

    function viewerModelFromStructure(content, format = 'pdbqt') {
        if (format === 'pdbqt') {
            return { content: pdbqtToPdbForViewer(content), format: 'pdb' };
        }
        return { content, format };
    }

    function preparedLigandViewerModel() {
        if (state.ligandPreviewContent) {
            return viewerModelFromStructure(state.ligandPreviewContent, state.ligandPreviewFormat || 'pdbqt');
        }
        if (state.ligandPdbqt) {
            return viewerModelFromStructure(state.ligandPdbqt, 'pdbqt');
        }
        return null;
    }

    function getSourceLigandStats() {
        if (!state.ligand?.fileContent) return 'Uploaded ligand';
        const text = state.ligand.fileContent;
        if (state.ligand.fileType === 'sdf' || state.ligand.fileType === 'mol') {
            const countsLine = text.split('\n')[3] || '';
            const atoms = parseInt(countsLine.slice(0, 3), 10);
            const coords = [];
            const lines = text.split('\n');
            for (let i = 4; i < 4 + (Number.isFinite(atoms) ? atoms : 0); i++) {
                const line = lines[i] || '';
                const z = parseFloat(line.slice(20, 30));
                if (Number.isFinite(z)) coords.push(z);
            }
            const zSpan = coords.length ? (Math.max(...coords) - Math.min(...coords)).toFixed(2) : '?';
            const dimensionality = Number(zSpan) <= 0.05 ? '2D source' : '3D source';
            return `Uploaded ${dimensionality} atoms ${Number.isFinite(atoms) ? atoms : '?'}`;
        }
        return `Uploaded ${state.ligand.fileType.toUpperCase()} atoms ${countAtoms(text)}`;
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
            show('conversionCard');
            show('paramsCard');
            setStep('grid');
            const usedDirect = state.protein.fileType === 'pdbqt' || state.ligand.fileType === 'pdbqt';
            toast(usedDirect ? 'PDBQT loaded — preview below' : 'Conversion complete — preview below', 'success');
            // Show stub warning if applicable
            if (state.backendMode !== 'vina-binary') show('stubWarning');
            autoGridFromPdbqt(state.ligandPdbqt, { silent: true });
            renderPreviewViewer();
            $('paramsCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) {
            toast(`Conversion failed: ${e.message}`, 'error');
            setStep('upload');
        } finally {
            $('btnConvert').disabled = false;
            updateConvertButton();
        }
    }

    async function convertVSProtein() {
        setStep('convert');
        $('btnConvertVS').disabled = true;
        $('convertHint').textContent = 'Converting receptor…';
        try {
            const pRes = await convertOne('protein');
            state.proteinPdbqt = pRes.pdbqt_content;
            renderPdbqt('protein', pRes);
            show('conversionCard');
            show('paramsCard');
            setStep('grid');
            toast(state.protein.fileType === 'pdbqt'
                ? 'Receptor PDBQT loaded — configure grid and run screening'
                : 'Receptor converted — configure grid and run screening', 'success');
            if (state.backendMode !== 'vina-binary') show('stubWarning');
            renderPreviewViewer();
            $('paramsCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) {
            toast(`Conversion failed: ${e.message}`, 'error');
            setStep('upload');
        } finally {
            $('btnConvertVS').disabled = false;
            updateConvertButton();
        }
    }

    // ─── 3D Preview viewer ────────────────────────────────────────────────────
    function getGridValues() {
        return {
            cx: parseFloat($('cx')?.value) || 0,
            cy: parseFloat($('cy')?.value) || 0,
            cz: parseFloat($('cz')?.value) || 0,
            sx: parseFloat($('sx')?.value) || 20,
            sy: parseFloat($('sy')?.value) || 20,
            sz: parseFloat($('sz')?.value) || 20,
        };
    }

    function renderPreviewViewer() {
        if (!state.proteinPdbqt) return;
        const el = $('previewViewer3D');
        if (!el || typeof $3Dmol === 'undefined') return;

        if (state.previewViewer) { try { state.previewViewer.clear(); } catch (e) {} }

        const theme = document.documentElement.getAttribute('data-theme') || 'light';
        const bg    = theme === 'dark' ? '#0b0d12' : '#f5f6fb';
        const v     = $3Dmol.createViewer(el, { defaultcolors: $3Dmol.rasmolElementColors });
        v.setBackgroundColor(bg);

        // Protein
        v.addModel(state.proteinPdbqt, 'pdbqt');
        v.setStyle({}, { cartoon: { color: 'spectrum' } });

        // Ligand (single mode only — VS ligands not yet converted)
        const ligandModel = state.mode === 'single' ? preparedLigandViewerModel() : null;
        if (ligandModel?.content) {
            const lig = v.addModel(ligandModel.content, ligandModel.format);
            v.setStyle({ model: lig }, {
                stick:  { radius: 0.35, colorscheme: 'orangeCarbon' },
                sphere: { scale: 0.34, colorscheme: 'orangeCarbon' },
            });
        }

        drawGridBox(v);

        if (ligandModel?.content) {
            v.zoomTo({ model: 1 });
        } else {
            v.zoomTo();
        }
        v.render();
        state.previewViewer = v;
    }

    /** Re-draw only the box on the existing preview viewer (cheap). */
    function updateGridBox() {
        const v = state.previewViewer;
        if (!v) return;
        try {
            v.removeAllShapes();
            drawGridBox(v);
            v.render();
        } catch (e) { /* viewer may not support removeAllShapes — rebuild */ renderPreviewViewer(); }
    }

    function drawGridBox(v) {
        const g = getGridValues();
        const min = { x: g.cx - g.sx / 2, y: g.cy - g.sy / 2, z: g.cz - g.sz / 2 };
        const max = { x: g.cx + g.sx / 2, y: g.cy + g.sy / 2, z: g.cz + g.sz / 2 };
        try {
            v.addBox({
                center:     { x: g.cx, y: g.cy, z: g.cz },
                dimensions: { w: g.sx, h: g.sy, d: g.sz },
                color:      '#ff6a00',
                opacity:    0.55,
            });
            v.addBox({
                center:     { x: g.cx, y: g.cy, z: g.cz },
                dimensions: { w: g.sx, h: g.sy, d: g.sz },
                color:      '#ff3d00',
                wireframe:  true,
                linewidth:  8,
                opacity:    1.0,
            });
        } catch (e) {}
        const pts = [
            { x: min.x, y: min.y, z: min.z }, { x: max.x, y: min.y, z: min.z },
            { x: max.x, y: max.y, z: min.z }, { x: min.x, y: max.y, z: min.z },
            { x: min.x, y: min.y, z: max.z }, { x: max.x, y: min.y, z: max.z },
            { x: max.x, y: max.y, z: max.z }, { x: min.x, y: max.y, z: max.z },
        ];
        const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
        edges.forEach(([a, b]) => {
            if (typeof v.addLine === 'function') {
                v.addLine({ start: pts[a], end: pts[b], color: '#ff3d00', linewidth: 8 });
            }
        });
    }

    // ─── Blind docking ────────────────────────────────────────────────────────
    function computeProteinBBox(pdbqt) {
        const xs = [], ys = [], zs = [];
        for (const line of pdbqt.split('\n')) {
            if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
                const x = parseFloat(line.substring(30, 38));
                const y = parseFloat(line.substring(38, 46));
                const z = parseFloat(line.substring(46, 54));
                if (Number.isFinite(x)) { xs.push(x); ys.push(y); zs.push(z); }
            }
        }
        if (!xs.length) return null;
        return {
            minX: Math.min(...xs), maxX: Math.max(...xs),
            minY: Math.min(...ys), maxY: Math.max(...ys),
            minZ: Math.min(...zs), maxZ: Math.max(...zs),
        };
    }

    function applyBlindDocking() {
        if (!state.proteinPdbqt) {
            toast('Convert the receptor first to use blind docking', 'warning');
            $('blindDockingToggle').checked = false;
            return;
        }
        const bb = computeProteinBBox(state.proteinPdbqt);
        if (!bb) {
            toast('No ATOM records found in receptor PDBQT', 'error');
            $('blindDockingToggle').checked = false;
            return;
        }
        const PAD = 8; // Å padding on every side
        const cx  = ((bb.minX + bb.maxX) / 2).toFixed(2);
        const cy  = ((bb.minY + bb.maxY) / 2).toFixed(2);
        const cz  = ((bb.minZ + bb.maxZ) / 2).toFixed(2);
        const sx  = Math.min(126, Math.ceil(bb.maxX - bb.minX + PAD));
        const sy  = Math.min(126, Math.ceil(bb.maxY - bb.minY + PAD));
        const sz  = Math.min(126, Math.ceil(bb.maxZ - bb.minZ + PAD));

        // Fill grid inputs (but make read-only while blind mode is on)
        ['cx','cy','cz','sx','sy','sz'].forEach(id => {
            const el = $(id); if (!el) return;
            el.value    = { cx, cy, cz, sx, sy, sz }[id];
            el.readOnly = true;
            el.style.opacity = '0.6';
        });
        updateGridBox();
        toast(`Blind docking: ${sx}×${sy}×${sz} Å centered on protein`, 'success');
    }

    function disableBlindDocking() {
        ['cx','cy','cz','sx','sy','sz'].forEach(id => {
            const el = $(id); if (!el) return;
            el.readOnly    = false;
            el.style.opacity = '';
        });
    }

    // ─── Auto-grid from first ligand ─────────────────────────────────────────
    function autoGridFromLigand() {
        const ligand = state.mode === 'single'
            ? state.ligand
            : (state.virtualLigands[0] || null);

        if (!ligand || !['pdb', 'pdbqt'].includes(ligand.fileType)) {
            toast('Auto-center needs a PDB or PDBQT ligand to read coordinates', 'warning');
            return;
        }
        const xs = [], ys = [], zs = [];
        for (const line of ligand.fileContent.split('\n')) {
            if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
                const x = parseFloat(line.substring(30, 38));
                const y = parseFloat(line.substring(38, 46));
                const z = parseFloat(line.substring(46, 54));
                if (Number.isFinite(x)) { xs.push(x); ys.push(y); zs.push(z); }
            }
        }
        if (!xs.length) { toast('No coordinates found in ligand', 'error'); return; }
        const avg  = (a) => a.reduce((s, v) => s + v, 0) / a.length;
        const span = (a) => Math.max(20, Math.ceil((Math.max(...a) - Math.min(...a)) + 10));
        $('cx').value = avg(xs).toFixed(2);
        $('cy').value = avg(ys).toFixed(2);
        $('cz').value = avg(zs).toFixed(2);
        $('sx').value = Math.min(126, span(xs));
        $('sy').value = Math.min(126, span(ys));
        $('sz').value = Math.min(126, span(zs));
        updateGridBox();
        toast('Grid centered on ligand', 'success');
    }

    function autoGridFromPdbqt(pdbqt, opts = {}) {
        if (!pdbqt) return false;
        const bb = computeProteinBBox(pdbqt);
        if (!bb) return false;
        const cx = ((bb.minX + bb.maxX) / 2).toFixed(2);
        const cy = ((bb.minY + bb.maxY) / 2).toFixed(2);
        const cz = ((bb.minZ + bb.maxZ) / 2).toFixed(2);
        const sx = Math.min(126, Math.max(20, Math.ceil(bb.maxX - bb.minX + 10)));
        const sy = Math.min(126, Math.max(20, Math.ceil(bb.maxY - bb.minY + 10)));
        const sz = Math.min(126, Math.max(20, Math.ceil(bb.maxZ - bb.minZ + 10)));
        Object.entries({ cx, cy, cz, sx, sy, sz }).forEach(([id, value]) => {
            const el = $(id);
            if (el && !el.readOnly) el.value = value;
        });
        if (!opts.silent) {
            updateGridBox();
            toast('Grid centered on ligand PDBQT', 'success');
        }
        return true;
    }

    // ─── Grid + Vina param accessors ──────────────────────────────────────────
    function getGrid() {
        const g = getGridValues();
        return { center_x: g.cx, center_y: g.cy, center_z: g.cz,
                 size_x: g.sx, size_y: g.sy, size_z: g.sz };
    }
    function getVinaParams() {
        return {
            forcefield:     $('ff').value,
            num_modes:      parseInt($('nmodes').value, 10) || 9,
            exhaustiveness: parseInt($('exh').value, 10)   || 8,
            energy_range:   parseFloat($('erange').value)  || 3.0,
        };
    }

    // ─── Single docking ───────────────────────────────────────────────────────
    async function runDocking() {
        setStep('dock');
        show('dockLoadingCard');
        hide('resultsCard');
        $('btnDock').disabled = true;

        try {
            const r = await fetch('/api/docking/run-docking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    protein_pdbqt:  state.proteinPdbqt,
                    ligand_pdbqt:   state.ligandPdbqt,
                    grid_config:    getGrid(),
                    docking_params: getVinaParams(),
                }),
            });
            if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                throw new Error(err.detail || err.error || `HTTP ${r.status}`);
            }
            state.dockingResult = await r.json();
            renderResults(state.dockingResult);

            const isStub = state.dockingResult.message?.includes('stub');
            toast(isStub
                ? '⚠ Stub result — install `vina` binary for real docking'
                : (state.dockingResult.message || 'Docking complete'),
                isStub ? 'warning' : 'success');
        } catch (e) {
            toast(`Docking failed: ${e.message}`, 'error');
        } finally {
            hide('dockLoadingCard');
            $('btnDock').disabled = false;
        }
    }

    function renderResults(data) {
        show('resultsCard');
        state.selectedPoseMode = data.poses?.[0]?.mode || 1;
        state.selectedComplexPdbqt = extractPosePdbqt(data.docked_pdbqt, state.selectedPoseMode);
        $('bestAffinity').textContent = data.best_affinity?.toFixed(3) ?? '—';
        $('avgAffinity').textContent  = data.average_affinity?.toFixed(3) ?? '—';
        $('totalModes').textContent   = data.total_modes ?? '—';
        $('engineMode').textContent   = state.backendMode;

        const tbody = document.querySelector('#posesTable tbody');
        tbody.innerHTML = data.poses.map((p, i) => `
            <tr data-mode="${p.mode}" class="${i === 0 ? 'active' : ''}" style="cursor:pointer">
                <td>${p.mode}</td>
                <td class="affinity-cell">${p.affinity.toFixed(3)}</td>
                <td>${p.rmsd_lb.toFixed(3)}</td>
                <td>${p.rmsd_ub.toFixed(3)}</td>
            </tr>`).join('');
        tbody.querySelectorAll('tr').forEach(row => {
            row.addEventListener('click', () => {
                tbody.querySelectorAll('tr').forEach(r => r.classList.remove('active'));
                row.classList.add('active');
                state.selectedPoseMode = parseInt(row.dataset.mode, 10) || 1;
                state.selectedComplexPdbqt = extractPosePdbqt(data.docked_pdbqt, state.selectedPoseMode);
                renderViewer(state.proteinPdbqt, state.selectedComplexPdbqt, state.selectedPoseMode);
            });
        });

        $('vinaLog').textContent = data.vina_log || '(no log)';
        renderViewer(state.proteinPdbqt, state.selectedComplexPdbqt, state.selectedPoseMode);
        $('resultsCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function extractPosePdbqt(dockedPdbqt, mode) {
        if (!dockedPdbqt) return '';
        const blocks = dockedPdbqt.match(/MODEL[\s\S]*?ENDMDL/g);
        if (!blocks?.length) return dockedPdbqt;
        return blocks[mode - 1] || blocks[0];
    }

    // ─── Virtual screening ────────────────────────────────────────────────────
    async function runVirtualScreening() {
        if (!state.proteinPdbqt)        { toast('Convert the receptor first', 'error'); return; }
        if (!state.virtualLigands.length) { toast('No ligands in library', 'error'); return; }

        state.vsResults = [];
        state.vsAborted = false;
        const total  = state.virtualLigands.length;
        const grid   = getGrid();
        const params = getVinaParams();

        setStep('dock');
        hide('vsResultsCard');
        show('vsProgressCard');
        $('btnRunVS').disabled = true;

        const log = $('vsProgressLog');
        const bar = $('vsProgressBar');
        const appendLog = (msg) => {
            const line = document.createElement('div');
            line.textContent = msg;
            log.appendChild(line);
            log.scrollTop = log.scrollHeight;
        };

        for (let i = 0; i < total; i++) {
            if (state.vsAborted) break;
            const lig = state.virtualLigands[i];
            bar.style.width = `${Math.round((i / total) * 100)}%`;
            $('vsProgressTitle').textContent = `Virtual screening — ${i + 1} / ${total}`;
            $('vsProgressDesc').textContent  = `Docking: ${lig.name}`;

            appendLog(`[${i + 1}/${total}] ${lig.name} — converting…`);
            let ligandPdbqt;
            try {
                const cRes  = await convertVSLigand(lig);
                ligandPdbqt = cRes.pdbqt_content;
                const atoms = (ligandPdbqt.match(/^(ATOM|HETATM)/gm) || []).length;
                appendLog(`  ✓ Converted (${atoms} atoms)`);
            } catch (e) {
                appendLog(`  ✗ Convert failed: ${e.message}`);
                state.vsResults.push({ name: lig.name, status: 'failed', error: `Convert: ${e.message}` });
                continue;
            }

            appendLog(`  ► Running docking…`);
            try {
                const r = await fetch('/api/docking/run-docking', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        protein_pdbqt:  state.proteinPdbqt,
                        ligand_pdbqt:   ligandPdbqt,
                        grid_config:    grid,
                        docking_params: params,
                    }),
                });
                if (!r.ok) {
                    const err = await r.json().catch(() => ({}));
                    throw new Error(err.detail || err.error || `HTTP ${r.status}`);
                }
                const data = await r.json();
                state.vsResults.push({
                    name:             lig.name,
                    status:           'success',
                    best_affinity:    data.best_affinity,
                    average_affinity: data.average_affinity,
                    total_modes:      data.total_modes,
                    docked_pdbqt:     data.docked_pdbqt,
                });
                appendLog(`  ✓ Best affinity: ${data.best_affinity?.toFixed(3) ?? '?'} kcal/mol`);
            } catch (e) {
                appendLog(`  ✗ Docking failed: ${e.message}`);
                state.vsResults.push({ name: lig.name, status: 'failed', error: `Dock: ${e.message}` });
            }
        }

        bar.style.width = '100%';
        hide('vsProgressCard');
        $('btnRunVS').disabled = false;
        const ok = state.vsResults.filter(r => r.status === 'success').length;
        toast(`Screening complete — ${ok}/${total} succeeded`, ok > 0 ? 'success' : 'warning');
        renderVSResults();
    }

    function renderVSResults() {
        const successes = state.vsResults.filter(r => r.status === 'success')
                                         .sort((a, b) => a.best_affinity - b.best_affinity);
        const failures  = state.vsResults.filter(r => r.status !== 'success');
        const ranked    = [...successes, ...failures];

        $('vsLigandsScreened').textContent = state.vsResults.length;
        $('vsSucceeded').textContent        = successes.length;
        $('vsBestAffinity').textContent     = successes[0]?.best_affinity.toFixed(3) ?? '—';
        $('vsBestLigand').textContent       = successes[0]?.name ?? '—';

        const tbody = $('vsRankedTbody');
        tbody.innerHTML = ranked.map((r, i) => {
            const isOK = r.status === 'success';
            return `
            <tr class="${isOK ? 'vs-row-ok' : 'vs-row-fail'}" data-vs-idx="${i}"
                style="cursor:${isOK ? 'pointer' : 'default'}">
                <td><strong>${isOK ? i + 1 : '—'}</strong></td>
                <td>${r.name}</td>
                <td style="${isOK ? 'color:var(--accent);font-weight:700' : ''}">${isOK ? r.best_affinity.toFixed(3) : '—'}</td>
                <td>${isOK ? (r.average_affinity?.toFixed(3) ?? '—') : '—'}</td>
                <td>${isOK ? (r.total_modes ?? '—') : '—'}</td>
                <td>${isOK
                    ? '<span style="color:#16a34a;font-weight:600">✓ OK</span>'
                    : `<span style="color:#dc2626" title="${(r.error||'').replace(/"/g,'&quot;')}">✗ Failed</span>`}</td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('tr.vs-row-ok').forEach(row => {
            row.addEventListener('click', () => {
                tbody.querySelectorAll('tr').forEach(r => r.classList.remove('active'));
                row.classList.add('active');
                const r = ranked[parseInt(row.dataset.vsIdx, 10)];
                if (r?.docked_pdbqt) {
                    $('vsViewerCard').style.display = '';
                    $('vsViewerLabel').textContent  = r.name;
                    renderVSViewer(state.proteinPdbqt, r.docked_pdbqt);
                    $('vsViewerCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });

        show('vsResultsCard');
        $('vsResultsCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function exportCSV() {
        if (!state.vsResults.length) { toast('No results to export', 'warning'); return; }
        const successes = state.vsResults.filter(r => r.status === 'success')
                                         .sort((a, b) => a.best_affinity - b.best_affinity);
        const ranked = [...successes, ...state.vsResults.filter(r => r.status !== 'success')];
        const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const header = ['Rank','Ligand','Best Affinity (kcal/mol)','Avg Affinity','Modes','Status','Error'];
        const rows   = ranked.map((r, i) => [
            r.status === 'success' ? i + 1 : '',
            r.name, r.best_affinity?.toFixed(3) ?? '',
            r.average_affinity?.toFixed(3) ?? '',
            r.total_modes ?? '', r.status, r.error || '',
        ].map(q).join(','));
        const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv' });
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = `vs_results_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('CSV exported', 'success');
    }

    function downloadSelectedComplex() {
        if (!state.proteinPdbqt || !state.selectedComplexPdbqt) {
            toast('No selected docked complex to download', 'warning');
            return;
        }
        const mode = state.selectedPoseMode || 1;
        const content = [
            `REMARK PrismBB Drug selected docking complex`,
            `REMARK Selected binding mode ${mode}`,
            `REMARK Receptor PDBQT followed by docked ligand pose ${mode}`,
            state.proteinPdbqt.trim(),
            state.selectedComplexPdbqt.trim(),
            '',
        ].join('\n');
        const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(new Blob([content], { type: 'chemical/x-pdbqt' })),
            download: `docking_complex_mode_${mode}.pdbqt`,
        });
        a.click();
        URL.revokeObjectURL(a.href);
        toast(`Downloaded complex for binding mode ${mode}`, 'success');
    }

    // ─── 3D viewers ───────────────────────────────────────────────────────────
    function makeBg() {
        const t = document.documentElement.getAttribute('data-theme') || 'light';
        return t === 'dark' ? '#0b0d12' : '#f5f6fb';
    }

    function renderViewer(proteinPdbqt, ligandPdbqt, mode = 1) {
        if (state.viewer) { try { state.viewer.clear(); } catch (e) {} }
        const el = $('dockViewer3D');
        if (!el || typeof $3Dmol === 'undefined') return;
        const v = $3Dmol.createViewer(el, { defaultcolors: $3Dmol.rasmolElementColors });
        v.setBackgroundColor(makeBg());
        if (proteinPdbqt) {
            v.addModel(proteinPdbqt, 'pdbqt');
            v.setStyle({}, { cartoon: { color: 'spectrum' } });
        }
        if (ligandPdbqt) {
            const ligandModel = viewerModelFromStructure(ligandPdbqt, 'pdbqt');
            const lig = v.addModel(ligandModel.content, ligandModel.format);
            v.setStyle({ model: lig }, {
                stick:  { radius: 0.32, colorscheme: 'orangeCarbon' },
                sphere: { scale: 0.28, colorscheme: 'orangeCarbon' },
            });
        }
        state.selectedInteractions = findLigandInteractions(proteinPdbqt, ligandPdbqt);
        drawInteractions(v, state.selectedInteractions);
        renderInteractionTable(state.selectedInteractions);
        if (ligandPdbqt) v.zoomTo({ model: 1 });
        else v.zoomTo();
        v.render();
        state.viewer = v;
        const visibleCount = state.selectedInteractions.filter(i => state.interactionTypes.has(i.type)).length;
        const hbondCount = state.selectedInteractions.filter(i => i.type === 'hbond').length;
        const info = $('dockViewerInfo');
        if (info) {
            info.textContent = `Receptor in cartoon · selected ligand pose ${mode} in orange sticks · ${visibleCount} displayed interaction(s), ${hbondCount} H-bond(s) detected.`;
        }
    }

    function parsePdbqtAtoms(pdbqtText, role) {
        return (pdbqtText || '').split('\n')
            .filter(line => /^(ATOM|HETATM)/.test(line))
            .map((line, idx) => {
                const atomName = line.slice(12, 16).trim() || `A${idx + 1}`;
                const resn = line.slice(17, 20).trim() || (role === 'ligand' ? 'LIG' : 'UNK');
                const chain = line.slice(21, 22).trim();
                const resi = parseInt(line.slice(22, 26), 10);
                const parts = line.trim().split(/\s+/);
                const tailType = parts[parts.length - 1] || '';
                const element = inferElement(atomName, tailType);
                return {
                    idx: idx + 1,
                    role,
                    line,
                    atomName,
                    resn,
                    chain,
                    resi: Number.isFinite(resi) ? resi : null,
                    x: parseFloat(line.slice(30, 38)),
                    y: parseFloat(line.slice(38, 46)),
                    z: parseFloat(line.slice(46, 54)),
                    element,
                };
            })
            .filter(a => Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z));
    }

    function inferElement(atomName, pdbqtType) {
        const candidate = (pdbqtType || atomName || 'C').replace(/[^A-Za-z]/g, '').toUpperCase();
        if (candidate.startsWith('CL')) return 'CL';
        if (candidate.startsWith('BR')) return 'BR';
        return (candidate[0] || 'C').toUpperCase();
    }

    function atomDistance(a, b) {
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    function residueLabel(atom) {
        const chain = atom.chain ? `${atom.chain}:` : '';
        const resi = atom.resi === null ? '' : atom.resi;
        return `${atom.resn} ${chain}${resi}`.trim();
    }

    function findLigandInteractions(proteinPdbqt, ligandPdbqt) {
        if (!proteinPdbqt || !ligandPdbqt) return [];
        const proteinAtoms = parsePdbqtAtoms(proteinPdbqt, 'protein');
        const ligandAtoms = parsePdbqtAtoms(ligandPdbqt, 'ligand');
        const interactions = [];
        const seen = new Set();
        const proteinCharged = new Set(['ASP', 'GLU', 'LYS', 'ARG', 'HIS']);
        const aromaticResidues = new Set(['PHE', 'TYR', 'TRP', 'HIS']);

        for (const p of proteinAtoms) {
            for (const l of ligandAtoms) {
                const d = atomDistance(p, l);
                if (d > 5.0) continue;
                const isPolarPair = ['N', 'O', 'S'].includes(p.element) && ['N', 'O', 'S'].includes(l.element);
                const isCarbonPair = p.element === 'C' && l.element === 'C';

                if (isPolarPair && d <= 3.5) {
                    interactions.push(makeInteraction('hbond', p, l, d));
                }
                if (isCarbonPair && d <= 4.5) {
                    interactions.push(makeInteraction('hydrophobic', p, l, d));
                }
                if (proteinCharged.has(p.resn) && ['N', 'O'].includes(l.element) && d <= 4.0) {
                    interactions.push(makeInteraction('ionic', p, l, d));
                }
                if (aromaticResidues.has(p.resn) && l.element === 'C' && d <= 5.0) {
                    interactions.push(makeInteraction('aromatic', p, l, d));
                }
            }
        }

        return interactions
            .sort((a, b) => a.distance - b.distance)
            .filter(i => {
                const key = `${i.type}:${i.proteinResidue}:${i.proteinAtom}:${i.ligandAtom}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, 80);
    }

    function makeInteraction(type, proteinAtom, ligandAtom, distance) {
        return {
            type,
            proteinAtom,
            ligandAtom,
            proteinResidue: residueLabel(proteinAtom),
            distance,
        };
    }

    function interactionColor(type) {
        return ({
            hbond: '#2f80ed',
            hydrophobic: '#f2994a',
            ionic: '#9b51e0',
            aromatic: '#27ae60',
        })[type] || '#888888';
    }

    function drawInteractions(viewer, interactions) {
        if (!viewer || !interactions?.length) return;
        interactions
            .filter(i => state.interactionTypes.has(i.type))
            .slice(0, 40)
            .forEach(i => {
                viewer.addCylinder({
                    start: { x: i.proteinAtom.x, y: i.proteinAtom.y, z: i.proteinAtom.z },
                    end: { x: i.ligandAtom.x, y: i.ligandAtom.y, z: i.ligandAtom.z },
                    radius: i.type === 'hbond' ? 0.08 : 0.055,
                    color: interactionColor(i.type),
                    alpha: 0.82,
                });
            });
    }

    function renderInteractionTable(interactions) {
        const summary = $('interactionSummary');
        const tbody = document.querySelector('#interactionTable tbody');
        if (!summary || !tbody) return;
        const visible = (interactions || []).filter(i => state.interactionTypes.has(i.type));
        const counts = ['hbond', 'hydrophobic', 'ionic', 'aromatic']
            .map(type => `${typeLabel(type)} ${visible.filter(i => i.type === type).length}`)
            .join(' · ');
        summary.textContent = visible.length
            ? `${visible.length} displayed interaction(s): ${counts}`
            : 'No selected interaction types detected for this pose. Enable other interaction types or select another binding mode.';
        tbody.innerHTML = visible.slice(0, 40).map(i => `
            <tr>
                <td><span style="color:${interactionColor(i.type)};font-weight:700">${typeLabel(i.type)}</span></td>
                <td>${escapeHtml(i.proteinResidue)}</td>
                <td>${escapeHtml(i.proteinAtom.atomName)}</td>
                <td>${escapeHtml(i.ligandAtom.atomName)}</td>
                <td>${i.distance.toFixed(2)} Å</td>
            </tr>
        `).join('');
    }

    function typeLabel(type) {
        return ({
            hbond: 'H-bond',
            hydrophobic: 'Hydrophobic',
            ionic: 'Ionic',
            aromatic: 'Aromatic',
        })[type] || type;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        })[ch]);
    }

    function refreshInteractionDisplay() {
        if (state.viewer) {
            renderViewer(state.proteinPdbqt, state.selectedComplexPdbqt, state.selectedPoseMode);
        } else {
            renderInteractionTable(state.selectedInteractions);
        }
    }

    function renderVSViewer(proteinPdbqt, ligandPdbqt) {
        if (state.vsViewer) { try { state.vsViewer.clear(); } catch (e) {} }
        const el = $('vsViewer3D');
        if (!el || typeof $3Dmol === 'undefined') return;
        const v = $3Dmol.createViewer(el, { defaultcolors: $3Dmol.rasmolElementColors });
        v.setBackgroundColor(makeBg());
        if (proteinPdbqt) {
            v.addModel(proteinPdbqt, 'pdbqt');
            v.setStyle({}, { cartoon: { color: 'spectrum' } });
        }
        if (ligandPdbqt) {
            const ligandModel = viewerModelFromStructure(ligandPdbqt, 'pdbqt');
            const lig = v.addModel(ligandModel.content, ligandModel.format);
            v.setStyle({ model: lig }, {
                stick:  { radius: 0.18, colorscheme: 'orangeCarbon' },
                sphere: { scale: 0.22, colorscheme: 'orangeCarbon' },
            });
        }
        v.zoomTo(); v.render();
        state.vsViewer = v;
    }

    // ─── reset ────────────────────────────────────────────────────────────────
    function resetSingle() {
        ['conversionCard','paramsCard','dockLoadingCard','resultsCard','stubWarning'].forEach(hide);
        clearSlot('protein'); clearSlot('ligand');
        state.proteinPdbqt = state.ligandPdbqt = state.dockingResult = state.previewViewer = null;
        state.ligandPreviewContent = null;
        state.ligandPreviewFormat = null;
        state.sourceLigandPreviewContent = null;
        state.sourceLigandPreviewViewer = null;
        state.ligandPreviewViewer = null;
        state.selectedPoseMode = 1;
        state.selectedComplexPdbqt = null;
        state.selectedInteractions = [];
        $('blindDockingToggle').checked = false;
        disableBlindDocking();
        setStep('upload');
    }
    function resetVS() {
        ['conversionCard','paramsCard','vsProgressCard','vsResultsCard','stubWarning'].forEach(hide);
        clearSlot('protein');
        state.virtualLigands = []; state.vsResults = []; state.proteinPdbqt = null;
        state.previewViewer  = null;
        $('blindDockingToggle').checked = false;
        disableBlindDocking();
        renderVSLibrary(); updateConvertButton(); setStep('upload');
    }

    // ─── wire-up ──────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        fetchBackendMode();
        bindFileSlot('protein');
        bindFileSlot('ligand');

        // Mode tabs
        $('modeSingleBtn').addEventListener('click', () => setMode('single'));
        $('modeVSBtn').addEventListener('click',     () => setMode('vs'));

        // VS ligand library upload
        const vsInput = $('vsLigandInput');
        const vsDrop  = $('vsLigandDrop');
        if (vsInput) vsInput.addEventListener('change', (e) => handleVSFiles(Array.from(e.target.files)));
        if (vsDrop) {
            vsDrop.addEventListener('click',     () => vsInput?.click());
            vsDrop.addEventListener('dragover',  (e) => { e.preventDefault(); vsDrop.classList.add('dragover'); });
            vsDrop.addEventListener('dragleave', ()  => vsDrop.classList.remove('dragover'));
            vsDrop.addEventListener('drop', (e) => {
                e.preventDefault(); vsDrop.classList.remove('dragover');
                handleVSFiles(Array.from(e.dataTransfer.files));
            });
        }
        $('vsClearLibrary')?.addEventListener('click', () => {
            state.virtualLigands = []; renderVSLibrary(); updateConvertButton();
        });

        // Data-clear / download buttons
        document.querySelectorAll('[data-clear]').forEach(btn =>
            btn.addEventListener('click', () => clearSlot(btn.dataset.clear)));
        document.querySelectorAll('[data-download]').forEach(btn =>
            btn.addEventListener('click', () => {
                const kind    = btn.dataset.download;
                const content = kind === 'protein' ? state.proteinPdbqt : state.ligandPdbqt;
                if (!content) return;
                const a = Object.assign(document.createElement('a'), {
                    href: URL.createObjectURL(new Blob([content], { type: 'text/plain' })),
                    download: `${kind}.pdbqt`,
                });
                a.click(); URL.revokeObjectURL(a.href);
            }));

        // Conversion buttons
        $('btnConvert').addEventListener('click',   convertAll);
        $('btnConvertVS').addEventListener('click', convertVSProtein);

        // Grid inputs → live box update
        ['cx','cy','cz','sx','sy','sz'].forEach(id => {
            $(id)?.addEventListener('input', updateGridBox);
        });

        // Blind docking toggle
        $('blindDockingToggle').addEventListener('change', (e) => {
            if (e.target.checked) applyBlindDocking();
            else disableBlindDocking();
        });

        // Action buttons
        $('btnAutoGrid').addEventListener('click',  autoGridFromLigand);
        $('btnDock').addEventListener('click',      runDocking);
        $('btnRunVS').addEventListener('click',     runVirtualScreening);
        $('btnExportCSV').addEventListener('click', exportCSV);
        $('btnDownloadComplex')?.addEventListener('click', downloadSelectedComplex);
        document.querySelectorAll('.interaction-toggle').forEach(input => {
            input.addEventListener('change', () => {
                state.interactionTypes = new Set(
                    Array.from(document.querySelectorAll('.interaction-toggle:checked')).map(el => el.value),
                );
                refreshInteractionDisplay();
            });
        });
        $('btnReset').addEventListener('click',     resetSingle);
        $('btnResetVS').addEventListener('click',   resetVS);
    });
})();
