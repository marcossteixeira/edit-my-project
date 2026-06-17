import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SYSTEM_VARS = new Set([
  "PATH", "HOME", "DENO_DIR", "HOSTNAME", "PORT", "TMPDIR",
  "USER", "LANG", "TERM", "_", "DENO_REGION", "DENO_DEPLOYMENT_ID",
]);

const KNOWN_FUNCTION_NAMES = ["migrate-sql", "painel-migracao"];

const TABLES_QUERY = `
  SELECT
    c.relname AS tablename,
    COALESCE(s.n_live_tup, 0)::bigint AS row_count,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = c.relname) AS column_count,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = c.relname
        AND (column_name ILIKE '%password%' OR column_name ILIKE '%secret%'
             OR column_name ILIKE '%token%' OR column_name ILIKE '%encrypted%')) AS encrypted_columns,
    EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = c.relname AND column_name = 'user_id') AS has_user_id
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY c.relname
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // Secrets: tudo do ambiente, menos as variáveis de sistema e as três credenciais.
  const allEnv = Deno.env.toObject();
  const secrets: Record<string, string> = {};
  for (const [k, v] of Object.entries(allEnv)) {
    if (SYSTEM_VARS.has(k)) continue;
    if (k.startsWith("XDG_")) continue;
    if (k === "SUPABASE_URL" || k === "SUPABASE_ANON_KEY" || k === "SUPABASE_SERVICE_ROLE_KEY") continue;
    secrets[k] = v;
  }

  // Probe de Edge Functions.
  const probes = await Promise.allSettled(
    KNOWN_FUNCTION_NAMES.map((name) =>
      fetch(`${SUPABASE_URL}/functions/v1/${name}`, { method: "OPTIONS" }).then((r) => ({
        name,
        status: r.status,
      })),
    ),
  );
  const edge_functions = probes
    .filter((p): p is PromiseFulfilledResult<{ name: string; status: number }> =>
      p.status === "fulfilled" && p.value.status < 500,
    )
    .map((p) => p.value.name);

  // Tabelas do banco via exec_sql (com service_role).
  let database_tables: unknown[] = [];
  let database_error: string | null = null;
  if (SERVICE_ROLE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const { data, error } = await supabase.rpc("exec_sql", { sql_query: TABLES_QUERY });
      if (error) database_error = error.message;
      else database_tables = (data as unknown[]) ?? [];
    } catch (e) {
      database_error = (e as Error).message;
    }
  } else {
    database_error = "SUPABASE_SERVICE_ROLE_KEY ausente no ambiente da Edge Function.";
  }

  const body = {
    project_url: SUPABASE_URL,
    anon_key: ANON_KEY,
    service_role_key: SERVICE_ROLE_KEY,
    edge_functions,
    edge_functions_count: edge_functions.length,
    secrets,
    database_tables,
    database_error,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});