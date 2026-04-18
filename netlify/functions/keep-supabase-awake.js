const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

async function pingSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      ok: false,
      statusCode: 500,
      body: {
        ok: false,
        message: "Missing SUPABASE_URL or SUPABASE_ANON_KEY.",
      },
    };
  }

  const url = new URL("/rest/v1/fee_payments", SUPABASE_URL);
  url.searchParams.set("select", "id");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  const text = await response.text();

  return {
    ok: response.ok,
    statusCode: response.ok ? 200 : response.status,
    body: {
      ok: response.ok,
      status: response.status,
      message: response.ok ? "Supabase keepalive query succeeded." : "Supabase keepalive query failed.",
      response: text.slice(0, 500),
      checkedAt: new Date().toISOString(),
    },
  };
}

export default async function handler() {
  try {
    const result = await pingSupabase();

    return new Response(JSON.stringify(result.body), {
      status: result.statusCode,
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        message: "Unexpected keepalive error.",
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      }
    );
  }
}

export const config = {
  schedule: "@daily",
};
