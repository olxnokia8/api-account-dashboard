// netlify/functions/openai-status.js
// Proxy odczytu dziennych kosztów OpenAI: GET https://api.openai.com/v1/usage/daily_costs
// Użycie: POST /.netlify/functions/openai-status  { "key": "sk-...", "range": "7"|"30"|"90"|"ytd" }
//
// Dlaczego proxy jest WYMAGANE dla OpenAI? api.openai.com nie wysyła nagłówków CORS,
// więc bezpośrednie wywołanie z przeglądarki zostanie zablokowane.
// Uwaga: OpenAI ogranicza dostęp do tego endpointu — wiele kluczy (szczególnie
// project-level z ograniczonymi uprawnieniami) dostaje 401/403. W takim wypadku
// aplikacja wyświetla link do panelu rozliczeniowego.

function computeRange(range) {
  const end = new Date();
  let start;
  if (range === "ytd") {
    start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
  } else {
    const days = Number(range) || 30;
    start = new Date(end.getTime() - days * 86400000);
  }
  const iso = d => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

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

  const { start, end } = computeRange(body.range);

  try {
    const url = "https://api.openai.com/v1/usage/daily_costs?start_date=" + start + "&end_date=" + end;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "User-Agent": "ai-status-pwa/1.0"
      }
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      let msg = "Błąd HTTP " + res.status;
      if (data && data.error) {
        msg = (typeof data.error === "string") ? data.error : (data.error.message || msg);
      }
      if (res.status === 401 || res.status === 403) {
        msg = "Ten klucz API nie ma uprawnień do odczytu kosztów (HTTP " + res.status + "). OpenAI ograniczyło programowy dostęp do danych rozliczeniowych — sprawdź saldo w panelu: https://platform.openai.com/billing";
      }
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: msg, status: res.status })
      };
    }

    const payload = data || { data: [], object: "list" };
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify(payload)
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Błąd połączenia z OpenAI: " + err.message })
    };
  }
};
