# Simple 360° Image Viewer

## Opis projektu
Uproszczona wersja aplikacji do wyświetlania obrazów 360° z możliwością dodawania punktów i łączenia ich liniami. 

## Funkcjonalności

### ✅ Zaimplementowane
- **Ładowanie obrazów 360°** - obsługa plików equirectangular
- **Wyświetlanie serii zdjęć** - lista załadowanych obrazów z możliwością przełączania
- **Nawigacja 360°** - obracanie kamerą za pomocą myszy
- **Dodawanie punktów** - klikanie na obrazie w trybie punktów
- **Łączenie punktów liniami** - tworzenie połączeń między punktami
- **Eksport danych** - zapis do pliku JSON
- **Responsywny interfejs** - dostosowuje się do rozmiaru ekranu

### 🔧 Tryby pracy
1. **👁️ Podgląd** - obracanie kamerą, zoom
2. **📍 Punkty** - dodawanie markerów przez kliknięcie
3. **📏 Linie** - łączenie punktów przez kliknięcie na dwa punkty

### ⚙️ Ustawienia
- Rozmiar punktów (0.5 - 3.0)
- Grubość linii (1.0 - 5.0)
- Pokazywanie/ukrywanie pomocników

## Struktura plików
```
simple-360-viewer.html    # Główny plik HTML
simple-360-viewer.css     # Stylizacja interfejsu
simple-360-viewer.js      # Logika aplikacji (Three.js)
```

## Technologie
- **HTML5** - struktura interfejsu
- **CSS3** - stylizacja i responsywność
- **JavaScript ES6** - logika aplikacji
- **Three.js** - renderowanie 3D i obsługa obrazów 360°

## Użycie

1. **Uruchomienie**
   ```bash
   # Uruchom lokalny serwer HTTP
   python -m http.server 8000
   ```
   Następnie otwórz: `http://localhost:8000/simple-360-viewer.html`

2. **Ładowanie zdjęć**
   - Kliknij "Załaduj zdjęcia"
   - Wybierz jeden lub więcej obrazów 360° (format equirectangular)
   - Kliknij na zdjęcie w liście aby je wyświetlić

3. **Dodawanie punktów**
   - Przełącz na tryb "📍 Punkty"
   - Kliknij na obrazie aby dodać punkt
   - Punkty są automatycznie numerowane

4. **Łączenie liniami**
   - Przełącz na tryb "📏 Linie"
   - Kliknij na pierwszy punkt (zaznaczy się na pomarańczowo)
   - Kliknij na drugi punkt (utworzy się linia)

5. **Eksport danych**
   - Kliknij "Eksportuj dane"
   - Pobierze się plik JSON z wszystkimi danymi

## Format eksportowanych danych
```json
{
  "version": "1.0",
  "timestamp": "2025-01-07T12:00:00.000Z",
  "images": [
    {
      "id": 0,
      "name": "room_360.jpg"
    }
  ],
  "points": [
    {
      "id": 0,
      "position": { "x": 10, "y": 20, "z": 30 },
      "imageIndex": 0
    }
  ],
  "lines": [
    {
      "id": 0,
      "pointId1": 0,
      "pointId2": 1,
      "imageIndex": 0
    }
  ],
  "settings": {
    "showHelpers": true,
    "pointSize": 1.0,
    "lineWidth": 2.0
  }
}
```

## Sterowanie
- **Mysz** - obracanie kamerą (tryb podglądu)
- **Kółko myszy** - zoom in/out
- **Lewy klик** - dodawanie punktów lub łączenie linii (w odpowiednich trybach)

## Klawisze skrótów
- **1** - Tryb podglądu
- **2** - Tryb punktów  
- **3** - Tryb linii
- **Del** - Wyczyść punkty
- **Shift+Del** - Wyczyść linie

## Planowane rozszerzenia
- **Importowanie danych** - wczytywanie zapisanych projektów
- **Edycja punktów** - przenoszenie, usuwanie pojedynczych punktów
- **Powierzchnie** - tworzenie wielokątów z punktów
- **Pomiary** - obliczanie odległości i kątów
- **Warstwy** - organizacja elementów w grupy
- **Adnotacje** - dodawanie opisów do punktów

## Wsparcie przeglądarek
- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 80+

## Problemy i rozwiązania

### Zdjęcia się nie ładują
- Sprawdź czy format to equirectangular (panorama 360°)
- Upewnij się że plik nie jest zbyt duży (< 50MB)
- Sprawdź czy przeglądarka obsługuje WebGL

### Aplikacja nie uruchamia się
- Sprawdź czy Three.js jest dostępne (połączenie internetowe)
- Uruchom z lokalnego serwera HTTP, nie bezpośrednio z pliku
- Sprawdź konsolę przeglądarki pod kątem błędów

### Wydajność
- Użyj zdjęć o rozdzielczości max 4K dla lepszej wydajności
- Unikaj dodawania zbyt wielu punktów (> 100)
- Zamknij inne karty przeglądarki zużywające zasoby

## Licencja
Ten projekt jest udostępniony na licencji MIT.

## Autor
Uproszczona wersja 360° Image Viewer - 2025
