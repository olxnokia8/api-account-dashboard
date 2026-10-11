// ============================================================
//  Proxy dla aplikacji "Status Konta AI" (OpenRouter + OpenAI)
//  Platforma: Cloudflare Workers (darmowy plan wystarcza)
// ============================================================
//
//  JAK WDRÓŻYĆ (2 minuty, bez konsoli):
//  1. Zaloguj się na https://dash.cloudflare.com
//  2. Workers & Pages → Create → Worker → wpisz nazwę → Deploy
//  3. Kliknij „Edit code" / „Edytuj kod", wklej CAŁY ten plik, zapisz (Deploy).
//  4. Skopiuj adres worker-a, np. https://ai-status-proxy.twoj-konto.workers.dev
//  5. W aplikacji (Ustawienia zaawansowane) wklej ten adres w pole „Adres proxy".
//
//  Endpointy (oba POST, JSON w body):
//    POST /openrouter   { "key": "sk-or-v1-..." }
//    POST /openai       { "key": "sk-...", "range": "7"|"30"|"90"|"ytd" }
//
//  Bezpieczeństwo: to Twój własny worker. Klucze przechodzą przez niego
//  (są wymagane do autoryzacji u dostawcy), ale nigdzie nie są zapisywane
//  ani logowane. Możesz sam zweryfikować kod poniżej.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS }
  });
}

function computeRange(range) {
  const end = new Date();
  let start;
  if (range === "ytd") {
    start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
  } else {
    start = new Date(end.getTime() - (Number(range) || 30) * 86400000);
  }
  const iso = d => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

export default {
  async fetch(request) {
    // Preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== "POST") {
      return json(405, { error: "Dozwolona tylko metoda POST" });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json(400, { error: "Nieprawidłowy JSON w body" });
    }

    const key = (body.key || "").trim();
    if (!key) {
      return json(400, { error: "Brak klucza API" });
    }

    try {
      // ---- OPENROUTER: /key + /credits (równolegle) ----
      if (path.endsWith("/openrouter")) {
        const h = { "Authorization": "Bearer " + key, "Content-Type": "application/json" };
        const [resKey, resCredits] = await Promise.all([
          fetch("https://openrouter.ai/api/v1/key", { headers: h }),
          fetch("https://openrouter.ai/api/v1/credits", { headers: h })
        ]);
        const keyData = await resKey.json().catch(() => null);
        const creditsData = await resCredits.json().catch(() => null);

        if (!resKey.ok && !resCredits.ok) {
          const msg =
            (keyData && keyData.error && keyData.error.message) ||
            (creditsData && creditsData.error && creditsData.error.message) ||
            ("Błąd " + resKey.status);
          return json(resKey.status || 401, { error: msg, status: resKey.status });
        }

        return json(200, {
          key: keyData && keyData.data ? keyData.data : null,
          credits: creditsData && creditsData.data ? creditsData.data : null
        });
      }

      // ---- OPENAI: /usage/daily_costs ----
      if (path.endsWith("/openai")) {
        const { start, end } = computeRange(body.range);
        const res = await fetch(
          "https://api.openai.com/v1/usage/daily_costs?start_date=" + start + "&end_date=" + end,
          { headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" } }
        );
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          let msg = "Błąd HTTP " + res.status;
          if (data && data.error) {
            msg = (typeof data.error === "string") ? data.error : (data.error.message || msg);
          }
          if (res.status === 401 || res.status === 403) {
            msg = "Ten klucz API nie ma uprawnień do odczytu kosztów (HTTP " + res.status +
              "). OpenAI ograniczyło programowy dostęp do danych rozliczeniowych — " +
              "sprawdź saldo w panelu: https://platform.openai.com/billing";
          }
          return json(res.status, { error: msg, status: res.status });
        }

        return json(200, data || { data: [], object: "list" });
      }

      return json(404, { error: "Nieznany endpoint. Użyj /openrouter lub /openai." });
    } catch (e) {
      return json(502, { error: "Błąd proxy: " + e.message });
    }
  }
};
