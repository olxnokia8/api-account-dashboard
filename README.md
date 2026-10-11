# Status Konta AI — PWA (OpenRouter + OpenAI)

Aplikacja webowa (PWA) do sprawdzania bieżącego stanu konta: **salda kredytów OpenRouter** oraz **zużycia OpenAI** w wybranym okresie. Działa na telefonie i komputerze, można ją zainstalować jako aplikację.

## Co pokazuje

| Dostawca | Co jest sprawdzane | Skąd dane |
|---|---|---|
| **OpenRouter** | Saldo konta ($), doładowano łącznie, zużycie łącznie / dzisiaj / tydzień / miesiąc, limit klucza + pozostałość, darmowy/płatny tier, rate limit | `GET /api/v1/credits` (rzeczywiste saldo konta) + `GET /api/v1/key` (limit klucza i statystyki zużycia) |
| **OpenAI** | Sumaryczne zużycie $ w okresie (7/30/90 dni / YTD), wykres dziennych kosztów, rozbicie wg modeli | `GET https://api.openai.com/v1/usage/daily_costs` |

> ⚠️ OpenAI **nie udostępnia pozostałego salda kredytów przez API** — pokazywane jest zużycie w wybranym okresie. Dokładne saldo znajdziesz w panelu: https://platform.openai.com/billing

> ⚠️ **Ważne (OpenRouter):** endpointy `/auth/key` oraz `/key` podają **limit wydatków przypisany do klucza** (per-key cap), a nie saldo konta. Rzeczywiste saldo = `total_credits - total_usage` z endpointu `/api/v1/credits`. Aplikacja woła oba endpointy i pokazuje saldo konta jako główną liczbę — jeśli widzisz wartość różną od panelu, sprawdź czy to nie limit klucza.

## Historia zmian
- **v1.3 (październik 2026):** Dodano obsługę własnego proxy (ustawienia z adresem Cloudflare Worker) oraz automatyczny baner diagnostyczny. Poprawiono instrukcję wdrożenia — Netlify Drop wdraża tylko pliki statyczne (bez funkcji), dlatego OpenAI wymaga CLI/Git lub zewnętrznego proxy. Dołączono `cloudflare-worker-proxy.js`.
- **v1.2 (październik 2026):** Naprawiono błąd `Cannot read properties of null (reading 'error')` przy OpenAI — dodano null-guardy w funkcji serwerowej i w frontendu.
- **v1.1 (październik 2026):** Naprawiono rozbieżność salda OpenRouter — dodano endpoint `/api/v1/credits`. Główna liczba to saldo konta, a nie limit klucza.
- **v1.0:** Pierwsza wersja.

## Bezpieczeństwo

- Klucze API **nigdy nie są zapisywane** (nie ma localStorage, ciasteczek, logów). Są przechowywane tylko w pamięci karty przeglądarki — po odświeżeniu trzeba wpisać ponownie.
- Klucz jest wysyłany **tylko** do oficjalnego API (`openrouter.ai` / `api.openai.com`) — bezpośrednio z przeglądarki lub przez Twoją własną instancję funkcji Netlify.
- Żaden serwer trzecich nie widzi Twoich kluczy. Wdróż aplikację na własnym hostingu, aby mieć pełną kontrolę.

## Struktura plików

```
ai-status-pwa/
├── index.html                  ← główny interfejs (cały UI + logika JS)
├── manifest.json               ← manifest PWA
├── sw.js                       ← service worker (offline, cache)
├── netlify.toml                ← konfiguracja Netlify (funkcje + nagłówki)
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-maskable-512.png
├── netlify/
│   └── functions/
│       ├── openrouter-status.js  ← proxy OpenRouter
│       └── openai-status.js      ← proxy OpenAI (wymagane z powodu CORS)
└── README.md
```

## Wdrożenie

> ⚠️ **Ważne:** odczyt zużycia **OpenAI wymaga proxy** (api.openai.com blokuje CORS). **OpenRouter działa wszędzie** bez proxy. Wybierz jedną z dwóch metod:

### Metoda A — pełne wdrożenie z funkcjami (Netlify CLI lub Git, darmowe)

Daje pełne wsparcie OpenAI bez dodatkowej konfiguracji.

1. Rozpakuj ZIP.
2. Zainstaluj Netlify CLI: `npm install -g netlify-cli`
3. W folderze `ai-status-pwa` uruchom:
   ```
   netlify login
   netlify deploy --prod
   ```
4. Gotowe — dostaniesz adres aplikacji, funkcje serwerowe działają automatycznie.

Alternatywnie: wypchnij folder na GitHub/GitLab i połącz repozytorium z Netlify (Build settings: puste, Publish directory: `.`).

### Metoda B — najszybsza (Netlify Drop + Cloudflare Worker proxy)

Jeśli nie chcesz używać konsoli:

1. Rozpakuj ZIP i przeciągnij folder na **https://app.netlify.com/drop** — aplikacja żyje (OpenRouter działa od razu).
2. Wdróż proxy: zaloguj się na **https://dash.cloudflare.com** → Workers & Pages → Create → Worker → „Edit code" → wklej zawartość pliku **`cloudflare-worker-proxy.js`** → Deploy.
3. Skopiuj adres worker-a (np. `https://ai-status-proxy.twoj-konto.workers.dev`).
4. W aplikacji kliknij **Ustawienia** → wklej adres proxy → Zapisz. Od teraz OpenAI też działa.

Aplikacja sama wykrywa brak proxy i pokazuje żółty baner z instrukcją.

### Instalacja jako aplikacja (PWA)
- **Android / Chrome**: menu (⋮) → „Zainstaluj aplikację" lub przycisk „Zainstaluj aplikację" w interfejsie.
- **iOS / Safari**: przycisk Udostępnij → „Dodaj do ekranu głównego".
- **Desktop (Chrome/Edge)**: ikona instalacji w pasku adresu.

## Działanie bez Netlify (hosting statyczny)

Jeśli wdrożysz tylko pliki statyczne (np. na GitHub Pages, Vercel static, Cloudflare Pages):
- ✅ **OpenRouter** działa — API obsługuje CORS, więc wywołanie idzie bezpośrednio z przeglądarki.
- ⚠️ **OpenAI** **nie zadziała** bezpośrednio (api.openai.com blokuje CORS). Aplikacja pokaże czytelny komunikat z linkiem do panelu rozliczeniowego. Aby odczytywać zużycie OpenAI, potrzebujesz proxy (np. wspomniane funkcje Netlify).

## Rozwiązywanie problemów

| Objaw | Przyczyna / rozwiązanie |
|---|---|
| OpenRouter: „Nieprawidłowy klucz (401)" | Sprawdź czy klucz zaczyna się od `sk-or-v1-` i został skopiowany w całości. |
| OpenAI: błąd 401/403 | Twój klucz nie ma uprawnień do odczytu kosztów. OpenAI ograniczyło ten endpoint — użyj klucza organizacyjnego z pełnymi uprawnieniami lub sprawdź saldo w panelu. |
| OpenAI: „Połączenie bezpośrednie zablokowane (CORS)" | Wdróż na Netlify (funkcje serwerowe rozwiązują CORS). |
| PWA nie chce się instalować | Upewnij się, że strona jest po HTTPS i że `manifest.json` oraz `sw.js` są dostępne (sprawdź konsolę DevTools → Application). |
| Złe kwoty w OpenAI | Endpoint zwraca koszty w USD. Jeśli wartości wyglądają na przesunięcie o ×100, oznacza to zmianę po stronie OpenAI — daj znać, zaktualizuję przelicznik. |

## Dostosowywanie

- **Zakres domyślny OpenAI**: zmień `selected` w `<select id="range-oai">` w `index.html`.
- **Auto-odświeżanie**: interwał 60 s — zmień wartość `60000` w `index.html` (szukaj `setInterval`).
- **Inne hosty funkcji**: zmień ścieżki `/.netlify/functions/...` w `index.html` na swoje endpointy proxy.

---
*Wersja 1.0 — październik 2026*
