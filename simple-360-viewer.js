// Simple 360° Image Viewer - Uproszczona wersja
class Simple360Viewer {
    constructor() {
        console.log('🏠 Inicjalizacja Simple 360° Viewer...');
        
        // Stan aplikacji
        this.currentMode = 'view';
        this.loadedImages = [];
        this.currentImageIndex = 0;
        
        // Dane per-obraz - każdy obraz ma swoje punkty, linie i powierzchnie
        this.imageData = {}; // klucz: imageIndex, wartość: { points: [], lines: [], surfaces: [], openings: [] }
        
        this.selectedPoints = [];
        
        // Moduł otworów
        this.openingsModule = null;
        
        // Ustawienia
        this.settings = {
            showHelpers: true,
            pointSize: 3.0, // Zwiększony rozmiar punktów
            lineWidth: 2.0,
            scale: 1.0, // Skala: jednostki 3D na centymetry
            isCalibrated: false, // Czy już skalibrowano
            calibrationValue: 80 // Wartość kalibracji w cm
        };
        
        // Three.js obiekty
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.sphere = null;
        this.controls = null;
        
        // Obiekty wizualne
        this.pointsGroup = null;
        this.linesGroup = null;
        this.surfacesGroup = null;
        this.helpersGroup = null;
        
        // Stan interakcji
        this.isMouseDown = false;
        this.mouseDownPosition = { x: 0, y: 0 };
        this.raycaster = null;

        // ********* MOJE OPENCV ***********

        this._cvReady = false;
        this._cvCanvas = document.createElement('canvas');
        this._cvCanvasCtx = this._cvCanvas.getContext('2d');

        // Poczekaj na OpenCV.js – opencv.js wywołuje tę funkcję globalnie
        const self = this;
        window.cv = window.cv || {};
        window.Module = window.Module || {};
        window.Module['onRuntimeInitialized'] = function() {
            self._cvReady = true;
            console.log('✅ OpenCV.js gotowe');

        // ********* KONIEC MOJEGO OPENCV ************

        }

        this.init();
    }

    init() {
        this.setupScene();
        this.setupEventListeners();
        this.updateUI();
        
        // Inicjalizuj moduł otworów
        this.initOpeningsModule();
        
        console.log('✅ Simple 360° Viewer zainicjalizowany');
        this.showMessage('Aplikacja gotowa do użycia', 'success');
    }
    
    /**
     * Inicjalizuje moduł otworów
     */
    initOpeningsModule() {
        if (window.OpeningsModule) {
            this.openingsModule = new OpeningsModule(this);
        } else {
            console.warn('⚠️ Moduł otworów nie został załadowany');
        }
    }
    
    setupScene() {
        console.log('🎬 Konfiguracja sceny Three.js...');
        
        // Scena
        this.scene = new THREE.Scene();
        
        // Kamera
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 0, 0);
        
        // Renderer
        const canvas = document.getElementById('viewer-canvas');
        this.renderer = new THREE.WebGLRenderer({ 
            canvas: canvas,
            antialias: true
        });
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // Raycaster do wykrywania kliknięć
        this.raycaster = new THREE.Raycaster();
        
        // Grupy obiektów
        this.pointsGroup = new THREE.Group();
        this.linesGroup = new THREE.Group();
        this.surfacesGroup = new THREE.Group();
        this.helpersGroup = new THREE.Group();
        this.dimensionsGroup = new THREE.Group();
        
        this.scene.add(this.pointsGroup);
        this.scene.add(this.linesGroup);
        this.scene.add(this.surfacesGroup);
        this.scene.add(this.helpersGroup);
        this.scene.add(this.dimensionsGroup);
        
        // Sfera dla obrazu 360°
        this.createSphere();
        
        // Proste sterowanie kamerą
        this.setupCameraControls();
        
        // Start render loop
        this.animate();
        
        console.log('✅ Scena Three.js skonfigurowana');
    }
    
    createSphere() {
        const geometry = new THREE.SphereGeometry(500, 64, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff, // Białe tło zamiast ciemnego
            wireframe: false,
            side: THREE.BackSide
        });
        
        this.sphere = new THREE.Mesh(geometry, material);
        this.scene.add(this.sphere);
    }
    
    setupCameraControls() {
        const canvas = this.renderer.domElement;
        
        let isMouseDown = false;
        let mouseDownPosition = { x: 0, y: 0 };
        let isDraggingPoint = false;
        let draggedPoint = null;
        let hasMoved = false; // Śledzenie czy mysz się poruszyła
        
        // Zmienne do kontroli rotacji kamery - proste podejście bez sferycznych współrzędnych
        let lastMouseX = 0;
        let lastMouseY = 0;
        
        canvas.addEventListener('mousedown', (event) => {
            const rect = canvas.getBoundingClientRect();
            const mouse = new THREE.Vector2(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1
            );
            
            this.raycaster.setFromCamera(mouse, this.camera);
            
            // Sprawdź czy kliknięto w punkt (we wszystkich trybach)
            const intersects = this.raycaster.intersectObjects(this.pointsGroup.children);
            
            if (intersects.length > 0 && event.button === 0) {
                const clickedPoint = intersects[0].object;
                const pointId = clickedPoint.userData.pointId;
                
                // Możliwość przeciągania punktów we wszystkich trybach
                isDraggingPoint = true;
                draggedPoint = { mesh: clickedPoint, pointId: pointId };
                canvas.style.cursor = 'move';
                return;
            }
            
            if (event.button === 0) {
                // Zawsze rozpocznij sterowanie kamerą (we wszystkich trybach)
                isMouseDown = true;
                hasMoved = false; // Reset flagi ruchu
                mouseDownPosition = { x: event.clientX, y: event.clientY };
                lastMouseX = event.clientX;
                lastMouseY = event.clientY;
                canvas.classList.add('grabbing');
                canvas.classList.remove('grab', 'crosshair');
            }
        });
        
        canvas.addEventListener('mousemove', (event) => {
            if (isDraggingPoint && draggedPoint) {
                // Przeciąganie punktu
                const rect = canvas.getBoundingClientRect();
                const mouse = new THREE.Vector2(
                    ((event.clientX - rect.left) / rect.width) * 2 - 1,
                    -((event.clientY - rect.top) / rect.height) * 2 + 1
                );
                
                this.raycaster.setFromCamera(mouse, this.camera);
                const intersects = this.raycaster.intersectObject(this.sphere);
                
                if (intersects.length > 0) {
                    const newPosition = intersects[0].point;
                    draggedPoint.mesh.position.copy(newPosition);
                    
                    // Aktualizuj dane punktu
                    const currentData = this.getCurrentImageData();
                    const pointData = currentData.points.find(p => p.id === draggedPoint.pointId);
                    if (pointData) {
                        pointData.position.copy(newPosition);
                    }
                    
                    // Aktualizuj pozycję etykiety punktu (otoczki)
                    this.updatePointLabel(draggedPoint.pointId, newPosition);
                    
                    // Aktualizuj połączone linie
                    this.updateConnectedLines(draggedPoint.pointId);
                }
                return;
            }
            
            if (isMouseDown) {
                // Sprawdź czy mysz się poruszyła znacząco
                const deltaX = event.clientX - mouseDownPosition.x;
                const deltaY = event.clientY - mouseDownPosition.y;
                const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                
                if (distance > 5) { // 5 pikseli tolerancji
                    hasMoved = true;
                }
                
                // Sterowanie kamerą tylko jeśli już się poruszamy
                if (hasMoved) {
                    // Proste sterowanie kamerą - obracanie względem aktualnej pozycji
                    const mouseDeltaX = event.clientX - lastMouseX;
                    const mouseDeltaY = event.clientY - lastMouseY;
                    
                    // Pobierz aktualną rotację kamery
                    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
                    
                    // Zastosuj zmiany rotacji - odwrócone kierunki dla naturalnego sterowania
                    euler.y += mouseDeltaX * 0.005; // Odwrócone sterowanie poziome
                    euler.x += mouseDeltaY * 0.005; // Odwrócone sterowanie pionowe
                    
                    // Ograniczenia obrotu pionowego
                    euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
                    
                    // Zastosuj nową rotację
                    this.camera.quaternion.setFromEuler(euler);
                }
                
                lastMouseX = event.clientX;
                lastMouseY = event.clientY;
            }
            
            // Aktualizuj pozycję kursora
            this.updateCursorPosition(event);
        });
        
        canvas.addEventListener('mouseup', (e) => {
            const wasMouseDown = isMouseDown;
            const wasDraggingPoint = isDraggingPoint;
            const wasHasMoved = hasMoved;
            
            isMouseDown = false;
            isDraggingPoint = false;
            draggedPoint = null;
            hasMoved = false;
            canvas.classList.remove('grabbing');
            
            // Przywróć odpowiedni kursor
            if (this.currentMode === 'view') {
                canvas.classList.add('grab');
            } else if (['point', 'calibrate', 'door', 'window', 'opening'].includes(this.currentMode)) {
                canvas.classList.add('crosshair');
            }
            
            canvas.style.cursor = '';
            
            // Dodaj punkt tylko jeśli:
            // 1. Jesteśmy w trybie point, calibrate lub otwory
            // 2. Nie przeciągaliśmy kamery ani punktów
            // 3. To było krótkie kliknięcie (nie przeciąganie)
            if (['point', 'calibrate', 'door', 'window', 'opening'].includes(this.currentMode) && wasMouseDown && !wasDraggingPoint && !wasHasMoved) {
                this.handleClick(e);
            }
        });
        
        // Zoom za pomocą kółka myszy
        canvas.addEventListener('wheel', (event) => {
            event.preventDefault();
            
            const fov = this.camera.fov + event.deltaY * 0.05;
            this.camera.fov = Math.max(10, Math.min(100, fov));
            this.camera.updateProjectionMatrix();
        });
    }
    
    setupEventListeners() {
        console.log('🔧 Konfiguracja event listeners...');
        
        // Ładowanie zdjęć
        document.getElementById('image-input').addEventListener('change', (e) => {
            this.loadImages(e.target.files);
        });
        
        document.getElementById('load-images').addEventListener('click', () => {
            document.getElementById('image-input').click();
        });
        
        // Tryby pracy
        document.getElementById('mode-view').addEventListener('click', () => this.setMode('view'));
        document.getElementById('mode-point').addEventListener('click', () => this.setMode('point'));
        document.getElementById('mode-calibrate').addEventListener('click', () => this.setMode('calibrate'));
        
        // Nowe tryby - otwory
        document.getElementById('mode-door').addEventListener('click', () => this.setMode('door'));
        document.getElementById('mode-window').addEventListener('click', () => this.setMode('window'));
        document.getElementById('mode-opening').addEventListener('click', () => this.setMode('opening'));
        
        // Kalibracja
        document.getElementById('calibration-done').addEventListener('click', () => this.finishCalibration());
        document.getElementById('calibration-cancel').addEventListener('click', () => this.cancelCalibration());
        
        // Synchronizuj wartość kalibracji z ustawieniami
        document.getElementById('calibration-value').addEventListener('input', (e) => {
            this.settings.calibrationValue = parseFloat(e.target.value) || 80;
            this.updateCalibrationDimensionPreview();
        });
        
        // Akcje
        document.getElementById('clear-points').addEventListener('click', () => this.clearPoints());
        document.getElementById('clear-lines').addEventListener('click', () => this.clearLines());
        document.getElementById('copy-surface').addEventListener('click', () => this.copySurfaceToBottom());
        document.getElementById('export-data').addEventListener('click', () => this.exportData());
        
        // Dodane eksporty rzutów
        document.getElementById('generate-room-plan').addEventListener('click', () => this.generateRoomPlanImage());
        document.getElementById('auto-detect-room').addEventListener('click', () => this.autoDetectRoomLayout());
        
        // Akcje otworów
        document.getElementById('clear-openings').addEventListener('click', () => this.clearOpenings());
        document.getElementById('cancel-opening').addEventListener('click', () => this.cancelOpening());
        
        // Ustawienia
        document.getElementById('show-helpers').addEventListener('change', (e) => {
            this.settings.showHelpers = e.target.checked;
            this.updateHelpers();
        });
        
        document.getElementById('point-size').addEventListener('input', (e) => {
            this.settings.pointSize = parseFloat(e.target.value);
            document.getElementById('point-size-value').textContent = this.settings.pointSize.toFixed(1);
            this.updatePointsSize();
        });
        
        document.getElementById('line-width').addEventListener('input', (e) => {
            this.settings.lineWidth = parseFloat(e.target.value);
            document.getElementById('line-width-value').textContent = this.settings.lineWidth.toFixed(1);
            this.updateLinesWidth();
        });
        
        // Resize
        window.addEventListener('resize', () => this.onWindowResize());
        
        console.log('✅ Event listeners skonfigurowane');
    }
    
    loadImages(files = []) {
        if (!files || files.length === 0) {
            this.showMessage('Nie wybrano żadnych plików', 'warning');
            return;
        }
        
        console.log(`📸 Ładowanie ${files.length} zdjęć...`);
        this.showMessage(`Ładowanie ${files.length} zdjęć...`, 'info');
        
        this.loadedImages = [];
        const imageList = document.getElementById('image-list');
        imageList.innerHTML = '';
        
        Array.from(files).forEach((file, index) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const imageData = {
                    id: index,
                    name: file.name,
                    url: e.target.result,
                    texture: null
                };
                
                this.loadedImages.push(imageData);
                this.addImageToList(imageData);
                
                // Jeśli to pierwsze zdjęcie, załaduj je
                if (index === 0) {
                    this.loadImageTexture(imageData);
                }
                
                console.log(`✅ Załadowano zdjęcie: ${file.name}`);
            };
            
            reader.readAsDataURL(file);
        });
        
        this.showMessage('Zdjęcia zostały załadowane', 'success');
    }
    
    addImageToList(imageData) {
        const imageList = document.getElementById('image-list');
        const imageItem = document.createElement('div');
        imageItem.className = 'image-item';
        imageItem.innerHTML = `
            <div class="image-index">${imageData.id + 1}</div>
            <div class="image-name">${imageData.name}</div>
        `;
        
        imageItem.addEventListener('click', () => {
            this.selectImage(imageData.id); // Użyj imageData.id zamiast indeksu w tablicy
        });
        
        imageList.appendChild(imageItem);
    }
    
    selectImage(index) {
        if (index < 0 || index >= this.loadedImages.length) return;
        
        this.currentImageIndex = index;
        const imageData = this.loadedImages.find(img => img.id === index);
        
        if (!imageData) {
            console.error(`Nie znaleziono obrazu o indeksie ${index}`);
            return;
        }
        
        // Aktualizuj UI - znajdź pozycję w tablicy loadedImages
        const arrayIndex = this.loadedImages.findIndex(img => img.id === index);
        document.querySelectorAll('.image-item').forEach((item, i) => {
            item.classList.toggle('active', i === arrayIndex);
        });
        
        // Załaduj teksturę
        this.loadImageTexture(imageData);
        
        // Przełącz dane na aktualny obraz
        this.switchToImageData(index);
        
        // Przełącz dane otworów
        if (this.openingsModule) {
            this.openingsModule.switchToImageOpenings(index);
        }
        
        // Aktualizuj UI
        this.updateUI();
        
        console.log(`🖼️ Wybrano zdjęcie: ${imageData.name} (ID: ${imageData.id})`);
        this.showMessage(`Załadowano: ${imageData.name}`, 'info');
    }
    
    loadImageTexture(imageData) {
        if (imageData.texture) {
            // Tekstura już załadowana
            this.sphere.material.map = imageData.texture;
            this.sphere.material.needsUpdate = true;
            return;
        }
        
        // Załaduj nową teksturę
        const loader = new THREE.TextureLoader();
        loader.load(imageData.url, (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.repeat.x = -1; // Odbicie lustrzane dla prawidłowej orientacji
            
            imageData.texture = texture;
            this.sphere.material.map = texture;
            this.sphere.material.needsUpdate = true;
            
            console.log(`🎨 Tekstura załadowana: ${imageData.name}`);
        });
    }
    
    setMode(mode) {
        console.log(`🔧 Zmiana trybu na: ${mode}`);
        this.currentMode = mode;
        
        // Wyczyść zaznaczenia
        this.selectedPoints = [];
        
        // Aktualizuj UI
        document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`mode-${mode}`).classList.add('active');
        
        // Pokaż/ukryj panel kalibracji
        const calibrationPanel = document.getElementById('calibration-panel');
        if (mode === 'calibrate') {
            calibrationPanel.style.display = 'block';
            this.updateCalibrationStatus();
        } else {
            calibrationPanel.style.display = 'none';
        }
        
        // Aktualizuj opis
        const descriptions = {
            view: 'Tryb podglądu - obracaj kamerą, przeciągnij punkty aby je edytować',
            point: 'Tryb punktów - kliknij aby dodać punkt, przeciągnij aby edytować (auto-łączenie)',
            calibrate: 'Tryb kalibracji - dodaj 2 punkty na obiekcie o znanej długości',
            door: 'Tryb drzwi - kliknij 4 punkty aby oznaczyć narożniki drzwi',
            window: 'Tryb okien - kliknij 4 punkty aby oznaczyć narożniki okna',
            opening: 'Tryb otworów - kliknij 4 punkty aby oznaczyć narożniki otworu'
        };
        
        document.getElementById('mode-desc').textContent = descriptions[mode];
        
        // Aktualizuj kursor
        const canvas = this.renderer.domElement;
        canvas.classList.remove('grab', 'grabbing', 'crosshair');
        
        if (mode === 'view') {
            canvas.classList.add('grab');
        } else if (mode === 'point') {
            canvas.classList.add('crosshair');
        } else if (mode === 'calibrate') {
            canvas.classList.add('crosshair');
        } else if (['door', 'window', 'opening'].includes(mode)) {
            canvas.classList.add('crosshair');
            // Ustaw typ otworu w module otworów
            if (this.openingsModule) {
                const openingType = mode === 'opening' ? 'other' : mode;
                this.openingsModule.setOpeningType(openingType);
            }
        }
        
        this.updateUI();
    }
    
    handleClick(event) {
        if (this.currentMode === 'view') return;
        
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        
        this.raycaster.setFromCamera(mouse, this.camera);
        
        if (this.currentMode === 'point') {
            this.addPoint(mouse, event);
        } else if (this.currentMode === 'calibrate') {
            this.addCalibrationPoint(mouse, event);
        } else if (['door', 'window', 'opening'].includes(this.currentMode)) {
            this.addOpeningPoint(mouse, event);
        }
    }
    
    addPoint(mouseCoords, event) {
        const intersects = this.raycaster.intersectObject(this.sphere);
        
        if (intersects.length > 0) {
            const intersection = intersects[0];
            const currentData = this.getCurrentImageData();
            
            // Jeśli mamy więcej niż 2 punkty, sprawdź czy zamknąć bryłę PRZED dodaniem punktu
            if (currentData.points.length > 2) {
                const firstPoint = currentData.points[0];
                const distance = intersection.point.distanceTo(firstPoint.position);
                
                // Jeśli jesteśmy blisko pierwszego punktu (próg 50 jednostek), zamknij bryłę
                if (distance < 50) {
                    // Połącz ostatni punkt z pierwszym
                    const lastPoint = currentData.points[currentData.points.length - 1];
                    this.createAutoConnection(lastPoint.id, firstPoint.id);
                    this.createSurfaceFromPoints();
                    console.log('🔗 Zamknięto bryłę i utworzono powierzchnię');
                    this.showMessage('Bryła zamknięta! Utworzono powierzchnię.', 'success');
                    return; // Zakończ bez dodawania nowego punktu
                }
            }
            
            const point = {
                id: currentData.points.length,
                position: intersection.point.clone(),
                screenPosition: mouseCoords.clone(),
                imageIndex: this.currentImageIndex,
                connections: [] // Lista połączeń z innymi punktami
            };
            
            currentData.points.push(point);
            this.createPointVisual(point);
            
            // Automatyczne łączenie z poprzednim punktem
            if (currentData.points.length > 1) {
                const prevPoint = currentData.points[currentData.points.length - 2];
                this.createAutoConnection(prevPoint.id, point.id);
            }
            
            console.log(`📍 Dodano punkt ${point.id} na pozycji:`, point.position);
            this.showMessage(`Dodano punkt ${point.id + 1}`, 'success');
            
            this.updateUI();
        }
    }
    
    createPointVisual(point) {
        const geometry = new THREE.SphereGeometry(this.settings.pointSize, 8, 8);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x4CAF50,
            transparent: true,
            opacity: 0.8
        });
        
        const pointMesh = new THREE.Mesh(geometry, material);
        pointMesh.position.copy(point.position);
        pointMesh.userData = { pointId: point.id };
        
        this.pointsGroup.add(pointMesh);
        
        // Dodaj numer punktu
        if (this.settings.showHelpers) {
            this.createPointLabel(point);
        }
    }
    
    createPointLabel(point) {
        // Uproszczona etykieta - można rozszerzyć w przyszłości
        const geometry = new THREE.RingGeometry(this.settings.pointSize * 1.5, this.settings.pointSize * 2, 8);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xffffff,
            transparent: true,
            opacity: 0.5
        });
        
        const ring = new THREE.Mesh(geometry, material);
        ring.position.copy(point.position);
        ring.lookAt(this.camera.position);
        ring.userData = { pointId: point.id, type: 'pointLabel' }; // Dodaj identyfikator
        
        this.helpersGroup.add(ring);
    }
    
    updatePointLabel(pointId, newPosition) {
        // Znajdź etykietę dla tego punktu w helpersGroup
        const label = this.helpersGroup.children.find(child => 
            child.userData && child.userData.pointId === pointId && child.userData.type === 'pointLabel'
        );
        
        if (label) {
            label.position.copy(newPosition);
            label.lookAt(this.camera.position);
        }
    }
    
    createAutoConnection(pointId1, pointId2) {
        const currentData = this.getCurrentImageData();
        const point1 = currentData.points.find(p => p.id === pointId1);
        const point2 = currentData.points.find(p => p.id === pointId2);
        
        if (!point1 || !point2) return;
        
        // Dodaj połączenie do obu punktów
        point1.connections.push(pointId2);
        point2.connections.push(pointId1);
        
        const line = {
            id: currentData.lines.length,
            pointId1: pointId1,
            pointId2: pointId2,
            point1: point1.position.clone(),
            point2: point2.position.clone(),
            imageIndex: this.currentImageIndex
        };
        
        currentData.lines.push(line);
        this.createLineVisual(line);
        
        console.log(`🔗 Automatycznie połączono punkty ${pointId1} i ${pointId2}`);
        
        this.updateUI();
    }
    
    createLineVisual(line) {
        const geometry = new THREE.BufferGeometry().setFromPoints([
            line.point1,
            line.point2
        ]);
        
        const material = new THREE.LineBasicMaterial({ 
            color: 0x2196F3,
            linewidth: this.settings.lineWidth
        });
        
        const lineMesh = new THREE.Line(geometry, material);
        lineMesh.userData = { lineId: line.id };
        
        this.linesGroup.add(lineMesh);
        
        // Dodaj wymiar linii
        this.createLineDimension(line);
    }
    
    updateConnectedLines(pointId) {
        const currentData = this.getCurrentImageData();
        const point = currentData.points.find(p => p.id === pointId);
        if (!point) return;
        
        // Znajdź wszystkie linie połączone z tym punktem
        currentData.lines.forEach(line => {
            if (line.pointId1 === pointId || line.pointId2 === pointId) {
                // Aktualizuj pozycje punktów w linii
                const point1 = currentData.points.find(p => p.id === line.pointId1);
                const point2 = currentData.points.find(p => p.id === line.pointId2);
                
                if (point1 && point2) {
                    line.point1.copy(point1.position);
                    line.point2.copy(point2.position);
                    
                    // Znajdź i zaktualizuj wizualną linię
                    const lineMesh = this.linesGroup.children.find(child => 
                        child.userData.lineId === line.id
                    );
                    
                    if (lineMesh) {
                        const positions = lineMesh.geometry.attributes.position.array;
                        positions[0] = point1.position.x;
                        positions[1] = point1.position.y;
                        positions[2] = point1.position.z;
                        positions[3] = point2.position.x;
                        positions[4] = point2.position.y;
                        positions[5] = point2.position.z;
                        lineMesh.geometry.attributes.position.needsUpdate = true;
                        
                        // Aktualizuj wymiar linii
                        this.updateLineDimension(line.id, point1.position, point2.position);
                    }
                }
            }
        });
        
        // Aktualizuj powierzchnie jeśli istnieją
        this.updateSurfaces();
    }
    
    clearPoints() {
        const currentData = this.getCurrentImageData();
        if (currentData.points.length === 0) {
            this.showMessage('Brak punktów do usunięcia', 'warning');
            return;
        }
        
        // Wyczyść dane aktualnego obrazu
        currentData.points = [];
        currentData.lines = [];
        currentData.surfaces = [];
        this.selectedPoints = [];
        
        // Wyczyść wizualizację
        this.clearVisualization();
        
        console.log('🧹 Wyczyszczono wszystkie punkty, linie i powierzchnie na aktualnym obrazie');
        this.showMessage('Usunięto wszystkie punkty, linie i powierzchnie z aktualnego obrazu', 'info');
        
        this.updateUI();
    }
    
    clearLines() {
        const currentData = this.getCurrentImageData();
        if (currentData.lines.length === 0) {
            this.showMessage('Brak linii do usunięcia', 'warning');
            return;
        }
        
        currentData.lines = [];
        this.linesGroup.clear();
        this.dimensionsGroup.clear(); // Wyczyść wymiary linii
        
        console.log('🧹 Wyczyszczono wszystkie linie na aktualnym obrazie');
        this.showMessage('Usunięto wszystkie linie z aktualnego obrazu', 'info');
        
        this.updateUI();
    }
    
    // ===== FUNKCJE OTWORÓW (delegowanie do modułu) =====
    
    /**
     * Dodaje punkt otworu - deleguje do modułu otworów
     */
    addOpeningPoint(mouseCoords, event) {
        if (this.openingsModule) {
            // Użyj raycastera aby znaleźć punkt przecięcia z kulą
            const intersects = this.raycaster.intersectObject(this.sphere);
            
            if (intersects.length > 0) {
                const intersection3D = intersects[0].point;
                return this.openingsModule.addOpeningPoint(intersection3D, event);
            } else {
                console.warn('⚠️ Brak przecięcia z kulą');
                this.showMessage('Nie można dodać punktu - brak przecięcia z obrazem', 'warning');
            }
        } else {
            console.warn('⚠️ Moduł otworów nie jest dostępny');
            this.showMessage('Moduł otworów nie jest załadowany', 'error');
        }
    }
    
    /**
     * Czyści wszystkie otwory - deleguje do modułu otworów
     */
    clearOpenings() {
        if (this.openingsModule) {
            this.openingsModule.clearAllOpenings(); // Zmiana nazwy z clearOpenings na clearAllOpenings
            this.showMessage('Usunięto wszystkie otwory z aktualnego obrazu', 'info');
        } else {
            console.warn('⚠️ Moduł otworów nie jest dostępny');
            this.showMessage('Moduł otworów nie jest załadowany', 'error');
        }
    }
    
    /**
     * Anuluje bieżący otwór - deleguje do modułu otworów
     */
    cancelOpening() {
        if (this.openingsModule) {
            this.openingsModule.cancelOpening();
        } else {
            console.warn('⚠️ Moduł otworów nie jest dostępny');
        }
    }
    
    /**
     * Aktualizuje UI otworów - deleguje do modułu otworów
     */
    updateOpeningsUI() {
        if (this.openingsModule) {
            this.openingsModule.updateOpeningsUI();
        }
    }
    
    updatePointsSize() {
        this.pointsGroup.children.forEach(pointMesh => {
            pointMesh.scale.setScalar(this.settings.pointSize);
        });
    }
    
    updateLinesWidth() {
        this.linesGroup.children.forEach(lineMesh => {
            lineMesh.material.linewidth = this.settings.lineWidth;
        });
    }
    
    updateHelpers() {
        this.helpersGroup.visible = this.settings.showHelpers;
    }
    
    updateCursorPosition(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        document.getElementById('cursor-position').textContent = `${x.toFixed(2)}, ${y.toFixed(2)}`;
    }
    
    updateUI() {
        const currentData = this.getCurrentImageData();
        
        // Aktualizuj liczniki
        document.getElementById('point-count').textContent = currentData.points.length;
        document.getElementById('line-count').textContent = currentData.lines.length;
        
        // Aktualizuj suwaki
        document.getElementById('point-size-value').textContent = this.settings.pointSize.toFixed(1);
        document.getElementById('line-width-value').textContent = this.settings.lineWidth.toFixed(1);
        
        // Dodaj informację o aktualnym obrazie i statystyki
        const currentImage = this.loadedImages.find(img => img.id === this.currentImageIndex);
        const imageName = currentImage ? currentImage.name : 'Brak obrazu';
        
        // Oblicz statystyki wszystkich obrazów
        const totalStats = Object.values(this.imageData).reduce((acc, data) => ({
            points: acc.points + data.points.length,
            lines: acc.lines + data.lines.length,
            surfaces: acc.surfaces + data.surfaces.length
        }), { points: 0, lines: 0, surfaces: 0 });
        
        console.log(`📊 UI Update - Obraz: ${imageName} | Punkty: ${currentData.points.length} | Linie: ${currentData.lines.length} | Powierzchnie: ${currentData.surfaces.length}`);
        console.log(`📊 Łącznie - Punkty: ${totalStats.points} | Linie: ${totalStats.lines} | Powierzchnie: ${totalStats.surfaces}`);
    }
    
    exportData() {
        // Przygotuj dane dla każdego obrazu
        const imageDataExport = {};
        
        Object.keys(this.imageData).forEach(imageIndex => {
            const data = this.imageData[imageIndex];
            const imageInfo = this.loadedImages.find(img => img.id == imageIndex);
            
            imageDataExport[imageIndex] = {
                imageName: imageInfo ? imageInfo.name : `Image_${imageIndex}`,
                imageId: parseInt(imageIndex),
                points: data.points.map(point => ({
                    id: point.id,
                    position: {
                        x: point.position.x,
                        y: point.position.y,
                        z: point.position.z
                    },
                    connections: point.connections || [],
                    imageIndex: point.imageIndex
                })),
                lines: data.lines.map(line => ({
                    id: line.id,
                    pointId1: line.pointId1,
                    pointId2: line.pointId2,
                    imageIndex: line.imageIndex
                })),
                surfaces: data.surfaces.map(surface => ({
                    id: surface.id,
                    pointIds: surface.pointIds,
                    color: surface.color,
                    imageIndex: surface.imageIndex
                })),
                openings: (data.openings || []).map(opening => ({
                    id: opening.id,
                    type: opening.type,
                    points: opening.points,
                    dimensions: opening.dimensions,
                    properties: opening.properties,
                    imageIndex: opening.imageIndex
                })),
                statistics: {
                    pointCount: data.points.length,
                    lineCount: data.lines.length,
                    surfaceCount: data.surfaces.length,
                    openingCount: (data.openings || []).length
                }
            };
        });
        
        const exportedData = {
            version: '2.0',
            timestamp: new Date().toISOString(),
            totalImages: this.loadedImages.length,
            currentImageIndex: this.currentImageIndex,
            images: this.loadedImages.map(img => ({
                id: img.id,
                name: img.name
            })),
            settings: this.settings,
            imageData: imageDataExport,
            summary: {
                totalPoints: Object.values(this.imageData).reduce((sum, data) => sum + data.points.length, 0),
                totalLines: Object.values(this.imageData).reduce((sum, data) => sum + data.lines.length, 0),
                totalSurfaces: Object.values(this.imageData).reduce((sum, data) => sum + data.surfaces.length, 0),
                totalOpenings: Object.values(this.imageData).reduce((sum, data) => sum + (data.openings || []).length, 0),
                imagesWithData: Object.keys(this.imageData).length
            }
        };
        
        const json = JSON.stringify(exportedData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `360-viewer-multiroom-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        
        console.log('📄 Wyeksportowano dane z podziałem na obrazy:');
        console.log(`  Całkowite obrazy: ${exportedData.totalImages}`);
        console.log(`  Obrazy z danymi: ${exportedData.summary.imagesWithData}`);
        console.log(`  Całkowite punkty: ${exportedData.summary.totalPoints}`);
        console.log(`  Całkowite linie: ${exportedData.summary.totalLines}`);
        console.log(`  Całkowite powierzchnie: ${exportedData.summary.totalSurfaces}`);
        console.log(`  Całkowite otwory: ${exportedData.summary.totalOpenings}`);
        
        this.showMessage(
            `Wyeksportowano dane:\n${exportedData.summary.imagesWithData} obrazów z danymi\n${exportedData.summary.totalPoints} punktów, ${exportedData.summary.totalLines} linii, ${exportedData.summary.totalSurfaces} powierzchni, ${exportedData.summary.totalOpenings} otworów`,
            'success',
            8000
        );
    }
    
    showMessage(text, type = 'info', duration = 3000) {
        const messagesContainer = document.getElementById('messages');
        const message = document.createElement('div');
        message.className = `message ${type}`;
        message.textContent = text;
        
        messagesContainer.appendChild(message);
        
        // Animacja pojawiania się
        setTimeout(() => {
            message.classList.add('show');
        }, 100);
        
        // Automatyczne usunięcie po określonym czasie
        setTimeout(() => {
            message.classList.remove('show');
            setTimeout(() => {
                if (message.parentNode) {
                    message.parentNode.removeChild(message);
                }
            }, 300);
        }, duration);
    }
    
    onWindowResize() {
        const canvas = this.renderer.domElement;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(width, height);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Aktualizuj etykiety punktów aby zawsze patrzyły na kamerę
        if (this.settings.showHelpers) {
            this.helpersGroup.children.forEach(helper => {
                helper.lookAt(this.camera.position);
            });
        }
        
        this.renderer.render(this.scene, this.camera);
    }
    
    createSurfaceFromPoints() {
        const currentData = this.getCurrentImageData();
        if (currentData.points.length < 3) return;
        
        console.log(`🏠 Tworzę powierzchnię z ${currentData.points.length} punktów`);
        
        // Utwórz powierzchnię z wszystkich aktualnych punktów (bez punktu zamykającego)
        const positions = currentData.points.map(p => p.position);
        
        // Triangulacja - dla uproszczenia używamy fan triangulation
        const vertices = [];
        const indices = [];
        
        // Dodaj wierzchołki
        positions.forEach(pos => {
            vertices.push(pos.x, pos.y, pos.z);
        });
        
        // Tworzenie trójkątów (fan triangulation)
        for (let i = 1; i < positions.length - 1; i++) {
            indices.push(0, i, i + 1);
        }
        
        // Geometria powierzchni
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        // Materiał powierzchni - półprzezroczysta powierzchnia
        const material = new THREE.MeshBasicMaterial({
            color: 0x00FF00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.3,
            wireframe: false
        });
        
        const surface = new THREE.Mesh(geometry, material);
        surface.userData = { surfaceId: currentData.surfaces.length };
        this.surfacesGroup.add(surface);
        
        // Zapisz dane powierzchni - używamy ID punktów zamiast referencji
        const surfaceData = {
            id: currentData.surfaces.length,
            pointIds: currentData.points.map(p => p.id), // Zapisz ID punktów
            mesh: surface,
            color: 0x00FF00,
            imageIndex: this.currentImageIndex
        };
        
        currentData.surfaces.push(surfaceData);
        
        console.log(`✅ Utworzono powierzchnię ${surfaceData.id} z ${surfaceData.pointIds.length} punktów`);
    }

    copySurfaceToBottom() {
        const currentData = this.getCurrentImageData();
        
        // Sprawdź czy istnieje jakaś powierzchnia do skopiowania
        if (currentData.surfaces.length === 0) {
            this.showMessage('Brak powierzchni do skopiowania', 'warning');
            return;
        }

        // Znajdź ostatnią powierzchnię na aktualnym obrazie
        const currentSurface = currentData.surfaces[currentData.surfaces.length - 1];
        if (!currentSurface) {
            this.showMessage('Brak powierzchni na aktualnym obrazie', 'warning');
            return;
        }

        console.log(`🔄 Kopiowanie powierzchni ${currentSurface.id} na dół sfery...`);

        // Pobierz punkty oryginalnej powierzchni
        const originalPoints = [];
        currentSurface.pointIds.forEach(pointId => {
            const point = currentData.points.find(p => p.id === pointId);
            if (point) {
                originalPoints.push(point);
            }
        });

        if (originalPoints.length === 0) {
            this.showMessage('Nie znaleziono punktów powierzchni', 'error');
            return;
        }

        // Stwórz nowe punkty na dole sfery
        const newPoints = [];
        originalPoints.forEach((originalPoint, index) => {
            // Oblicz nową pozycję - projekcja na dolną część sfery
            const originalPos = originalPoint.position.clone();
            
            // Zachowaj X i Z, ale odbij Y i normalizuj do promienia sfery
            const newPosition = new THREE.Vector3(originalPos.x, originalPos.z, originalPos.z);
            
            // Oblicz odległość od centrum w płaszczyźnie XZ
            const horizontalDistance = Math.sqrt(originalPos.x * originalPos.x + originalPos.z * originalPos.z);
            
            // Oblicz Y tak, aby punkt był na powierzchni sfery (promień 500)
            const sphereRadius = 500;
            const maxHorizontalDist = Math.min(horizontalDistance, sphereRadius * 0.9); // Ograniczenie aby uniknąć problemów
            const newY = -Math.sqrt(sphereRadius * sphereRadius - maxHorizontalDist * maxHorizontalDist);
            
            // Ustaw nową pozycję
            newPosition.set(originalPos.x, newY, originalPos.z);
            
            // Normalizuj do promienia sfery dla pewności
            newPosition.normalize().multiplyScalar(sphereRadius);

            const newPoint = {
                id: currentData.points.length,
                position: newPosition,
                screenPosition: null, // Zostanie obliczona później jeśli potrzeba
                imageIndex: this.currentImageIndex,
                connections: []
            };

            currentData.points.push(newPoint);
            this.createPointVisual(newPoint);
            newPoints.push(newPoint);

            console.log(`📍 Skopiowano punkt ${originalPoint.id} jako ${newPoint.id}`, 
                       `Oryginał: Y=${originalPos.y.toFixed(1)}, Nowy: Y=${newPosition.y.toFixed(1)}`);
        });

        // Połącz nowe punkty między sobą (ta sama logika co oryginalna powierzchnia)
        for (let i = 0; i < newPoints.length; i++) {
            const nextIndex = (i + 1) % newPoints.length;
            this.createAutoConnection(newPoints[i].id, newPoints[nextIndex].id);
        }

        // Połącz odpowiadające sobie punkty pionowymi liniami
        for (let i = 0; i < originalPoints.length; i++) {
            this.createAutoConnection(originalPoints[i].id, newPoints[i].id);
        }

        // Stwórz nową powierzchnię z nowych punktów
        this.createSurfaceFromNewPoints(newPoints);

        this.showMessage(`Skopiowano powierzchnię na dół z ${newPoints.length} punktami`, 'success');
        this.updateUI();
    }

    createSurfaceFromNewPoints(points) {
        if (points.length < 3) return;

        console.log(`🏠 Tworzę powierzchnię z ${points.length} nowych punktów`);

        // Utwórz powierzchnię z podanych punktów
        const positions = points.map(p => p.position);

        // Triangulacja - dla uproszczenia używamy fan triangulation
        const vertices = [];
        const indices = [];

        // Dodaj wierzchołki
        positions.forEach(pos => {
            vertices.push(pos.x, pos.y, pos.z);
        });

        // Tworzenie trójkątów (fan triangulation)
        for (let i = 1; i < positions.length - 1; i++) {
            indices.push(0, i, i + 1);
        }

        // Geometria powierzchni - użyj istniejących punktów
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        // Materiał powierzchni - półprzezroczysta powierzchnia (inny kolor dla rozróżnienia)
        const material = new THREE.MeshBasicMaterial({
            color: 0x0088FF, // Niebieski kolor dla dolnej powierzchni
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.3,
            wireframe: false
        });

        const surface = new THREE.Mesh(geometry, material);
        const currentData = this.getCurrentImageData();
        surface.userData = { surfaceId: currentData.surfaces.length };
        this.surfacesGroup.add(surface);

        // Zapisz dane powierzchni
        const surfaceData = {
            id: currentData.surfaces.length,
            pointIds: points.map(p => p.id), // Zapisz ID punktów
            mesh: surface,
            color: 0x0088FF,
            imageIndex: this.currentImageIndex
        };

        currentData.surfaces.push(surfaceData);

        console.log(`✅ Utworzono dolną powierzchnię ${surfaceData.id} z ${surfaceData.pointIds.length} punktów`);
    }

    updateSurfaces() {
        const currentData = this.getCurrentImageData();
        // Aktualizuj wszystkie powierzchnie na aktualnym obrazie
        currentData.surfaces.forEach(surface => {
            // Pobierz aktualne pozycje punktów należących do tej powierzchni
            const currentPositions = [];
            surface.pointIds.forEach(pointId => {
                const point = currentData.points.find(p => p.id === pointId);
                if (point) {
                    currentPositions.push(point.position);
                }
            });

            if (currentPositions.length >= 3 && surface.mesh) {
                // Aktualizuj geometrię powierzchni
                const vertices = [];
                currentPositions.forEach(pos => {
                    vertices.push(pos.x, pos.y, pos.z);
                });

                // Utwórz nowe indeksy dla trójkątów
                const indices = [];
                for (let i = 1; i < currentPositions.length - 1; i++) {
                    indices.push(0, i, i + 1);
                }

                // Zaktualizuj geometrię
                surface.mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
                surface.mesh.geometry.setIndex(indices);
                surface.mesh.geometry.computeVertexNormals();
                surface.mesh.geometry.attributes.position.needsUpdate = true;
            }
        });
    }
    
    // ===== FUNKCJE POMIAROWE =====
    
    /**
     * Mierzy pomieszczenie na podstawie istniejących punktów
     */
    measureExistingRoom() {
        if (this.points.length < 3) {
            this.showMessage('Potrzebujesz minimum 3 punkty do pomiaru. Oznacz rogi pomieszczenia w trybie "Punkty".', 'warning');
            return;
        }
        
        console.log('📏 Rozpoczynam pomiar pomieszczenia...');
        console.log(`Mam ${this.points.length} punktów do analizy`);
        
        // Sprawdź czy mamy powierzchnię
        if (this.surfaces.length === 0) {
            this.showMessage('Brak powierzchni. Zamknij bryłę klikając blisko pierwszego punktu w trybie "Punkty".', 'warning');
            return;
        }
        
        // Znajdź powierzchnię na aktualnym obrazie
        const currentSurface = this.surfaces.find(s => s.imageIndex === this.currentImageIndex);
        if (!currentSurface) {
            this.showMessage('Brak powierzchni na aktualnym obrazie.', 'warning');
            return;
        }
        
        // Pobierz punkty powierzchni
        const surfacePoints = [];
        currentSurface.points.forEach(pointId => {
            const point = this.points.find(p => p.id === pointId);
            if (point) {
                surfacePoints.push(point);
            }
        });
        
        if (surfacePoints.length < 3) {
            this.showMessage('Powierzchnia musi mieć minimum 3 punkty.', 'warning');
            return;
        }
        
        // Wykryj typ kształtu i oblicz odpowiednie wymiary
        const shapeType = this.detectShapeType(surfacePoints);
        let dimensions;
        
        if (shapeType === 'rectangle' && surfacePoints.length === 4) {
            dimensions = this.calculateRectangleDimensions(surfacePoints);
        } else {
            dimensions = this.calculateIrregularShapeDimensions(surfacePoints);
        }
        
        // Wyświetl wyniki
        console.log('🏠 Wymiary pomieszczenia:');
        console.log(`Typ kształtu: ${shapeType}`);
        console.log(`Powierzchnia: ${dimensions.area.toFixed(2)} jednostek²`);
        console.log(`Obwód: ${dimensions.perimeter.toFixed(2)} jednostek`);
        
        // Przygotuj wiadomość
        let message = `Pomieszczenie (${shapeType}):\nPowierzchnia: ${dimensions.area.toFixed(2)} j.²\nObwód: ${dimensions.perimeter.toFixed(2)} j.`;
        
        if (dimensions.width && dimensions.length) {
            console.log(`Szerokość: ${dimensions.width.toFixed(2)} jednostek`);
            console.log(`Długość: ${dimensions.length.toFixed(2)} jednostek`);
            message = `Pomieszczenie (${shapeType}):\nSzerokość: ${dimensions.width.toFixed(2)} j.\nDługość: ${dimensions.length.toFixed(2)} j.\nPowierzchnia: ${dimensions.area.toFixed(2)} j.²\nObwód: ${dimensions.perimeter.toFixed(2)} j.`;
        }
        
        // Dodaj informacje o bokach
        if (dimensions.sideLengths) {
            console.log('📐 Długości boków:');
            dimensions.sideLengths.forEach((length, index) => {
                console.log(`  Bok ${index + 1}: ${length.toFixed(2)} jednostek`);
            });
        }
        
        // Jeśli mamy kalibrację, pokaż wymiary w metrach (zawsze mamy)
        const areaM = (dimensions.area * this.calibration.scale * this.calibration.scale).toFixed(2);
        const perimeterM = (dimensions.perimeter * this.calibration.scale).toFixed(2);
        
        console.log('📏 Wymiary w metrach:');
        console.log(`Powierzchnia: ${areaM} m²`);
        console.log(`Obwód: ${perimeterM} m`);
        
        if (dimensions.width && dimensions.length) {
            const widthM = (dimensions.width * this.calibration.scale).toFixed(2);
            const lengthM = (dimensions.length * this.calibration.scale).toFixed(2);
            console.log(`Szerokość: ${widthM} m`);
            console.log(`Długość: ${lengthM} m`);
            message = `Pomieszczenie (${shapeType}):\nSzerokość: ${widthM} m\nDługość: ${lengthM} m\nPowierzchnia: ${areaM} m²\nObwód: ${perimeterM} m`;
        } else {
            message = `Pomieszczenie (${shapeType}):\nPowierzchnia: ${areaM} m²\nObwód: ${perimeterM} m`;
        }
        
        this.showMessage(message, 'success', 12000);
        
        // Zapisz wymiary
        this.roomDimensions = dimensions;
    }
    
    /**
     * Oblicza wymiary prostokąta z punktów 3D z uśrednianiem przeciwległych ścian
     */
    calculateRectangleDimensions(points) {
        if (points.length < 4) {
            return { width: 0, length: 0, area: 0 };
        }
        
        // Sortuj punkty w kolejności (np. zgodnie z ruchem wskazówek zegara)
        const sortedPoints = this.sortPointsClockwise(points);
        
        // Oblicz odległości między sąsiednimi punktami
        const distances = [];
        for (let i = 0; i < sortedPoints.length; i++) {
            const current = sortedPoints[i];
            const next = sortedPoints[(i + 1) % sortedPoints.length];
            
            const distance = this.distance3D(current.position, next.position);
            distances.push(distance);
            
            console.log(`Odległość ${current.id} → ${next.id}: ${distance.toFixed(2)} jednostek`);
        }
        
        // Uśrednij przeciwległe ściany dla lepszej dokładności
        const side1 = distances[0]; // pierwsza ściana
        const side2 = distances[1]; // druga ściana  
        const side3 = distances[2]; // trzecia ściana (przeciwległa do pierwszej)
        const side4 = distances[3]; // czwarta ściana (przeciwległa do drugiej)
        
        // Uśrednij przeciwległe ściany
        const avgWidth = (side1 + side3) / 2;
        const avgLength = (side2 + side4) / 2;
        
        console.log(`📊 Uśrednianie przeciwległych ścian:`);
        console.log(`  Ściana 1: ${side1.toFixed(2)}, Ściana 3: ${side3.toFixed(2)} → Średnia: ${avgWidth.toFixed(2)}`);
        console.log(`  Ściana 2: ${side2.toFixed(2)}, Ściana 4: ${side4.toFixed(2)} → Średnia: ${avgLength.toFixed(2)}`);
        
        const area = avgWidth * avgLength;
        const perimeter = (avgWidth + avgLength) * 2;
        
        return {
            width: avgWidth,
            length: avgLength,
            area: area,
            perimeter: perimeter,
            rawDistances: distances // zachowaj surowe odległości
        };
    }
    
    /**
     * Wykrywa typ kształtu na podstawie punktów
     */
    detectShapeType(points) {
        if (points.length === 3) {
            return 'triangle';
        } else if (points.length === 4) {
            // Sprawdź czy to prostokąt
            if (this.isRectangle(points)) {
                return 'rectangle';
            } else {
                return 'quadrilateral';
            }
        } else if (points.length > 4) {
            return 'polygon';
        }
        return 'unknown';
    }
    
    /**
     * Sprawdza czy 4 punkty tworzą prostokąt
     */
    isRectangle(points) {
        if (points.length !== 4) return false;
        
        const sortedPoints = this.sortPointsClockwise(points);
        const distances = [];
        
        // Oblicz wszystkie boki
        for (let i = 0; i < sortedPoints.length; i++) {
            const current = sortedPoints[i];
            const next = sortedPoints[(i + 1) % sortedPoints.length];
            distances.push(this.distance3D(current.position, next.position));
        }
        
        // Sprawdź czy przeciwległe boki są podobne (tolerancja 10%)
        const tolerance = 0.1;
        const side1 = distances[0];
        const side2 = distances[1];
        const side3 = distances[2];
        const side4 = distances[3];
        
        const diff1 = Math.abs(side1 - side3) / Math.max(side1, side3);
        const diff2 = Math.abs(side2 - side4) / Math.max(side2, side4);
        
        return diff1 < tolerance && diff2 < tolerance;
    }
    
    /**
     * Oblicza wymiary nieregularnego kształtu
     */
    calculateIrregularShapeDimensions(points) {
        const sortedPoints = this.sortPointsClockwise(points);
        
        // Oblicz długości wszystkich boków
        const sideLengths = [];
        for (let i = 0; i < sortedPoints.length; i++) {
            const current = sortedPoints[i];
            const next = sortedPoints[(i + 1) % sortedPoints.length];
            const distance = this.distance3D(current.position, next.position);
            sideLengths.push(distance);
            console.log(`Bok ${i + 1}: ${distance.toFixed(2)} jednostek`);
        }
        
        // Oblicz obwód
        const perimeter = sideLengths.reduce((sum, length) => sum + length, 0);
        
        // Oblicz powierzchnię używając wzoru na pole wielokąta (shoelace formula)
        const area = this.calculatePolygonArea(sortedPoints);
        
        // Dla nieregularnych kształtów znajdź najdłuższe wymiary
        const boundingBox = this.calculateBoundingBox(sortedPoints);
        
        console.log(`📐 Analiza nieregularnego kształtu:`);
        console.log(`  Liczba boków: ${sortedPoints.length}`);
        console.log(`  Obwód: ${perimeter.toFixed(2)} jednostek`);
        console.log(`  Powierzchnia: ${area.toFixed(2)} jednostek²`);
        console.log(`  Szerokość (bounding box): ${boundingBox.width.toFixed(2)} jednostek`);
        console.log(`  Długość (bounding box): ${boundingBox.length.toFixed(2)} jednostek`);
        
        return {
            area: area,
            perimeter: perimeter,
            width: boundingBox.width,
            length: boundingBox.length,
            sideLengths: sideLengths,
            boundingBox: boundingBox
        };
    }
    
    /**
     * Oblicza powierzchnię wielokąta używając wzoru shoelace
     */
    calculatePolygonArea(points) {
        if (points.length < 3) return 0;
        
        // Projekcja na płaszczyznę XZ (pozioma)
        let area = 0;
        for (let i = 0; i < points.length; i++) {
            const current = points[i].position;
            const next = points[(i + 1) % points.length].position;
            area += current.x * next.z - next.x * current.z;
        }
        
        return Math.abs(area) / 2;
    }
    
    /**
     * Oblicza ramkę otaczającą (bounding box) dla punktów
     */
    calculateBoundingBox(points) {
        if (points.length === 0) return { width: 0, length: 0 };
        
        let minX = points[0].position.x;
        let maxX = points[0].position.x;
        let minZ = points[0].position.z;
        let maxZ = points[0].position.z;
        
        points.forEach(point => {
            minX = Math.min(minX, point.position.x);
            maxX = Math.max(maxX, point.position.x);
            minZ = Math.min(minZ, point.position.z);
            maxZ = Math.max(maxZ, point.position.z);
        });
        
        return {
            width: maxX - minX,
            length: maxZ - minZ,
            minX: minX,
            maxX: maxX,
            minZ: minZ,
            maxZ: maxZ
        };
    }
    
    /**
     * Ulepszone sortowanie punktów - lepsze dla nieregularnych kształtów
     */
    sortPointsClockwise(points) {
        // Znajdź środek punktów
        const center = new THREE.Vector3(0, 0, 0);
        points.forEach(point => {
            center.add(point.position);
        });
        center.divideScalar(points.length);
        
        // Sortuj punkty według kąta względem środka
        return points.slice().sort((a, b) => {
            const angleA = Math.atan2(a.position.z - center.z, a.position.x - center.x);
            const angleB = Math.atan2(b.position.z - center.z, b.position.x - center.x);
            return angleA - angleB;
        });
    }

    // ===== FUNKCJE KALIBRACJI =====
    
    /**
     * Pokazuje opcje dostrojenia skali
     */
    showCalibrationInstructions() {
        const currentScale = this.calibration.scale;
        const scaleInCm = (currentScale * 100).toFixed(1);
        
        const newScale = prompt(
            `Aktualna skala: 1 jednostka = ${scaleInCm} cm\n\nPodaj nową skalę w centymetrach (np. 1 dla 1cm, 10 dla 10cm):`,
            scaleInCm
        );
        
        if (newScale && !isNaN(newScale)) {
            const scaleValue = parseFloat(newScale);
            this.calibration.scale = scaleValue / 100; // konwersja cm na metry
            
            console.log(`🎯 Nowa skala: 1 jednostka = ${scaleValue} cm`);
            this.showMessage(
                `Skala ustawiona!\n1 jednostka = ${scaleValue} cm\n\nZmierz pomieszczenie ponownie aby zobaczyć nowe wymiary.`,
                'success',
                6000
            );
        }
    }
    
    /**
     * Konwertuje jednostki na metry
     */
    unitsToMeters(units) {
        return units * this.calibration.scale;
    }
    
    /**
     * Formatuje wymiar z jednostkami
     */
    formatDimension(units) {
        const meters = this.unitsToMeters(units);
        return `${meters.toFixed(2)} m`;
    }
    
    // ===== FUNKCJE WYMIARÓW =====
    
    createLineDimension(line) {
        const distance = line.point1.distanceTo(line.point2);
        let distanceText;
        
        if (this.settings.isCalibrated) {
            // Przelicz na centymetry
            const distanceInCm = distance * this.settings.scale;
            if (distanceInCm >= 100) {
                distanceText = (distanceInCm / 100).toFixed(2) + 'm';
            } else {
                distanceText = distanceInCm.toFixed(0) + 'cm';
            }
        } else {
            // Jednostki 3D
            distanceText = distance.toFixed(0);
        }
        
        // Oblicz środek linii
        const midpoint = new THREE.Vector3()
            .addVectors(line.point1, line.point2)
            .multiplyScalar(0.5);
        
        // Stwórz sprite z tekstem
        const sprite = this.createTextSprite(distanceText);
        sprite.position.copy(midpoint);
        sprite.userData = { lineId: line.id, type: 'dimension' };
        
        this.dimensionsGroup.add(sprite);
    }
    
    updateLineDimension(lineId, point1, point2) {
        // Znajdź i usuń starą etykietę
        const oldLabel = this.dimensionsGroup.children.find(child => 
            child.userData && child.userData.lineId === lineId && child.userData.type === 'dimension'
        );
        
        if (oldLabel) {
            this.dimensionsGroup.remove(oldLabel);
        }
        
        // Stwórz nową etykietę
        const distance = point1.distanceTo(point2);
        let distanceText;
        
        if (this.settings.isCalibrated) {
            // Przelicz na centymetry
            const distanceInCm = distance * this.settings.scale;
            if (distanceInCm >= 100) {
                distanceText = (distanceInCm / 100).toFixed(2) + 'm';
            } else {
                distanceText = distanceInCm.toFixed(0) + 'cm';
            }
        } else {
            // Jednostki 3D
            distanceText = distance.toFixed(0);
        }
        
        const midpoint = new THREE.Vector3()
            .addVectors(point1, point2)
            .multiplyScalar(0.5);
        
        const sprite = this.createTextSprite(distanceText);
        sprite.position.copy(midpoint);
        sprite.userData = { lineId: lineId, type: 'dimension' };
        
        this.dimensionsGroup.add(sprite);
    }
    
    createTextSprite(text) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // Ustawienia tekstu
        const fontSize = 32;
        context.font = `bold ${fontSize}px Arial`;
        
        // Zmierz tekst
        const textWidth = context.measureText(text).width;
        const textHeight = fontSize;
        
        // Ustaw rozmiar canvas
        canvas.width = textWidth + 16;
        canvas.height = textHeight + 16;
        
        // Wypełnij tło
        context.fillStyle = 'rgba(0, 0, 0, 0.8)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Narysuj tekst
        context.font = `bold ${fontSize}px Arial`;
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        
        // Stwórz teksturę i sprite
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        
        // Ustaw rozmiar - mały i czytelny
        const scale = 40;
        sprite.scale.set(scale * (canvas.width / canvas.height), scale, 1);
        
        return sprite;
    }
    
    // ===== KALIBRACJA =====
    
    addCalibrationPoint(mouseCoords, event) {
        const intersects = this.raycaster.intersectObject(this.sphere);
        
        if (intersects.length > 0) {
            const intersection = intersects[0];
            
            // Znajdź punkty kalibracyjne (oznaczone jako calibration: true)
            const calibrationPoints = this.points.filter(p => p.calibration === true);
            
            if (calibrationPoints.length >= 2) {
                this.showMessage('Już masz 2 punkty kalibracyjne. Użyj "Anuluj" aby zacząć od nowa.', 'warning');
                return;
            }
            
            const point = {
                id: this.points.length,
                position: intersection.point.clone(),
                screenPosition: mouseCoords.clone(),
                imageIndex: this.currentImageIndex,
                connections: [],
                calibration: true // Oznacz jako punkt kalibracyjny
            };
            
            this.points.push(point);
            this.createCalibrationPointVisual(point);
            
            // Jeśli to drugi punkt kalibracyjny, stwórz linię
            if (calibrationPoints.length === 1) {
                const firstCalibrationPoint = calibrationPoints[0];
                this.createCalibrationLine(firstCalibrationPoint.id, point.id);
            }
            
            console.log(`📍 Dodano punkt kalibracyjny ${point.id}`);
            this.showMessage(`Dodano punkt kalibracyjny ${calibrationPoints.length + 1}/2`, 'info');
            
            this.updateCalibrationStatus();
            this.updateUI();
        }
    }
    
    createCalibrationPointVisual(point) {
        const geometry = new THREE.SphereGeometry(this.settings.pointSize * 1.2, 8, 8);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xFF6B00, // Pomarańczowy dla punktów kalibracyjnych
            transparent: true,
            opacity: 0.9
        });
        
        const pointMesh = new THREE.Mesh(geometry, material);
        pointMesh.position.copy(point.position);
        pointMesh.userData = { pointId: point.id };
        
        this.pointsGroup.add(pointMesh);
        
        // Dodaj etykietę
        if (this.settings.showHelpers) {
            this.createCalibrationPointLabel(point);
        }
    }
    
    createCalibrationPointLabel(point) {
        const geometry = new THREE.RingGeometry(this.settings.pointSize * 2, this.settings.pointSize * 2.5, 8);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xFF6B00,
            transparent: true,
            opacity: 0.7
        });
        
        const ring = new THREE.Mesh(geometry, material);
        ring.position.copy(point.position);
        ring.lookAt(this.camera.position);
        ring.userData = { pointId: point.id, type: 'calibrationLabel' };
        
        this.helpersGroup.add(ring);
    }
    
    createCalibrationLine(pointId1, pointId2) {
        const point1 = this.points.find(p => p.id === pointId1);
        const point2 = this.points.find(p => p.id === pointId2);
        
        if (!point1 || !point2) return;
        
        const line = {
            id: this.lines.length,
            pointId1: pointId1,
            pointId2: pointId2,
            point1: point1.position.clone(),
            point2: point2.position.clone(),
            imageIndex: this.currentImageIndex,
            calibration: true // Oznacz jako linię kalibracyjną
        };
        
        this.lines.push(line);
        this.createCalibrationLineVisual(line);
        
        console.log(`🔗 Utworzono linię kalibracyjną między punktami ${pointId1} i ${pointId2}`);
    }
    
    createCalibrationLineVisual(line) {
        const geometry = new THREE.BufferGeometry().setFromPoints([
            line.point1,
            line.point2
        ]);
        
        const material = new THREE.LineBasicMaterial({ 
            color: 0xFF6B00, // Pomarańczowa linia kalibracyjna
            linewidth: this.settings.lineWidth * 1.5
        });
        
        const lineMesh = new THREE.Line(geometry, material);
        lineMesh.userData = { lineId: line.id };
        
        this.linesGroup.add(lineMesh);
        
        // Dodaj specjalny wymiar kalibracyjny
        this.createCalibrationDimension(line);
    }
    
    createCalibrationDimension(line) {
        const distance = line.point1.distanceTo(line.point2);
        const calibrationValue = document.getElementById('calibration-value').value;
        const distanceText = `${calibrationValue}cm (do kalibracji)`;
        
        // Oblicz środek linii
        const midpoint = new THREE.Vector3()
            .addVectors(line.point1, line.point2)
            .multiplyScalar(0.5);
        
        // Stwórz sprite z tekstem
        const sprite = this.createCalibrationTextSprite(distanceText);
        sprite.position.copy(midpoint);
        sprite.userData = { lineId: line.id, type: 'calibrationDimension' };
        
        this.dimensionsGroup.add(sprite);
    }
    
    createCalibrationTextSprite(text) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // Ustawienia tekstu
        const fontSize = 28;
        context.font = `bold ${fontSize}px Arial`;
        
        // Zmierz tekst
        const textWidth = context.measureText(text).width;
        const textHeight = fontSize;
        
        // Ustaw rozmiar canvas
        canvas.width = textWidth + 20;
        canvas.height = textHeight + 16;
        
        // Wypełnij tło - pomarańczowe dla kalibracji
        context.fillStyle = 'rgba(255, 107, 0, 0.9)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Narysuj tekst
        context.font = `bold ${fontSize}px Arial`;
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        
        // Stwórz teksturę i sprite
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        
        // Ustaw rozmiar
        const scale = 45;
        sprite.scale.set(scale * (canvas.width / canvas.height), scale, 1);
        
        return sprite;
    }
    
    // ===== KALIBRACJA =====
    
    finishCalibration() {
        const calibrationPoints = this.points.filter(p => p.calibration === true);
        
        if (calibrationPoints.length !== 2) {
            this.showMessage('Potrzebujesz dokładnie 2 punkty kalibracyjne', 'warning');
            return;
        }
        
        const calibrationValue = parseFloat(document.getElementById('calibration-value').value);
        
        if (!calibrationValue || calibrationValue <= 0) {
            this.showMessage('Wprowadź prawidłową wartość kalibracji', 'warning');
            return;
        }
        
        // Oblicz skalę
        const distance3D = calibrationPoints[0].position.distanceTo(calibrationPoints[1].position);
        this.settings.scale = calibrationValue / distance3D;
        this.settings.isCalibrated = true;
        this.settings.calibrationValue = calibrationValue; // Zapisz wartość kalibracji
        
        console.log(`📏 Kalibracja zakończona! Skala: ${this.settings.scale.toFixed(4)} cm/jednostka`);
        this.showMessage(`Kalibracja zakończona! ${calibrationValue}cm = ${distance3D.toFixed(0)} jednostek 3D`, 'success');
        
        // Aktualizuj etykietę kalibracyjną
        this.updateCalibrationDimensionLabel();
        
        // Przełącz automatycznie na tryb punktów
        this.setMode('point');
        
        // Aktualizuj wszystkie istniejące wymiary
        this.updateAllDimensions();
    }
    
    cancelCalibration() {
        const currentData = this.getCurrentImageData();
        
        // 1. Usuń punkty kalibracyjne z danych
        currentData.points = currentData.points.filter(p => !p.calibration && !p.isCalibrationPoint);
        
        // 2. Usuń punkty kalibracyjne z wizualizacji
        this.pointsGroup.children = this.pointsGroup.children.filter(child => {
            if (child.userData && (
                child.userData.type === 'calibrationPoint' || 
                child.userData.pointId !== undefined && 
                currentData.points.every(p => p.id !== child.userData.pointId)
            )) {
                this.pointsGroup.remove(child);
                return false;
            }
            return true;
        });

        // 3. Usuń linie kalibracyjne z danych i wizualizacji
        currentData.lines = currentData.lines.filter(l => !l.calibration);
        this.linesGroup.clear(); // Wyczyść wszystkie linie

        // 4. Usuń pomocnicze elementy
        this.helpersGroup.children = this.helpersGroup.children.filter(child => {
            if (child.userData && (
                child.userData.type === 'calibrationLabel' || 
                child.userData.type === 'calibrationPoint'
            )) {
                this.helpersGroup.remove(child);
                return false;
            }
            return true;
        });

        // 5. Wyczyść wymiary kalibracyjne
        this.dimensionsGroup.children = this.dimensionsGroup.children.filter(child => {
            if (child.userData && child.userData.type === 'calibrationDimension') {
                this.dimensionsGroup.remove(child);
                return false;
            }
            return true;
        });

        // 6. Reset ustawień kalibracji
        this.settings.isCalibrated = false;
        this.settings.scale = 1.0;
        
        // 7. Przełącz na tryb podglądu
        this.setMode('view');
        
        this.showMessage('Kalibracja anulowana', 'info');
        this.updateUI();
    }
    
    updateCalibrationDimensionLabel() {
        // Znajdź i zaktualizuj etykietę wymiaru kalibracyjnego
        const calibrationLines = this.lines.filter(l => l.calibration);
        
        calibrationLines.forEach(line => {
            const oldLabel = this.dimensionsGroup.children.find(child => 
                child.userData && child.userData.lineId === line.id && child.userData.type === 'calibrationDimension'
            );
            
            if (oldLabel) {
                this.dimensionsGroup.remove(oldLabel);
                
                // Stwórz nową etykietę z napisem "skalibrowano"
                const calibrationValue = this.settings.calibrationValue;
                const distanceText = `${calibrationValue}cm (skalibrowano)`;
                
                const midpoint = new THREE.Vector3()
                    .addVectors(line.point1, line.point2)
                    .multiplyScalar(0.5);
                
                const sprite = this.createCalibrationTextSprite(distanceText);
                sprite.position.copy(midpoint);
                sprite.userData = { lineId: line.id, type: 'calibrationDimension' };
                
                this.dimensionsGroup.add(sprite);
            }
        });
    }
    
    updateCalibrationDimensionPreview() {
        // Aktualizuj podgląd wymiaru kalibracyjnego gdy użytkownik zmienia wartość
        const calibrationLines = this.lines.filter(l => l.calibration);
        
        calibrationLines.forEach(line => {
            const oldLabel = this.dimensionsGroup.children.find(child => 
                child.userData && child.userData.lineId === line.id && child.userData.type === 'calibrationDimension'
            );
            
            if (oldLabel) {
                this.dimensionsGroup.remove(oldLabel);
                
                // Stwórz nową etykietę z aktualną wartością
                const calibrationValue = document.getElementById('calibration-value').value;
                const distanceText = `${calibrationValue}cm (do kalibracji)`;
                
                const midpoint = new THREE.Vector3()
                    .addVectors(line.point1, line.point2)
                    .multiplyScalar(0.5);
                
                const sprite = this.createCalibrationTextSprite(distanceText);
                sprite.position.copy(midpoint);
                sprite.userData = { lineId: line.id, type: 'calibrationDimension' };
                
                this.dimensionsGroup.add(sprite);
            }
        });
    }
    
    updateAllDimensions() {
        // Aktualizuj wszystkie wymiary z nową skalą
        this.lines.forEach(line => {
            if (!line.calibration) { // Nie aktualizuj linii kalibracyjnych
                const point1 = this.points.find(p => p.id === line.pointId1);
                const point2 = this.points.find(p => p.id === line.pointId2);
                
                if (point1 && point2) {
                    this.updateLineDimension(line.id, point1.position, point2.position);
                }
            }
        });
    }
    
    // ===== FUNKCJE ZARZĄDZANIA DANYMI PER-OBRAZ =====
    
    /**
     * Pobiera dane dla aktualnego obrazu
     */
    getCurrentImageData() {
        if (!this.imageData[this.currentImageIndex]) {
            this.imageData[this.currentImageIndex] = {
                points: [],
                lines: [],
                surfaces: [],
                openings: []
            };
        }
        return this.imageData[this.currentImageIndex];
    }
    
    /**
     * Pobiera punkty dla aktualnego obrazu
     */
    get points() {
        return this.getCurrentImageData().points;
    }
    
    /**
     * Pobiera linie dla aktualnego obrazu
     */
    get lines() {
        return this.getCurrentImageData().lines;
    }
    
    /**
     * Pobiera powierzchnie dla aktualnego obrazu
     */
    get surfaces() {
        return this.getCurrentImageData().surfaces;
    }
    
    /**
     * Przełącza wizualizację na dane aktualnego obrazu
     */
    switchToImageData(imageIndex) {
        // Wyczyść aktualną wizualizację
        this.clearVisualization();
        
        // Załaduj dane dla nowego obrazu
        const data = this.imageData[imageIndex] || { points: [], lines: [], surfaces: [] };
        
        // Odtwórz wizualizację punktów
        data.points.forEach(point => {
            this.createPointVisual(point);
        });
        
        // Odtwórz wizualizację linii
        data.lines.forEach(line => {
            this.createLineVisual(line);
        });
        
        // Odtwórz wizualizację powierzchni
        data.surfaces.forEach(surface => {
            this.recreateSurfaceVisual(surface);
        });
        
        console.log(`🔄 Przełączono na dane obrazu ${imageIndex}: ${data.points.length} punktów, ${data.lines.length} linii, ${data.surfaces.length} powierzchni`);
    }
    
    /**
     * Czyści wizualizację bez usuwania danych
     */
    clearVisualization() {
        this.pointsGroup.clear();
        this.linesGroup.clear();
        this.surfacesGroup.clear();
        this.helpersGroup.clear();
        this.dimensionsGroup.clear();
    }

    /**
     * Odtwarza wizualizację powierzchni na podstawie danych
     */
    recreateSurfaceVisual(surfaceData) {
        // Pobierz punkty powierzchni
        const surfacePoints = [];
        surfaceData.pointIds.forEach(pointId => {
            const point = this.points.find(p => p.id === pointId);
            //dodane 12.10
            if (point) {
                surfacePoints.push(point.position);
            }
        });
        
        if (surfacePoints.length < 3) return;
        
        // Tworzenie geometrii
        const vertices = [];
        surfacePoints.forEach(pos => {
            vertices.push(pos.x, pos.y, pos.z);
        });
        
        const indices = [];
        for (let i = 1; i < surfacePoints.length - 1; i++) {
            indices.push(0, i, i + 1);
        }
        
        // Geometria powierzchni
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        // Materiał powierzchni
        const material = new THREE.MeshBasicMaterial({
            color: surfaceData.color || 0x00FF00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.3,
            wireframe: false
        });
        
        const surface = new THREE.Mesh(geometry, material);
        surface.userData = { surfaceId: surfaceData.id };
        this.surfacesGroup.add(surface);
        
        // Aktualizuj referencję do mesh
        surfaceData.mesh = surface;
    }

    // **************************
    // ********** MOJE **********
    // **************************

    static STANDARD_DOOR_WIDTH_CM = 80; // standardowa szerokość drzwi w cm

    generateRoomPlanImage() {
        const canvasSize = 800;
        const margin = 50;

        const canvas = document.createElement('canvas');
        canvas.width = canvasSize;
        canvas.height = canvasSize;
        const ctx = canvas.getContext('2d');

        // Tło
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Skala "J" -> piksele (używamy stałej skali z geometrii; kalibrację pominięto celowo)
        const scaleJ = 1; // jednostki "j"

        // Dane bieżącego obrazu
        const currentData = this.getCurrentImageData();
        const surfaces = this.surfaces; // getter per-obraz
        const openings = (currentData && currentData.openings) ? currentData.openings : [];

        if (!surfaces || surfaces.length === 0) {
            this.showMessage('Brak powierzchni do narysowania', 'warning');
            return;
        }

        // Dodaj tytuł
        const currentImage = this.loadedImages.find(img => img.id === this.currentImageIndex);
        if (currentImage) {
            // Usuń rozszerzenie z nazwy pliku
            const title = currentImage.name.replace(/\.[^/.]+$/, '');
            // Dodaj podpis
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(title, canvas.width / 2, margin / 2);
        }

        // Zbierz wszystkie punkty z powierzchni (do ustalenia zakresów)
        const allSurfacePoints = [];
        surfaces.forEach(surface => {
            surface.pointIds.forEach(id => {
                const p = this.points.find(pt => pt.id === id);
                if (p) allSurfacePoints.push(p.position);
            });
        });

        if (allSurfacePoints.length < 2) {
            this.showMessage('Za mało punktów do utworzenia rzutu', 'warning');
            return;
        }

        // Zakresy z powierzchni
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        allSurfacePoints.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        });

        // Rozszerz zakresy o punkty otworów (żeby nic nie wyleciało poza płótno)
        openings.forEach(op => {
            (op.points || []).forEach(p => {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.z < minZ) minZ = p.z;
                if (p.z > maxZ) maxZ = p.z;
            });
        });

        // Skala rysunku
        const rangeX = maxX - minX || 1;
        const rangeZ = maxZ - minZ || 1;
        const roomSize = Math.max(rangeX, rangeZ);
        const pixelsPerUnit = (canvasSize - 2 * margin) / roomSize;

        // Funkcje pomocnicze do projekcji na 2D (XZ -> płótno)
        const toPx = x => (x - minX) * pixelsPerUnit + margin;
        const toPy = z => canvas.height - ((z - minZ) * pixelsPerUnit + margin);

        // --- Rysowanie ścian (powierzchni) ---
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;

        surfaces.forEach(surface => {
            // Ścieżka wielokąta
            ctx.beginPath();
            surface.pointIds.forEach((id, index) => {
                const pt = this.points.find(p => p.id === id);
                if (!pt) return;
                const px = toPx(pt.position.x);
                const py = toPy(pt.position.z);
                if (index === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
            ctx.closePath();
            ctx.stroke();

            // Wymiary dla każdego boku (w "j")
            const ids = surface.pointIds;
            ctx.fillStyle = '#d32f2f';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            for (let i = 0; i < ids.length; i++) {
                const id1 = ids[i];
                const id2 = ids[(i + 1) % ids.length];
                const p1 = this.points.find(p => p.id === id1);
                const p2 = this.points.find(p => p.id === id2);
                if (!p1 || !p2) continue;

                // Dystans 3D w jednostkach "j"
                const distJ = p1.position.distanceTo(p2.position) * scaleJ;

                // Środek boku (w rzucie)
                const mx = toPx((p1.position.x + p2.position.x) / 2);
                const my = toPy((p1.position.z + p2.position.z) / 2);

                ctx.fillText(`${distJ.toFixed(1)} j`, mx, my - 6);
            }
        });


    // Rysowanie otworów: okna/drzwi
    if (openings.length) {
        openings.forEach(opening => {
            const pts = opening.points || [];
            if (pts.length < 2) return;

            // Kolor wypełnienia wg typu
            if (opening.type === 'window') ctx.fillStyle = 'rgba(0, 128, 255, 0.5)';
            else if (opening.type === 'door') ctx.fillStyle = 'rgba(139, 69, 19, 0.5)';
            else ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';

            // Wielokąt otworu
            ctx.beginPath();
            pts.forEach((p, idx) => {
                const x = toPx(p.x);
                const y = toPy(p.z);
                if (idx === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.closePath();
            ctx.fill();

            // Środek (do etykiet)
            const center = pts.reduce((acc, p) => {
                acc.x += toPx(p.x);
                acc.y += toPy(p.z);
                return acc;
            }, { x: 0, y: 0 });
            center.x /= pts.length;
            center.y /= pts.length;

            // Nazwa
            ctx.fillStyle = '#000';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            const name = opening.properties?.name || opening.type;
            ctx.fillText(name, center.x, center.y - 12);

            // Wymiary otworu (szer. × wys. w "j")
            let widthJ = null, heightJ = null;

            // 1) Jeśli eksport zawiera wymiary 3D – użyj ich
            if (opening.dimensions && typeof opening.dimensions.width === 'number' && typeof opening.dimensions.height === 'number') {
                widthJ = opening.dimensions.width;
                heightJ = opening.dimensions.height;
            } else {
                // 2) W przeciwnym razie oszacuj z bounding box w rzucie XZ
                const xs = pts.map(p => p.x);
                const zs = pts.map(p => p.z);
                const dxPixels = (Math.max(...xs) - Math.min(...xs)) * pixelsPerUnit;
                const dzPixels = (Math.max(...zs) - Math.min(...zs)) * pixelsPerUnit;

                // Zamiana z pikseli na jednostki "j"
                widthJ = dxPixels / pixelsPerUnit;
                heightJ = dzPixels / pixelsPerUnit;
            }

            if (isFinite(widthJ) && isFinite(heightJ)) {
                ctx.fillText(`${widthJ.toFixed(1)} × ${heightJ.toFixed(1)} j`, center.x, center.y + 6);
            }
        });
    }

    // Eksport PNG
    const link = document.createElement('a');
    const imageData = this.loadedImages.find(img => img.id === this.currentImageIndex);
    if (imageData) {
        // Usuń rozszerzenie z nazwy pliku
        const roomName = imageData.name.replace(/\.[^/.]+$/, '');
        link.download = `rzut-pomieszczenia-${roomName}.png`;
    } else {
        link.download = 'rzut-pomieszczenia.png';
    }
    link.href = canvas.toDataURL('image/png');
    link.click();

    this.showMessage('✅ Wygenerowano rzut jako PNG', 'success');
}

    // ***************************
    // *** OPEN CV (auto rzut) ***
    // ***************************

    _pointInPolygon(pt, poly) {
    // ray casting
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < (xj - xi) * (pt.y - yi) / ((yj - yi) || 1e-9) + xi);
        if (intersect) inside = !inside;
        }
        return inside;
    }

    _bbox2D(pts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        }
        return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }

    async generateAutoRoomPlanImage() {
        if (!this._cvReady || !window.cv) {
            this.showMessage('OpenCV jeszcze się ładuje… spróbuj ponownie za moment.', 'warning');
            return;
        }

        // 1) Źródło obrazu z aktualnej panoramy/tekstury
        const tex = this.panoramaTexture || this.texture || null;
        const srcImg = tex && tex.image ? tex.image : null;
        if (!srcImg || !srcImg.naturalWidth) {
            this.showMessage('Brak obrazu do analizy (nie wczytano panoramy).', 'warning');
            return;
        }

        // 2) Canvas roboczy (skalujemy dla szybkości)
        const maxW = 1280;
        const sc = Math.min(1, maxW / srcImg.naturalWidth);
        const W = Math.round(srcImg.naturalWidth * sc);
        const H = Math.round(srcImg.naturalHeight * sc);

        this._cvCanvas.width = W;
        this._cvCanvas.height = H;
        this._cvCanvasCtx.drawImage(srcImg, 0, 0, W, H);

        // 3) OpenCV: gray → blur → Canny → close → kontury
        const cv = window.cv;
        const src = cv.imread(this._cvCanvas);
        const gray = new cv.Mat();
        const blurred = new cv.Mat();
        const edges = new cv.Mat();
        const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
        cv.Canny(blurred, edges, 60, 160);
        cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);

        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(edges, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

        // 4) Największy sensowny wielokąt = obrys pokoju
        let roomPoly = null, roomAreaMax = 0;
        for (let i = 0; i < contours.size(); i++) {
            const c = contours.get(i);
            const peri = cv.arcLength(c, true);
            const approx = new cv.Mat();
            cv.approxPolyDP(c, approx, 0.02 * peri, true);
            const area = Math.abs(cv.contourArea(approx, true));
            if (area < 1000) { approx.delete(); continue; } // odrzucamy szum
            if (approx.rows >= 3 && area > roomAreaMax) {
            const pts = [];
            for (let r = 0; r < approx.rows; r++) {
                pts.push({ x: approx.intPtr(r, 0)[0], y: approx.intPtr(r, 0)[1] });
            }
            roomPoly = pts;
            roomAreaMax = area;
            }
            approx.delete();
        }
        if (!roomPoly) { // fallback – prostokąt obrazu
            roomPoly = [{x:10,y:10},{x:W-10,y:10},{x:W-10,y:H-10},{x:10,y:H-10}];
            roomAreaMax = (W-20)*(H-20);
        }

        // 5) Otwory = mniejsze prostokątne kontury wewnątrz pokoju
        const openings = [];
        for (let i = 0; i < contours.size(); i++) {
            const c = contours.get(i);
            const peri = cv.arcLength(c, true);
            const approx = new cv.Mat();
            cv.approxPolyDP(c, approx, 0.02 * peri, true);
            const area = Math.abs(cv.contourArea(approx, true));

            if (area < 200 || area > roomAreaMax * 0.35) { approx.delete(); continue; }
            if (approx.rows === 4) {
            const pts = [];
            for (let r = 0; r < approx.rows; r++) {
                pts.push({ x: approx.intPtr(r, 0)[0], y: approx.intPtr(r, 0)[1] });
            }
            // centroid wewnątrz pokoju?
            const cx = pts.reduce((s,p)=>s+p.x,0)/4;
            const cy = pts.reduce((s,p)=>s+p.y,0)/4;
            if (this._pointInPolygon({x:cx,y:cy}, roomPoly)) {
                // klasyfikacja drzwi/okno – prosta heurystyka aspect ratio
                const bb = this._bbox2D(pts);
                const ratio = bb.width / Math.max(bb.height, 1);
                const type = (ratio < 0.6 || ratio > 1.7) ? 'door' : 'window';
                openings.push({ type, points: pts });
            }
            }
            approx.delete();
        }

        // 6) Render planu 2D i eksport PNG
        const planSize = 900, margin = 60;
        const plan = document.createElement('canvas');
        plan.width = planSize; plan.height = planSize;
        const ctx = plan.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0,0,plan.width,plan.height);

        // Tytuł = nazwa obecnego zdjęcia (jeśli masz)
        const currentImage = this.loadedImages?.find(img => img.id === this.currentImageIndex);
        if (currentImage) {
            const title = currentImage.name.replace(/\.[^/.]+$/, '');
            ctx.fillStyle = '#000'; ctx.font = 'bold 24px Arial'; ctx.textAlign='center'; ctx.textBaseline='top';
            ctx.fillText(title, plan.width/2, 18);
        }

        // fit do płótna
        const allPts = [...roomPoly, ...openings.flatMap(o => o.points)];
        const bb = this._bbox2D(allPts);
        const roomRange = Math.max(bb.width || 1, bb.height || 1);
        const PPU = (planSize - 2*margin) / roomRange;
        const toPx = x => (x - bb.minX) * PPU + margin;
        const toPy = y => plan.height - ((y - bb.minY) * PPU + margin);

        // Obrys pokoju
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
        ctx.beginPath();
        roomPoly.forEach((p,i)=>{
            const X = toPx(p.x), Y = toPy(p.y);
            if (i===0) ctx.moveTo(X,Y); else ctx.lineTo(X,Y);
        });
        ctx.closePath(); ctx.stroke();

        // Wymiary boków (w pikselach obrazu – bez kalibracji metrów)
        ctx.fillStyle = '#d32f2f'; ctx.font = '14px Arial'; ctx.textAlign='center';
        for (let i=0;i<roomPoly.length;i++){
            const a = roomPoly[i], b = roomPoly[(i+1)%roomPoly.length];
            const d = Math.hypot(b.x-a.x, b.y-a.y);
            const mx = toPx((a.x+b.x)/2), my = toPy((a.y+b.y)/2);
            ctx.fillText(`${d.toFixed(0)} px`, mx, my-6);
        }

        // Otwory
        openings.forEach(o=>{
            ctx.beginPath();
            o.points.forEach((p,idx)=>{
            const X = toPx(p.x), Y = toPy(p.y);
            if (idx===0) ctx.moveTo(X,Y); else ctx.lineTo(X,Y);
            });
            ctx.closePath();
            ctx.fillStyle = (o.type==='window') ? 'rgba(0,128,255,0.45)' : 'rgba(139,69,19,0.45)';
            ctx.fill();

            const cx = o.points.reduce((s,p)=>s+toPx(p.x),0)/o.points.length;
            const cy = o.points.reduce((s,p)=>s+toPy(p.y),0)/o.points.length;
            ctx.fillStyle = '#000'; ctx.font = '12px Arial'; ctx.textAlign='center';
            ctx.fillText(o.type, cx, cy-10);

            const ob = this._bbox2D(o.points);
            ctx.fillText(`${ob.width.toFixed(0)} × ${ob.height.toFixed(0)} px`, cx, cy+8);
        });

        // Eksport PNG
        const a = document.createElement('a');
        a.download = 'rzut-pomieszczenia-auto.png';
        a.href = plan.toDataURL('image/png');
        a.click();

        // cleanup
        src.delete(); gray.delete(); blurred.delete(); edges.delete();
        contours.delete(); hierarchy.delete(); kernel.delete();
        }

        async autoDetectRoomLayout() {
            if (!this.loadedImages[this.currentImageIndex]) {
                this.showMessage('Brak obrazu do analizy (nie wczytano panoramy).', 'error');
                return;
            }

            const imgElement = this.loadedImages[this.currentImageIndex].image;
            const src = cv.imread(imgElement);
            let gray = new cv.Mat();
            let edges = new cv.Mat();
            let contours = new cv.MatVector();
            let hierarchy = new cv.Mat();

            try {
                // 1) Konwersja do grayscale
                cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

                // 2) Wygładzanie + Canny
                cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 1.5, 1.5, cv.BORDER_DEFAULT);
                cv.Canny(gray, edges, 50, 150);

                // 3) Kontury
                cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

                console.log(`🔍 Wykryto ${contours.size()} konturów`);

                // 4) Wyczyszczenie dotychczasowych punktów/linii
                this.points.length = 0;
                this.lines.length = 0;

                // 5) Konwersja konturów na punkty w Twoim systemie
                for (let i = 0; i < contours.size(); i++) {
                    let cnt = contours.get(i);

                    // Opcjonalnie pomijaj bardzo małe kontury
                    if (cv.contourArea(cnt) < 5000) continue;

                    // Przybliż kontur do wielokąta
                    let approx = new cv.Mat();
                    cv.approxPolyDP(cnt, approx, 10, true);

                    let pointIds = [];
                    for (let j = 0; j < approx.rows; j++) {
                        let p = {
                            id: `auto-p${this.points.length}`,
                            position: new THREE.Vector3(approx.data32S[j*2], 0, approx.data32S[j*2+1]) // rzut 2D: x,z
                        };
                        this.points.push(p);
                        pointIds.push(p.id);
                    }

                    // Dodaj linie pomiędzy kolejnymi punktami
                    for (let j = 0; j < pointIds.length; j++) {
                        let line = {
                            id: `auto-l${this.lines.length}`,
                            pointId1: pointIds[j],
                            pointId2: pointIds[(j+1)%pointIds.length]
                        };
                        this.lines.push(line);
                    }

                    approx.delete();
                }

                this.showMessage('Automatycznie wykryto kształt pomieszczenia.', 'success');

            } finally {
                src.delete(); gray.delete(); edges.delete(); contours.delete(); hierarchy.delete();
            }
        }

    // ***********************************
    // ********* KONIEC OPEN CV **********
    // ***********************************

}

// ***********************************
// ********** KONIEC MOJEGO **********
// ***********************************

// Inicjalizacja po załadowaniu strony
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Uruchamianie Simple 360° Viewer...');
    
    // Sprawdź czy Three.js jest załadowane
    if (typeof THREE === 'undefined') {
        console.error('❌ Three.js nie jest załadowane!');
        alert('Błąd: Biblioteka Three.js nie została załadowana. Sprawdź połączenie internetowe.');
        return;
    }
    
    // Utwórz instancję aplikacji
    window.viewer = new Simple360Viewer();

    console.log('✅ Simple 360° Viewer uruchomiony');
});

// Eksport dla użycia w innych modułach
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Simple360Viewer;
}
