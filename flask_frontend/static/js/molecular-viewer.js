/**
 * 3D Molecular Viewer using 3Dmol.js
 * Handles visualization of molecular structures from PDB data
 */

class MolecularViewer {
    constructor(containerId) {
        this.containerId = containerId;
        this.viewer = null;
        this.currentStyle = 'stick';
        this.isRotating = false;
        this.rotationInterval = null;
        
        this.initViewer();
        this.setupControls();
    }
    
    initViewer() {
        const element = document.getElementById(this.containerId);
        if (!element) {
            console.error(`Container ${this.containerId} not found`);
            return;
        }
        
        // Initialize 3Dmol viewer
        this.viewer = $3Dmol.createViewer(element, {
            defaultcolors: $3Dmol.rasmolElementColors
        });
        
        // Match background to current theme
        this.applyThemeBackground();
        // React to theme changes
        const obs = new MutationObserver(() => this.applyThemeBackground());
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        this.resetView();
    }
    
    applyThemeBackground() {
        if (!this.viewer) return;
        const theme = document.documentElement.getAttribute('data-theme') || 'dark';
        const bg = theme === 'dark' ? '#0b0d12' : '#f5f6fb';
        this.viewer.setBackgroundColor(bg);
        this.viewer.render();
    }

    setupControls() {
        // Rotate button
        const rotateBtn = document.getElementById('rotateBtn');
        if (rotateBtn) {
            rotateBtn.addEventListener('click', () => this.toggleRotation());
        }
        
        // Reset view button
        const resetViewBtn = document.getElementById('resetViewBtn');
        if (resetViewBtn) {
            resetViewBtn.addEventListener('click', () => this.resetView());
        }
        
        // Style button
        const styleBtn = document.getElementById('styleBtn');
        if (styleBtn) {
            styleBtn.addEventListener('click', () => this.cycleStyle());
        }
    }
    
    loadMolecule(pdbData, moleculeInfo = {}) {
        if (!this.viewer) {
            console.error('Viewer not initialized');
            return;
        }
        
        try {
            // Clear existing models
            this.viewer.removeAllModels();
            
            // Add new model from PDB data
            this.viewer.addModel(pdbData, 'pdb');
            
            // Apply default styling
            this.applyStyle(this.currentStyle);
            
            // Auto-zoom to fit molecule
            this.viewer.zoomTo();
            this.viewer.render();
            
            // Update viewer info
            this.updateViewerInfo(moleculeInfo);
            
            console.log('Molecule loaded successfully');
            
        } catch (error) {
            console.error('Error loading molecule:', error);
            this.showError('Failed to load 3D structure');
        }
    }
    
    applyStyle(styleName) {
        if (!this.viewer) return;
        
        this.viewer.removeAllSurfaces();
        
        switch (styleName) {
            case 'stick':
                this.viewer.setStyle({}, {stick: {radius: 0.2}});
                break;
                
            case 'sphere':
                this.viewer.setStyle({}, {sphere: {scale: 0.3}});
                break;
                
            case 'cartoon':
                this.viewer.setStyle({}, {cartoon: {color: 'spectrum'}});
                break;
                
            case 'surface':
                this.viewer.setStyle({}, {stick: {radius: 0.1}});
                this.viewer.addSurface($3Dmol.SAS, {opacity: 0.7, color: 'white'});
                break;
                
            default:
                this.viewer.setStyle({}, {stick: {radius: 0.2}});
        }
        
        this.viewer.render();
        this.currentStyle = styleName;
    }
    
    cycleStyle() {
        const styles = ['stick', 'sphere', 'cartoon', 'surface'];
        const currentIndex = styles.indexOf(this.currentStyle);
        const nextIndex = (currentIndex + 1) % styles.length;
        const nextStyle = styles[nextIndex];
        
        this.applyStyle(nextStyle);
        
        // Update button text
        const styleBtn = document.getElementById('styleBtn');
        if (styleBtn) {
            const styleNames = {
                'stick': '🧪 Stick',
                'sphere': '⚪ Sphere', 
                'cartoon': '🎭 Cartoon',
                'surface': '🌐 Surface'
            };
            styleBtn.innerHTML = styleNames[nextStyle] || '🎨 Style';
        }
    }
    
    toggleRotation() {
        const rotateBtn = document.getElementById('rotateBtn');
        
        if (this.isRotating) {
            // Stop rotation
            if (this.rotationInterval) {
                clearInterval(this.rotationInterval);
                this.rotationInterval = null;
            }
            this.isRotating = false;
            if (rotateBtn) rotateBtn.innerHTML = '🔄 Rotate';
        } else {
            // Start rotation
            this.isRotating = true;
            if (rotateBtn) rotateBtn.innerHTML = '⏸️ Stop';
            
            let angle = 0;
            this.rotationInterval = setInterval(() => {
                angle += 2;
                this.viewer.rotate(2, 'y');
                this.viewer.render();
            }, 50);
        }
    }
    
    resetView() {
        if (!this.viewer) return;
        
        // Stop rotation if active
        if (this.isRotating) {
            this.toggleRotation();
        }
        
        // Reset camera position
        this.viewer.setView([0, 0, 0], [0, 0, 1], [0, 1, 0]);
        this.viewer.zoomTo();
        this.viewer.render();
    }
    
    updateViewerInfo(moleculeInfo) {
        const viewerInfo = document.getElementById('viewerInfo');
        if (!viewerInfo) return;
        
        if (Object.keys(moleculeInfo).length === 0) {
            viewerInfo.innerHTML = '<p>3D structure will appear here after analysis</p>';
            viewerInfo.className = 'viewer-info';
            return;
        }
        
        // Create info items
        const infoItems = [];
        
        if (moleculeInfo.atom_count) {
            infoItems.push({
                label: 'Atom Count',
                value: moleculeInfo.atom_count
            });
        }
        
        if (moleculeInfo.forcefield_used) {
            infoItems.push({
                label: 'Force Field',
                value: moleculeInfo.forcefield_used.toUpperCase()
            });
        }
        
        if (moleculeInfo.has_3d_coords !== undefined) {
            infoItems.push({
                label: '3D Coordinates',
                value: moleculeInfo.has_3d_coords ? 'Available' : 'Generated'
            });
        }
        
        if (moleculeInfo.status) {
            infoItems.push({
                label: 'Generation Status',
                value: moleculeInfo.status === 'success' || moleculeInfo.status === 'ok' ? 'Success' : 'Failed'
            });
        }
        
        // Generate HTML
        let html = infoItems.map(item => `
            <div class="info-item">
                <div class="info-label">${item.label}</div>
                <div class="info-value">${item.value}</div>
            </div>
        `).join('');
        
        viewerInfo.innerHTML = html;
        viewerInfo.className = 'viewer-info has-structure';
    }
    
    showError(message) {
        const viewerInfo = document.getElementById('viewerInfo');
        if (viewerInfo) {
            viewerInfo.innerHTML = `<p style="color: #ef4444;">⚠️ ${message}</p>`;
            viewerInfo.className = 'viewer-info';
        }
    }
    
    clear() {
        if (this.viewer) {
            this.viewer.removeAllModels();
            this.viewer.render();
        }
        
        // Reset info
        this.updateViewerInfo({});
        
        // Stop rotation
        if (this.isRotating) {
            this.toggleRotation();
        }
    }
}

// Global viewer instance
let molecularViewer = null;

// Initialize viewer when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM ready, initializing molecular viewer...');
    if (document.getElementById('viewer3d')) {
        molecularViewer = new MolecularViewer('viewer3d');
        window.molecularViewer = molecularViewer;
        console.log('Molecular viewer initialized:', !!molecularViewer);
    } else {
        console.log('viewer3d element not found');
    }
});

// Export for use in other scripts
window.MolecularViewer = MolecularViewer; 