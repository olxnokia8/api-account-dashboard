// netlify/functions/openrouter-status.js
// Proxy sprawdzające saldo OpenRouter. Woła DWA endpointy i scala dane:
//   1) GET https://openrouter.ai/api/v1/key      -> limit per-key, limit_remaining, usage (dzień/tydzień/miesiąc)
//   2) GET https://openrouter.ai/api/v1/credits  -> total_credits, total_usage (RZECZYWISTE SALDO KONTA)
// Użycie: POST /.netlify/functions/openrouter-status  { "key": "sk-or-v1-..." }
//
// Dlaczego dwa? /auth/key oraz /key podają limit wydatków przypisany do KLUCZA
// (per-key cap), a nie saldo konta. Rzeczywiste saldo = total_credits - total_usage
// z endpointu /credits. Aplikacja pokazuje saldo konta jako główną liczbę, a limit
// klucza i statystyki zużycia osobno.

exports.handler = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Nieprawidłowy JSON" }) };
  }

  const key = (body.key || "").trim();
  if (!key) {
    return { statusCode: 400, body: JSON.stringify({ error: "Brak klucza API" }) };
  }

  const headers = {
    "Authorization": "Bearer " + key,
    "Content-Type": "application/json",
    "User-Agent": "ai-status-pwa/1.1"
  };

  try {
    // Wołamy oba endpointy równolegle
    const [resKey, resCredits] = await Promise.all([
      fetch("https://openrouter.ai/api/v1/key", { method: "GET", headers }),
      fetch("https://openrouter.ai/api/v1/credits", { method: "GET", headers })
    ]);

    const keyData = await resKey.json().catch(() => null);
    const creditsData = await resCredits.json().catch(() => null);

    // Jeśli klucz jest nieprawidłowy, oba odpowiedzi będą 401 — zwróć błąd.
    if (!resKey.ok && !resCredits.ok) {
      const msg = (keyData && keyData.error && keyData.error.message) ||
                  (creditsData && creditsData.error && creditsData.error.message) ||
                  "Błąd " + resKey.status;
      return { statusCode: resKey.status || 401, body: JSON.stringify({ error: msg, status: resKey.status }) };
    }

    const merged = {
      key: keyData && keyData.data ? keyData.data : null,
      credits: creditsData && creditsData.data ? creditsData.data : null
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify(merged)
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Błąd połączenia z OpenRouter: " + err.message })
    };
  }
};
