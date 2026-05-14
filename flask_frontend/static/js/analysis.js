// Analysis-specific JavaScript for PrismBB Drug
class AnalysisApp {
    constructor() {
        this.currentResults = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Analysis form submission
        const form = document.getElementById('analysisForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.analyzeInput();
            });
        }

        // New analysis button
        const newAnalysisBtn = document.getElementById('newAnalysisBtn');
        if (newAnalysisBtn) {
            newAnalysisBtn.addEventListener('click', () => {
                this.resetAnalysis();
            });
        }
    }

    async analyzeInput() {
        try {
            // Get input data from file upload handler or SMILES input
            const inputData = window.fileUploadHandler ? window.fileUploadHandler.getInputData() : null;
            
            if (!inputData) {
                this.showError('Please enter a SMILES string or upload a molecular file');
                return;
            }

            if (inputData.type === 'smiles' && !inputData.data) {
                this.showError('Please enter a SMILES string');
                return;
            }

            if (inputData.type === 'file' && !inputData.file) {
                this.showError('Please upload a molecular structure file');
                return;
            }

            // Clear previous messages and update UI
            window.molecularApp.clearMessages();
            this.showLoadingState();
            window.molecularApp.updateProgressSteps('analysis');

            if (inputData.type === 'smiles') {
                await this.analyzeSmiles(inputData.data);
            } else if (inputData.type === 'file') {
                await this.analyzeFile(inputData);
            }

        } catch (error) {
            console.error('Analysis failed:', error);
            this.showError(error.message);
            this.resetToInput();
        }
    }

    async analyzeFile(inputData) {
        try {
            // Read file content
            const fileContent = await window.fileUploadHandler.readFileContent();
            
            if (!fileContent) {
                throw new Error('Failed to read file content');
            }

            // For PDB files, we can directly use the 3D structure
            if (inputData.fileType === 'pdb') {
                // Step 1: Extract basic info from PDB
                this.updateLoadingStep('loadingParse', 'active');
                const basicInfo = this.extractPDBInfo(fileContent, inputData.fileName);
                this.updateLoadingStep('loadingParse', 'completed');

                // Step 2: Use PDB as 3D structure
                this.updateLoadingStep('loadingConformer', 'active');
                const conformerData = {
                    pdb_block: fileContent,
                    status: 'ok',
                    forcefield_used: 'File',
                    atom_count: (fileContent.match(/HETATM|ATOM/g) || []).length,
                    has_3d_coords: true
                };
                this.updateLoadingStep('loadingConformer', 'completed');

                // Step 3: Skip analysis for now
                this.updateLoadingStep('loadingAnalysis', 'active');
                const analysisData = {};
                this.updateLoadingStep('loadingAnalysis', 'completed');

                // Combine results
                this.currentResults = {
                    molecule: basicInfo,
                    conformer: conformerData,
                    analysis: analysisData
                };

                // Show results
                this.showResults();
                window.molecularApp.updateProgressSteps('results');
                window.molecularApp.showMessage(`PDB file "${inputData.fileName}" loaded successfully!`, 'success');
            } else {
                // For other formats, show a message that they need backend support
                throw new Error(`File format ${inputData.fileType.toUpperCase()} requires backend processing. Currently only PDB files are supported for direct upload.`);
            }

        } catch (error) {
            console.error('File analysis failed:', error);
            throw error;
        }
    }

    extractPDBInfo(pdbContent, fileName) {
        // Extract basic information from PDB file
        const lines = pdbContent.split('\n');
        let compoundName = fileName.replace(/\.[^/.]+$/, ""); // Remove extension
        
        // Look for COMPND record
        for (const line of lines) {
            if (line.startsWith('COMPND') && line.includes('MOLECULE:')) {
                const match = line.match(/MOLECULE:\s*([^;]+)/);
                if (match) {
                    compoundName = match[1].trim();
                    break;
                }
            }
        }

        return {
            smiles: 'N/A (from PDB file)',
            formula: 'Unknown',
            weight: 0,
            inchi: 'N/A',
            inchikey: 'N/A',
            descriptors: {
                'compound_name': compoundName,
                'source': 'PDB file upload',
                'file_name': fileName
            }
        };
    }

    async analyzeSmiles(smiles) {
        if (!smiles) {
            this.showError('Please enter a SMILES string');
            return;
        }

        try {
            // Clear previous messages and update UI
            window.molecularApp.clearMessages();
            this.showLoadingState();
            window.molecularApp.updateProgressSteps('analysis');

            // Step 1: Parse the molecule
            this.updateLoadingStep('loadingParse', 'active');
            const parseResponse = await fetch('/api/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ smiles })
            });

            if (!parseResponse.ok) {
                const error = await parseResponse.json();
                throw new Error(error.error || 'Failed to parse SMILES');
            }

            const parseData = await parseResponse.json();
            this.updateLoadingStep('loadingParse', 'completed');

            // Step 2: Generate 3D conformer
            this.updateLoadingStep('loadingConformer', 'active');
            const conformerResponse = await fetch('/api/conformer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ smiles, forcefield: 'UFF' })
            });

            const conformerData = await conformerResponse.json();
            this.updateLoadingStep('loadingConformer', 'completed');

            // Step 3: Full analysis (includes ADMET if available)
            this.updateLoadingStep('loadingAnalysis', 'active');
            const analysisResponse = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ smiles })
            });

            const analysisData = await analysisResponse.json();
            this.updateLoadingStep('loadingAnalysis', 'completed');

            // Combine results
            this.currentResults = {
                molecule: parseData,
                conformer: conformerData,
                analysis: analysisData
            };

            // Show results
            this.showResults();
            window.molecularApp.updateProgressSteps('results');
            window.molecularApp.showMessage('Analysis completed successfully!', 'success');

        } catch (error) {
            console.error('Analysis failed:', error);
            this.showError(error.message);
            this.resetToInput();
        }
    }

    showLoadingState() {
        this.hideAllSections();
        document.getElementById('loadingSection').classList.remove('hidden');
        
        // Reset loading steps
        document.querySelectorAll('.loading-step').forEach(step => {
            step.classList.remove('active', 'completed');
        });
    }

    updateLoadingStep(stepId, status) {
        const step = document.getElementById(stepId);
        if (step) {
            step.classList.remove('active', 'completed');
            step.classList.add(status);
        }
    }

    showResults() {
        this.hideAllSections();
        document.getElementById('resultsSection').classList.remove('hidden');
        
        if (this.currentResults) {
            this.populateBasicProperties();
            this.populateDrugProperties();
            this.populateAllDescriptors();
            this.populateStructureInfo();
            this.populateAdmetResults();
        }
    }

    populateBasicProperties() {
        const container = document.getElementById('basicProperties');
        const { molecule } = this.currentResults;

        const properties = [
            { label: 'SMILES', value: molecule.smiles },
            { label: 'Formula', value: molecule.formula },
            { label: 'Mol. weight', value: `${molecule.weight} g/mol` },
            { label: 'InChI Key', value: molecule.inchikey ? `${molecule.inchikey.substring(0, 14)}…` : 'N/A' }
        ];

        container.innerHTML = properties.map(prop => `
            <div class="property-item">
                <span class="property-name">${prop.label}</span>
                <span class="property-value">${prop.value}</span>
            </div>
        `).join('');
    }

    populateDrugProperties() {
        const container = document.getElementById('drugProperties');
        const { descriptors } = this.currentResults.molecule;

        const drugKeys = ['lipinski_violations', 'logp', 'hbd', 'hba', 'tpsa'];
        const properties = drugKeys.map(key => ({
            label: window.molecularApp.formatDescriptorName(key),
            value: window.molecularApp.formatNumber(descriptors[key]),
            color: window.molecularApp.getDescriptorColor(key, descriptors[key])
        }));

        container.innerHTML = properties.map(prop => `
            <div class="property-item">
                <span class="property-name">${prop.label}</span>
                <span class="property-value ${prop.color}">${prop.value}</span>
            </div>
        `).join('');
    }

    populateAllDescriptors() {
        const container = document.getElementById('allDescriptors');
        const { descriptors } = this.currentResults.molecule;

        container.innerHTML = Object.entries(descriptors).map(([key, value]) => `
            <div class="descriptor-item">
                <span class="descriptor-label">${window.molecularApp.formatDescriptorName(key)}</span>
                <span class="descriptor-value ${window.molecularApp.getDescriptorColor(key, value)}">
                    ${window.molecularApp.formatNumber(value)}
                </span>
            </div>
        `).join('');
    }

    populateStructureInfo() {
        const container = document.getElementById('structureDetails');
        const { conformer } = this.currentResults;
        
        if (conformer && conformer.pdb_block && !conformer.error) {
            // Calculate atom count from PDB block if not provided
            const atomCount = conformer.atom_count || (conformer.pdb_block.match(/HETATM/g) || []).length;
            const forcefield = conformer.forcefield_used || 'UFF';
            const hasCoords = conformer.has_3d_coords !== false; // default to true if not specified
            
            container.innerHTML = `
                <div class="message success">
                    <span>✓</span>
                    <div>
                        <strong>3D structure generated</strong>
                        &nbsp;·&nbsp;
                        <small>${atomCount} atoms · ${forcefield} force field · ${hasCoords ? 'optimized geometry' : 'basic structure'}</small>
                    </div>
                </div>
            `;
            
            // Load the 3D structure into the viewer
            this.load3DStructure();
        } else {
            container.innerHTML = `
                <div class="message error">
                    <span>✕</span>
                    <span>Failed to generate 3D structure: ${conformer?.error || 'Unknown error'}</span>
                </div>
            `;
            
            // Clear the 3D viewer
            if (window.molecularViewer) {
                window.molecularViewer.clear();
            }
        }
    }
    
    load3DStructure() {
        const { conformer } = this.currentResults;
        
        console.log('load3DStructure called with:', conformer);
        console.log('window.molecularViewer available:', !!window.molecularViewer);
        
        if (!conformer || !conformer.pdb_block) {
            console.log('No conformer data or PDB block available');
            return;
        }
        
        // Wait for molecular viewer to be available
        const tryLoadMolecule = () => {
            if (window.molecularViewer) {
                // Prepare molecule info for the viewer
                const moleculeInfo = {
                    atom_count: conformer.atom_count || (conformer.pdb_block.match(/HETATM/g) || []).length,
                    forcefield_used: conformer.forcefield_used || 'UFF',
                    has_3d_coords: conformer.has_3d_coords !== false,
                    status: conformer.status || 'success'
                };
                
                console.log('Loading molecule into 3D viewer with info:', moleculeInfo);
                console.log('PDB block length:', conformer.pdb_block.length);
                
                // Load the molecule into the 3D viewer
                window.molecularViewer.loadMolecule(conformer.pdb_block, moleculeInfo);
            } else {
                console.log('Molecular viewer not ready, retrying in 100ms...');
                setTimeout(tryLoadMolecule, 100);
            }
        };
        
        tryLoadMolecule();
    }

    // ---- ADMET categorization ---------------------------------------
    categorizeAdmet(propName) {
        // Strip drugbank-percentile suffix so percentile rows share their parent's category.
        const base = String(propName).replace(/_drugbank_approved_percentile$/i, '');

        // Property pattern → category. Order matters: more specific first.
        const buckets = [
            ['toxicity',     /(hERG|AMES|DILI|LD50|Carcinogen|ClinTox|^Tox\d|Skin_?Reaction|Mutagen|alert|^NR[-_]|^SR[-_])/i],
            ['metabolism',   /(CYP|metabol)/i],
            ['excretion',    /(Half_Life|Clearance|excret)/i],
            ['distribution', /(BBB|PPBR|VDss|distribution|plasma)/i],
            ['absorption',   /(HIA|Pgp|Bioavailab|Caco2|Lipophilic|absorption|permeab|PAMPA|solubil|Hydration|Aqueous)/i],
            ['physico',      /(molecular_weight|logP|TPSA|tpsa|hydrogen_bond|rotatable_bonds|stereo_centers|Lipinski|^QED$|fraction_csp3|num_rings|num_atoms|num_heavy_atoms|molar_refract|hba|hbd)/i],
        ];
        const labels = {
            physico: 'Physico', absorption: 'Absorption', distribution: 'Distribution',
            metabolism: 'Metabolism', excretion: 'Excretion', toxicity: 'Toxicity', other: 'Other',
        };
        for (const [id, rx] of buckets) {
            if (rx.test(base)) return { id, label: labels[id] };
        }
        return { id: 'other', label: 'Other' };
    }

    valueColor(pred) {
        // Probability-style values (0..1, prob unit)
        const v = pred.value;
        if (typeof v !== 'number') return '';
        const cat = this.categorizeAdmet(pred.property).id;
        const isProb = (pred.unit === 'prob' || (v >= 0 && v <= 1 && /prob|probability|Score|Inhibit|Substrate|Carcinogen|Tox|Pgp|HIA|BBB|hERG|AMES|DILI/i.test(pred.property)));

        if (isProb) {
            // For toxicity-related, low = good
            if (cat === 'toxicity') return v <= 0.3 ? 'good' : v <= 0.6 ? 'warning' : 'bad';
            // For absorption / desirable, high = good
            return v >= 0.7 ? 'good' : v >= 0.4 ? 'warning' : 'bad';
        }
        return '';
    }

    formatPropName(name) {
        return String(name)
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    populateAdmetResults() {
        const card  = document.getElementById('admetResults');
        const tbody = document.querySelector('#admetTable tbody');
        const empty = document.getElementById('admetEmpty');
        const count = document.getElementById('admetCount');
        const chips = document.getElementById('admetChips');
        const filterInput = document.getElementById('admetFilter');
        const { analysis } = this.currentResults;
        const admet = (analysis && analysis.admet) || [];

        if (!admet.length) {
            card.style.display = 'none';
            return;
        }
        card.style.display = '';

        // Decorate each row with category info
        const rows = admet.map(p => ({
            ...p,
            _cat: this.categorizeAdmet(p.property),
            _color: this.valueColor(p),
            _label: this.formatPropName(p.property),
        }));

        // Per-category counts
        const cats = new Map();
        rows.forEach(r => cats.set(r._cat.id, (cats.get(r._cat.id) || 0) + 1));
        const catOrder = ['physico','absorption','distribution','metabolism','excretion','toxicity','other'];
        const labelMap = {
            physico:'Physico', absorption:'Absorption', distribution:'Distribution',
            metabolism:'Metabolism', excretion:'Excretion', toxicity:'Toxicity', other:'Other',
        };
        chips.innerHTML = [
            `<button class="admet-chip active" data-cat="all">All <span class="admet-chip-count">${rows.length}</span></button>`,
            ...catOrder
                .filter(c => cats.has(c))
                .map(c => `<button class="admet-chip" data-cat="${c}">${labelMap[c]} <span class="admet-chip-count">${cats.get(c)}</span></button>`)
        ].join('');

        count.textContent = `${rows.length} properties`;

        // State
        let activeCat = 'all';
        let activeFilter = '';
        let sortKey = null;
        let sortDir = 1;

        const render = () => {
            let view = rows.filter(r => {
                if (activeCat !== 'all' && r._cat.id !== activeCat) return false;
                if (activeFilter) {
                    const hay = `${r.property} ${r._label} ${r.description || ''}`.toLowerCase();
                    if (!hay.includes(activeFilter)) return false;
                }
                return true;
            });

            if (sortKey) {
                view = [...view].sort((a, b) => {
                    let va, vb;
                    if (sortKey === 'category')      { va = a._cat.label; vb = b._cat.label; }
                    else if (sortKey === 'property') { va = a._label;     vb = b._label;     }
                    else if (sortKey === 'value')    { va = a.value;      vb = b.value;      }
                    else if (sortKey === 'probability'){ va = a.probability ?? -Infinity; vb = b.probability ?? -Infinity; }
                    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDir;
                    return String(va).localeCompare(String(vb)) * sortDir;
                });
            }

            if (!view.length) {
                tbody.innerHTML = '';
                empty.classList.remove('hidden');
                return;
            }
            empty.classList.add('hidden');

            tbody.innerHTML = view.map(r => {
                const val = typeof r.value === 'number'
                    ? (Math.abs(r.value) >= 1000 ? r.value.toExponential(2) : r.value.toFixed(3))
                    : r.value;
                const prob = (typeof r.probability === 'number') ? r.probability : null;
                const pct = prob !== null ? Math.round(Math.max(0, Math.min(1, prob)) * 100) : null;
                const confCell = (pct !== null)
                    ? `<div class="admet-conf">
                           <div class="admet-conf-bar"><span style="width:${pct}%"></span></div>
                           <span class="admet-conf-pct">${pct}%</span>
                       </div>`
                    : `<span class="admet-conf-empty">—</span>`;
                return `
                    <tr>
                        <td><span class="admet-cat ${r._cat.id}">${r._cat.label}</span></td>
                        <td>
                            <div class="admet-prop-name">${r._label}</div>
                            ${r.description ? `<div class="admet-prop-desc">${r.description}</div>` : ''}
                        </td>
                        <td class="num ${r._color}">${val}</td>
                        <td><span class="admet-unit-cell">${r.unit || ''}</span></td>
                        <td>${confCell}</td>
                    </tr>
                `;
            }).join('');
        };

        // Wire chips
        chips.querySelectorAll('.admet-chip').forEach(btn => {
            btn.onclick = () => {
                chips.querySelectorAll('.admet-chip').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeCat = btn.dataset.cat;
                render();
            };
        });

        // Wire filter
        filterInput.value = '';
        filterInput.oninput = (e) => {
            activeFilter = e.target.value.trim().toLowerCase();
            render();
        };

        // Wire column sort
        document.querySelectorAll('#admetTable th[data-sort]').forEach(th => {
            th.onclick = () => {
                const key = th.dataset.sort;
                if (sortKey === key) sortDir = -sortDir;
                else { sortKey = key; sortDir = 1; }
                document.querySelectorAll('#admetTable th').forEach(t => t.classList.remove('sort-asc','sort-desc'));
                th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
                render();
            };
        });

        render();
    }

    resetAnalysis() {
        this.currentResults = null;
        this.resetToInput();
        window.molecularApp.updateProgressSteps('input');
        window.molecularApp.clearMessages();
        
        // Clear 3D viewer
        if (window.molecularViewer) {
            window.molecularViewer.clear();
        }
        
        // Reset form
        const form = document.getElementById('analysisForm');
        if (form) {
            form.reset();
            document.getElementById('smilesInput').value = 'CCO';
            document.getElementById('charCount').textContent = '3';
        }
    }

    resetToInput() {
        this.hideAllSections();
        document.getElementById('inputSection').classList.remove('hidden');
        window.molecularApp.updateProgressSteps('input');
    }

    hideAllSections() {
        ['inputSection', 'loadingSection', 'resultsSection'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });
    }

    showError(message) {
        window.molecularApp.showMessage(message, 'error');
        this.resetToInput();
    }
}

// Initialize analysis app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.analysisApp = new AnalysisApp();
}); 