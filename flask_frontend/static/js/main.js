// Main JavaScript for PrismBB Drug (v2)
class MolecularApp {
    constructor() {
        this.backendUrl = '/api';
        this.init();
    }

    init() {
        this.setupTheme();
        this.checkBackendHealth();
        this.setupEventListeners();
        this.applyQuerySmiles();

        // Health poll every 30s
        setInterval(() => this.checkBackendHealth(), 30000);
    }

    /* ---------- Theme ---------- */
    setupTheme() {
        const toggle = document.getElementById('themeToggle');
        const icon = document.getElementById('themeIcon');
        const apply = (t) => {
            document.documentElement.setAttribute('data-theme', t);
            try { localStorage.setItem('mas-theme', t); } catch (e) {}
            if (icon) icon.textContent = t === 'dark' ? '☾' : '☀';
        };
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        apply(current);
        if (toggle) {
            toggle.addEventListener('click', () => {
                const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
                apply(next);
            });
        }
    }

    /* ---------- Query-string SMILES (deep link from examples) ---------- */
    applyQuerySmiles() {
        const params = new URLSearchParams(window.location.search);
        const s = params.get('smiles');
        if (s) {
            const input = document.getElementById('smilesInput');
            const count = document.getElementById('charCount');
            if (input) input.value = s;
            if (count) count.textContent = s.length;
            // auto-run after a tick so analysisApp has bound
            setTimeout(() => {
                if (window.analysisApp) window.analysisApp.analyzeSmiles(s);
            }, 300);
        }
    }

    /* ---------- Event listeners ---------- */
    setupEventListeners() {
        const smilesInput = document.getElementById('smilesInput');
        const charCount = document.getElementById('charCount');
        if (smilesInput && charCount) {
            smilesInput.addEventListener('input', (e) => {
                charCount.textContent = e.target.value.length;
            });
        }

        // Example cards click handlers
        document.querySelectorAll('.example-card').forEach(card => {
            // Skip <a>-style example-card on /examples page — they navigate via href
            if (card.tagName === 'A') return;
            card.addEventListener('click', () => {
                const smiles = card.dataset.smiles;
                if (smilesInput) {
                    smilesInput.value = smiles;
                    if (charCount) charCount.textContent = smiles.length;
                    if (window.analysisApp) window.analysisApp.analyzeSmiles(smiles);
                }
            });
        });
    }

    /* ---------- Health ---------- */
    async checkBackendHealth() {
        const statusIndicator = document.getElementById('backendStatus');
        if (!statusIndicator) return;
        const statusDot = statusIndicator.querySelector('.status-dot');
        const statusText = statusIndicator.querySelector('.status-text');

        try {
            const response = await fetch(`${this.backendUrl}/health`);
            const data = await response.json();
            if (response.ok) {
                statusDot.className = 'status-dot online';
                statusText.textContent = 'Backend online';
                statusIndicator.title = `Backend healthy — ${data.endpoints?.length || 0} endpoints`;
            } else {
                throw new Error('Backend returned error');
            }
        } catch (error) {
            statusDot.className = 'status-dot offline';
            statusText.textContent = 'Backend offline';
            statusIndicator.title = `Backend unavailable: ${error.message}`;
        }
    }

    /* ---------- Messages ---------- */
    showMessage(message, type = 'info') {
        const container = document.getElementById('messageContainer');
        if (!container) return;

        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
        const symbol = type === 'error' ? '✕' : type === 'success' ? '✓' : type === 'warning' ? '!' : 'i';
        messageEl.innerHTML = `
            <span aria-hidden="true">${symbol}</span>
            <span>${message}</span>
        `;
        container.appendChild(messageEl);
        setTimeout(() => messageEl.remove(), 5000);
    }

    clearMessages() {
        const container = document.getElementById('messageContainer');
        if (container) container.innerHTML = '';
    }

    /* ---------- Progress steps ---------- */
    updateProgressSteps(currentStep) {
        const steps = ['input', 'analysis', 'results'];
        const stepElements = document.querySelectorAll('.step');
        const connectors = document.querySelectorAll('.step-connector');

        stepElements.forEach((step, index) => {
            const stepName = steps[index];
            step.classList.remove('active', 'completed');
            if (stepName === currentStep) step.classList.add('active');
            else if (steps.indexOf(stepName) < steps.indexOf(currentStep)) step.classList.add('completed');
        });
        connectors.forEach((c, i) => {
            c.classList.toggle('completed', steps.indexOf(steps[i + 1]) <= steps.indexOf(currentStep));
        });
    }

    /* ---------- Formatters ---------- */
    formatDescriptorName(key) {
        const names = {
            heavy_atom_count: 'Heavy atoms',
            atom_count: 'Total atoms',
            bond_count: 'Bonds',
            ring_count: 'Rings',
            aromatic_ring_count: 'Aromatic rings',
            logp: 'LogP',
            hbd: 'H-bond donors',
            hba: 'H-bond acceptors',
            rotatable_bonds: 'Rotatable bonds',
            tpsa: 'TPSA (Å²)',
            formal_charge: 'Formal charge',
            molar_refractivity: 'Molar refractivity',
            fraction_sp3: 'Csp³ fraction',
            bertz_ct: 'Bertz CT',
            balaban_j: 'Balaban J',
            slogp: 'SLogP',
            lipinski_violations: 'Lipinski violations'
        };
        return names[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    getDescriptorColor(key, value) {
        if (typeof value !== 'number') return '';
        switch (key) {
            case 'lipinski_violations': return value === 0 ? 'good' : value <= 1 ? 'warning' : 'bad';
            case 'logp':                return value <= 5 ? 'good' : 'bad';
            case 'hbd':                 return value <= 5 ? 'good' : 'bad';
            case 'hba':                 return value <= 10 ? 'good' : 'bad';
            case 'tpsa':                return value <= 140 ? 'good' : 'warning';
            case 'rotatable_bonds':     return value <= 10 ? 'good' : 'warning';
            default: return '';
        }
    }

    formatNumber(value, decimals = 2) {
        if (typeof value !== 'number') return value;
        return Number(value.toFixed(decimals));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.molecularApp = new MolecularApp();
});
