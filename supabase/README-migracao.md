# Painel de Migração — arquivos para subir no seu Supabase

Você escolheu **não ativar o Lovable Cloud**. Estes arquivos rodam no
**seu** projeto Supabase. Suba assim:

## Pré-requisitos

- Supabase CLI instalado: <https://supabase.com/docs/guides/cli>
- Projeto criado em supabase.com e logado: `supabase login`
- Pegue o `<PROJECT_REF>` em Project Settings → General → Reference ID
- Edite `supabase/config.toml` e troque `project_id = "painel-migracao"`
  pelo seu ref, se quiser usar `supabase link`.

## Passos

```bash
# 1) Conectar este diretório ao seu projeto
supabase link --project-ref <PROJECT_REF>

# 2) Aplicar a migração que cria a função exec_sql
supabase db push

# 3) Subir as Edge Functions (verify_jwt = false já está no config.toml)
supabase functions deploy migrate-sql
supabase functions deploy painel-migracao
```

## Endpoints disponíveis depois do deploy

- `POST https://<PROJECT_REF>.functions.supabase.co/migrate-sql`
  Body: `{ "key": "<service_role_key>", "sql_query": "SELECT ..." }`
- `GET  https://<PROJECT_REF>.functions.supabase.co/painel-migracao`
  Retorna `project_url`, `anon_key`, `service_role_key`, `edge_functions`,
  `secrets`, `database_tables`.

## Segurança

- `exec_sql` recusa qualquer caller que não seja `service_role`.
- Ambas as Edge Functions estão com `verify_jwt = false` (públicas).
  **Apague tudo isso assim que a migração terminar**: remova as duas
  funções (`supabase functions delete ...`) e drope a função SQL
  (`DROP FUNCTION public.exec_sql(text);`).
- O endpoint `painel-migracao` expõe a `service_role_key` por design —
  ele só deve existir durante a janela de migração.