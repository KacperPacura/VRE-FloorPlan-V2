/**
 * Moduł do zarządzania otworami drzwiowymi i okiennymi
 * 360° Image Viewer - Openings Module
 */

class OpeningsModule {
    constructor(viewer) {
        this.viewer = viewer;
        this.openingsGroup = null;
        this.selectedOpeningPoints = [];
        this.currentOpeningType = 'door';
        this.openingColors = {
            door: 0x8B4513,    // brązowy
            window: 0x4169E1,  // niebieski
            other: 0xFFD700    // żółty
        };
        
        this.init();
    }
    
    init() {
        // Utwórz grupę dla otworów
        this.openingsGroup = new THREE.Group();
        this.viewer.scene.add(this.openingsGroup);
        
        // Dodaj otwory do struktury danych obrazów
        this.initImageDataStructure();
        
        console.log('✅ Moduł otworów zainicjalizowany');
    }
    
    /**
     * Inicjalizuje strukturę danych dla otworów w każdym obrazie
     */
    initImageDataStructure() {
        // Dodaj otwory do istniejących danych obrazów
        Object.keys(this.viewer.imageData).forEach(imageIndex => {
            if (!this.viewer.imageData[imageIndex].openings) {
                this.viewer.imageData[imageIndex].openings = [];
            }
        });
    }
    
    /**
     * Getter dla otworów aktualnego obrazu
     */
    get openings() {
        const currentData = this.viewer.getCurrentImageData();
        if (!currentData.openings) {
            currentData.openings = [];
        }
        return currentData.openings;
    }
    
    /**
     * Ustawia typ otworu do oznaczania
     */
    setOpeningType(type) {
        if (['door', 'window', 'other'].includes(type)) {
            this.currentOpeningType = type;
            console.log(`🚪 Ustawiono typ otworu: ${type}`);
        }
    }
    
    /**
     * Dodaje punkt otworu (4-punktowy system)
     */
    addOpeningPoint(position, event) {
        this.selectedOpeningPoints.push({
            position: position.clone()
        });
        
        // Wizualizacja punktu tymczasowego
        this.createTemporaryPoint(position);
        
        console.log(`📍 Dodano punkt otworu ${this.selectedOpeningPoints.length}/4`);
        
        // Połącz z poprzednim punktem linią tymczasową
        if (this.selectedOpeningPoints.length > 1) {
            this.createTemporaryLine(
                this.selectedOpeningPoints[this.selectedOpeningPoints.length - 2].position,
                position
            );
        }
        
        // Jeśli mamy 4 punkty, utwórz otwór
        if (this.selectedOpeningPoints.length === 4) {
            this.createOpening();
        } else if (this.selectedOpeningPoints.length < 4) {
            this.viewer.showMessage(`Punkt ${this.selectedOpeningPoints.length}/4 otworu ${this.currentOpeningType}`, 'info');
        }
        
        return this.selectedOpeningPoints.length;
    }
    
    /**
     * Tworzy tymczasowy punkt wizualny
     */
    createTemporaryPoint(position) {
        const geometry = new THREE.SphereGeometry(2, 8, 8);
        const material = new THREE.MeshBasicMaterial({ 
            color: this.openingColors[this.currentOpeningType],
            transparent: true,
            opacity: 0.7
        });
        
        const point = new THREE.Mesh(geometry, material);
        point.position.copy(position);
        point.userData = { type: 'tempOpeningPoint' };
        
        this.openingsGroup.add(point);
    }
    
    /**
     * Tworzy tymczasową linię między punktami
     */
    createTemporaryLine(point1, point2) {
        const geometry = new THREE.BufferGeometry().setFromPoints([point1, point2]);
        const material = new THREE.LineBasicMaterial({ 
            color: this.openingColors[this.currentOpeningType],
            transparent: true,
            opacity: 0.5,
            linewidth: 2
        });
        
        const line = new THREE.Line(geometry, material);
        line.userData = { type: 'tempOpeningLine' };
        
        this.openingsGroup.add(line);
    }
    
    /**
     * Tworzy otwór na podstawie czterech punktów
     */
    createOpening() {
        if (this.selectedOpeningPoints.length !== 4) {
            console.error('Potrzebne są dokładnie 4 punkty do utworzenia otworu');
            return;
        }
        
        // Pobierz pozycje punktów
        const points = this.selectedOpeningPoints.map(p => p.position);
        
        // Oblicz wymiary z 4 punktów
        const dimensions = this.calculateDimensionsFrom4Points(points);
        
        // Dane otworu
        const opening = {
            id: this.openings.length,
            type: this.currentOpeningType,
            points: points.map(p => ({ x: p.x, y: p.y, z: p.z })), // Zapisz jako zwykłe obiekty
            dimensions: dimensions,
            imageIndex: this.viewer.currentImageIndex,
            properties: {
                name: this.generateDefaultName(),
                material: this.getDefaultMaterial(),
                notes: ''
            }
        };
        
        // Dodaj do danych
        this.openings.push(opening);
        
        // Utwórz wizualizację
        this.createOpeningVisual(opening);
        
        // Wyczyść tymczasowe punkty i zaznaczenia
        this.clearTemporaryPoints();
        this.selectedOpeningPoints = [];
        
        console.log(`✅ Utworzono otwór ${opening.type}: ${opening.properties.name}`);
        this.viewer.showMessage(`Dodano ${opening.type}: ${opening.properties.name}`, 'success');
        
        // Aktualizuj UI
        this.updateOpeningsUI();
    }
    
    /**
     * Oblicza wymiary z 4 punktów utworzonych przez użytkownika
     */
    calculateDimensionsFrom4Points(points) {
        if (points.length !== 4) {
            return { width: 0, height: 0, area: 0 };
        }
        
        // Oblicz odległości między sąsiednimi punktami
        const distances = [];
        for (let i = 0; i < 4; i++) {
            const current = points[i];
            const next = points[(i + 1) % 4];
            const distance = current.distanceTo(next);
            distances.push(distance);
        }
        
        // Zakładamy że punkty tworzą prostokąt lub równoległobok
        // Boki przeciwległe powinny być podobne
        const side1 = distances[0]; // pierwszy bok
        const side2 = distances[1]; // drugi bok  
        const side3 = distances[2]; // trzeci bok (przeciwległy do pierwszego)
        const side4 = distances[3]; // czwarty bok (przeciwległy do drugiego)
        
        // Uśrednij przeciwległe boki
        const avgWidth = (side1 + side3) / 2;
        const avgHeight = (side2 + side4) / 2;
        
        const area = avgWidth * avgHeight;
        const perimeter = avgWidth * 2 + avgHeight * 2;
        
        console.log(`📐 Wymiary otworu z 4 punktów:`);
        console.log(`  Szerokość: ${avgWidth.toFixed(2)} (boki: ${side1.toFixed(2)}, ${side3.toFixed(2)})`);
        console.log(`  Wysokość: ${avgHeight.toFixed(2)} (boki: ${side2.toFixed(2)}, ${side4.toFixed(2)})`);
        console.log(`  Powierzchnia: ${area.toFixed(2)}`);
        
        return {
            width: avgWidth,
            height: avgHeight,
            area: area,
            perimeter: perimeter,
            sideLengths: distances
        };
    }
    
    /**
     * Oblicza standardowe wymiary dla typu otworu (stara wersja - do usunięcia)
     */
    calculateStandardDimensions(point1, point2) {
        const width = point1.distanceTo(point2);
        
        // Standardowe wysokości (w jednostkach 3D)
        const standardHeights = {
            door: width * 2.5,    // proporcja 1:2.5 dla drzwi
            window: width * 0.8,  // proporcja 1:0.8 dla okien
            other: width * 1.0    // proporcja 1:1 dla innych
        };
        
        const height = standardHeights[this.currentOpeningType] || width;
        const area = width * height;
        
        return {
            width: width,
            height: height,
            area: area
        };
    }
    
    /**
     * Tworzy 4 punkty prostokąta otworu
     */
    createRectanglePoints(point1, point2, dimensions) {
        // Wektor kierunku (poziomy)
        const direction = new THREE.Vector3().subVectors(point2, point1).normalize();
        const up = new THREE.Vector3(0, 1, 0); // kierunek w górę
        
        // Oblicz pozycje 4 rogów prostokąta
        const bottomLeft = point1.clone();
        const bottomRight = point2.clone();
        const topRight = point2.clone().add(up.clone().multiplyScalar(dimensions.height));
        const topLeft = point1.clone().add(up.clone().multiplyScalar(dimensions.height));
        
        return [bottomLeft, bottomRight, topRight, topLeft];
    }
    
    /**
     * Tworzy wizualizację otworu
     */
    createOpeningVisual(opening) {
        // Utwórz geometrię prostokąta
        const geometry = new THREE.BufferGeometry();
        const vertices = new Float32Array([
            // Pierwszy trójkąt
            opening.points[0].x, opening.points[0].y, opening.points[0].z,
            opening.points[1].x, opening.points[1].y, opening.points[1].z,
            opening.points[2].x, opening.points[2].y, opening.points[2].z,
            // Drugi trójkąt
            opening.points[0].x, opening.points[0].y, opening.points[0].z,
            opening.points[2].x, opening.points[2].y, opening.points[2].z,
            opening.points[3].x, opening.points[3].y, opening.points[3].z
        ]);
        
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();
        
        // Materiał z kolorem typu otworu
        const material = new THREE.MeshBasicMaterial({
            color: this.openingColors[opening.type],
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6,
            wireframe: false
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { 
            openingId: opening.id, 
            type: 'opening',
            openingType: opening.type 
        };
        
        this.openingsGroup.add(mesh);
        
        // Dodaj obramowanie (wireframe)
        this.createOpeningBorder(opening);
        
        // Dodaj etykietę z nazwą
        this.createOpeningLabel(opening);
    }
    
    /**
     * Tworzy obramowanie otworu
     */
    createOpeningBorder(opening) {
        const points = [
            opening.points[0], opening.points[1], 
            opening.points[2], opening.points[3], 
            opening.points[0] // zamknij prostokąt
        ];
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ 
            color: this.openingColors[opening.type],
            linewidth: 3
        });
        
        const line = new THREE.Line(geometry, material);
        line.userData = { 
            openingId: opening.id, 
            type: 'openingBorder' 
        };
        
        this.openingsGroup.add(line);
    }
    
    /**
     * Tworzy etykietę otworu
     */
    createOpeningLabel(opening) {
        // Oblicz środek otworu
        const center = new THREE.Vector3();
        opening.points.forEach(point => center.add(point));
        center.divideScalar(opening.points.length);
        
        // Stwórz tekstową etykietę (uproszczona)
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // Ustawienia tekstu
        const fontSize = 24;
        const text = opening.properties.name;
        
        context.font = `bold ${fontSize}px Arial`;
        const textWidth = context.measureText(text).width;
        
        canvas.width = textWidth + 20;
        canvas.height = fontSize + 10;
        
        // Tło etykiety
        context.fillStyle = 'rgba(0, 0, 0, 0.8)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Tekst
        context.font = `bold ${fontSize}px Arial`;
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        
        // Stwórz sprite
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        
        sprite.position.copy(center);
        sprite.scale.set(canvas.width / 10, canvas.height / 10, 1);
        sprite.userData = { 
            openingId: opening.id, 
            type: 'openingLabel' 
        };
        
        this.openingsGroup.add(sprite);
    }
    
    /**
     * Generuje domyślną nazwę otworu
     */
    generateDefaultName() {
        const typeNames = {
            door: 'Drzwi',
            window: 'Okno',
            other: 'Otwór'
        };
        
        const count = this.openings.filter(o => o.type === this.currentOpeningType).length + 1;
        return `${typeNames[this.currentOpeningType]} ${count}`;
    }
    
    /**
     * Zwraca domyślny materiał dla typu otworu
     */
    getDefaultMaterial() {
        const defaultMaterials = {
            door: 'drewno',
            window: 'PVC',
            other: 'inne'
        };
        
        return defaultMaterials[this.currentOpeningType] || 'inne';
    }
    
    /**
     * Usuwa tymczasowe punkty i linie
     */
    clearTemporaryPoints() {
        const tempObjects = this.openingsGroup.children.filter(
            child => child.userData.type === 'tempOpeningPoint' || child.userData.type === 'tempOpeningLine'
        );
        
        tempObjects.forEach(obj => {
            this.openingsGroup.remove(obj);
        });
    }
    
    /**
     * Usuwa otwór
     */
    removeOpening(openingId) {
        const currentData = this.viewer.getCurrentImageData();
        const openingIndex = currentData.openings.findIndex(o => o.id === openingId);
        
        if (openingIndex === -1) return;
        
        // Usuń z danych
        const removed = currentData.openings.splice(openingIndex, 1)[0];
        
        // Usuń wizualizację
        const toRemove = this.openingsGroup.children.filter(
            child => child.userData.openingId === openingId
        );
        
        toRemove.forEach(obj => {
            this.openingsGroup.remove(obj);
        });
        
        console.log(`🗑️ Usunięto otwór: ${removed.properties.name}`);
        this.viewer.showMessage(`Usunięto otwór: ${removed.properties.name}`, 'info');
        
        this.updateOpeningsUI();
    }
    
    /**
     * Usuwa wszystkie otwory z aktualnego obrazu
     */
    clearAllOpenings() {
        const currentData = this.viewer.getCurrentImageData();
        
        if (!currentData.openings || currentData.openings.length === 0) {
            this.viewer.showMessage('Brak otworów do usunięcia', 'warning');
            return;
        }
        
        currentData.openings = [];
        this.clearOpeningsVisualization();
        
        console.log('🧹 Wyczyszczono wszystkie otwory na aktualnym obrazie');
        this.viewer.showMessage('Usunięto wszystkie otwory z aktualnego obrazu', 'info');
        
        this.updateOpeningsUI();
    }
    
    /**
     * Czyści wizualizację otworów
     */
    clearOpeningsVisualization() {
        this.openingsGroup.clear();
    }
    
    /**
     * Przełącza wizualizację otworów dla nowego obrazu
     */
    switchToImageOpenings(imageIndex) {
        // Wyczyść aktualną wizualizację
        this.clearOpeningsVisualization();
        
        // Załaduj otwory dla nowego obrazu
        const data = this.viewer.imageData[imageIndex];
        if (data && data.openings) {
            data.openings.forEach(opening => {
                this.recreateOpeningVisual(opening);
            });
        }
        
        console.log(`🔄 Przełączono na otwory obrazu ${imageIndex}`);
    }
    
    /**
     * Odtwarza wizualizację otworu z danych
     */
    recreateOpeningVisual(opening) {
        this.createOpeningVisual(opening);
    }
    
    /**
     * Aktualizuje UI otworów
     */
    updateOpeningsUI() {
        const currentData = this.viewer.getCurrentImageData();
        const openingsCount = currentData.openings ? currentData.openings.length : 0;
        
        // Aktualizuj licznik otworów jeśli istnieje element UI
        const openingsCountElement = document.getElementById('openings-count');
        if (openingsCountElement) {
            openingsCountElement.textContent = openingsCount;
        }
        
        // Aktualizuj listę otworów
        this.updateOpeningsList();
    }
    
    /**
     * Aktualizuje listę otworów w UI
     */
    updateOpeningsList() {
        const openingsListElement = document.getElementById('openings-list');
        if (!openingsListElement) return;
        
        const currentData = this.viewer.getCurrentImageData();
        const openings = currentData.openings || [];
        
        openingsListElement.innerHTML = '';
        
        openings.forEach(opening => {
            const openingItem = document.createElement('div');
            openingItem.className = 'opening-item';
            openingItem.innerHTML = `
                <div class="opening-info">
                    <span class="opening-type ${opening.type}">${opening.properties.name}</span>
                    <span class="opening-dimensions">${opening.dimensions.width.toFixed(1)} × ${opening.dimensions.height.toFixed(1)}</span>
                </div>
                <button class="btn-remove" onclick="viewer.openingsModule.removeOpening(${opening.id})">×</button>
            `;
            
            openingsListElement.appendChild(openingItem);
        });
    }
    
    /**
     * Oblicza statystyki otworów
     */
    calculateOpeningsStats() {
        const currentData = this.viewer.getCurrentImageData();
        const openings = currentData.openings || [];
        
        const stats = {
            total: openings.length,
            doors: openings.filter(o => o.type === 'door').length,
            windows: openings.filter(o => o.type === 'window').length,
            others: openings.filter(o => o.type === 'other').length,
            totalArea: openings.reduce((sum, o) => sum + o.dimensions.area, 0)
        };
        
        return stats;
    }
    
    /**
     * Eksportuje dane otworów
     */
    exportOpeningsData() {
        const allOpeningsData = {};
        
        Object.keys(this.viewer.imageData).forEach(imageIndex => {
            const data = this.viewer.imageData[imageIndex];
            if (data.openings && data.openings.length > 0) {
                const imageInfo = this.viewer.loadedImages.find(img => img.id == imageIndex);
                
                allOpeningsData[imageIndex] = {
                    imageName: imageInfo ? imageInfo.name : `Image_${imageIndex}`,
                    openings: data.openings.map(opening => ({
                        id: opening.id,
                        type: opening.type,
                        points: opening.points.map(point => ({
                            x: point.x,
                            y: point.y,
                            z: point.z
                        })),
                        dimensions: opening.dimensions,
                        properties: opening.properties,
                        imageIndex: opening.imageIndex
                    })),
                    statistics: this.calculateOpeningsStatsForImage(data.openings)
                };
            }
        });
        
        return allOpeningsData;
    }
    
    /**
     * Oblicza statystyki otworów dla konkretnego obrazu
     */
    calculateOpeningsStatsForImage(openings) {
        return {
            total: openings.length,
            doors: openings.filter(o => o.type === 'door').length,
            windows: openings.filter(o => o.type === 'window').length,
            others: openings.filter(o => o.type === 'other').length,
            totalArea: openings.reduce((sum, o) => sum + o.dimensions.area, 0)
        };
    }
    
    /**
     * Anuluje aktualny proces dodawania otworu (alias dla cancelOpeningCreation)
     */
    cancelOpening() {
        // Wyczyść punkty tymczasowe
        this.clearTemporaryPoints();
        // Zresetuj wybrane punkty
        this.selectedOpeningPoints = [];
        
        console.log('🚫 Anulowano tworzenie otworu');
        this.viewer.showMessage('Anulowano tworzenie otworu', 'info');
    }
    
    /**
     * Sprawdza czy jesteśmy w trakcie dodawania otworu
     */
    isAddingOpening() {
        return this.selectedOpeningPoints.length > 0;
    }
    
    /**
     * Pokazuje/ukrywa otwory
     */
    toggleOpeningsVisibility(visible) {
        this.openingsGroup.visible = visible;
    }
}

// Eksportuj klasę dla użycia w głównym pliku
window.OpeningsModule = OpeningsModule;
