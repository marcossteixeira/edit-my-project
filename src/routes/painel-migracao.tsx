import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  ShieldAlert,
  Key,
  Download,
  Loader2,
  Code2,
  Database,
  AlertTriangle,
  Info,
} from "lucide-react";

export const Route = createFileRoute("/painel-migracao")({
  component: PainelMigracao,
});

type MigrationData = {
  project_url: string;
  anon_key: string;
  service_role_key: string;
  secrets: Record<string, string>;
  edge_functions: string[];
  edge_functions_count: number;
  database_tables: Array<{
    tablename: string;
    row_count: number;
    column_count: number;
    encrypted_columns: number;
    has_user_id: boolean;
  }>;
};

function mask(value: string) {
  if (!value) return "";
  if (value.length <= 24) return value;
  return `${value.slice(0, 12)}•••••${value.slice(-8)}`;
}

function classifyTable(t: MigrationData["database_tables"][number]) {
  if (t.row_count === 0) return { label: "Ignorar", variant: "secondary" as const };
  if (t.has_user_id || t.encrypted_columns > 0) return { label: "Essencial", variant: "default" as const };
  return { label: "Histórico", variant: "outline" as const };
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        toast.success(label ? `${label} copiado` : "Copiado");
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {label ? <span className="ml-2">{label}</span> : null}
    </Button>
  );
}

function SecretRow({ label, value }: { label: string; value: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded border p-2">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <code className="block truncate text-sm">{show ? value : mask(value)}</code>
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={() => setShow((s) => !s)}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
      <CopyButton value={value} />
    </div>
  );
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function PainelMigracao() {
  const [baseUrl, setBaseUrl] = useState(
    () => (typeof window !== "undefined" && localStorage.getItem("migracao_base_url")) || "",
  );
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MigrationData | null>(null);

  async function revelarTudo() {
    if (!baseUrl) {
      toast.error("Informe a URL do seu Supabase");
      return;
    }
    setLoading(true);
    try {
      localStorage.setItem("migracao_base_url", baseUrl);
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/functions/v1/painel-migracao`, {
        method: "GET",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as MigrationData;
      setData(json);
      toast.success("Dados carregados");
    } catch (e) {
      toast.error(`Falha ao carregar: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  function copiarTudo() {
    if (!data) return;
    const txt = [
      "═══ CREDENCIAIS ═══",
      `Project URL: ${data.project_url}`,
      `Anon Key: ${data.anon_key}`,
      `Service Role Key: ${data.service_role_key}`,
      "",
      "═══ EDGE FUNCTIONS ═══",
      ...data.edge_functions,
      "",
      "═══ SECRETS ═══",
      ...Object.entries(data.secrets).map(([k, v]) => `${k}=${v}`),
      "",
      "═══ TABELAS ═══",
      ...data.database_tables.map(
        (t) => `${t.tablename} (${t.row_count} linhas, ${t.column_count} cols)`,
      ),
    ].join("\n");
    navigator.clipboard.writeText(txt);
    toast.success("Tudo copiado");
  }

  function baixarEdgeFunctions() {
    const mods = import.meta.glob("/supabase/functions/*/index.ts", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const entries = Object.entries(mods);
    if (entries.length === 0) {
      toast.error("Nenhuma edge function encontrada em /supabase/functions");
      return;
    }
    const out = entries
      .map(([path, code]) => {
        const name = path.split("/").slice(-2, -1)[0];
        return `// ═══ ${name} ═══\n${code}`;
      })
      .join("\n\n");
    download("edge-functions.ts", out);
    toast.success(`${entries.length} função(ões) baixadas`);
  }

  function baixarSecrets() {
    if (!data) return;
    const body = Object.entries(data.secrets)
      .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
      .join("\n");
    const file = `export const SECRETS = {\n${body}\n} as const;\n\nexport type SecretKey = keyof typeof SECRETS;\n`;
    download("secrets.ts", file);
    toast.success("secrets.ts baixado");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Painel de Migração</h1>
        <p className="text-muted-foreground">
          Copie os itens abaixo na ordem e cole na extensão CloneSupa.
        </p>
      </header>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Página temporária</AlertTitle>
        <AlertDescription>
          Esta página é pública e expõe sua service role key. Apague a rota e as edge functions
          após a migração.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <Label htmlFor="baseUrl">URL do seu Supabase (https://xxx.supabase.co)</Label>
          <Input
            id="baseUrl"
            placeholder="https://xxxxx.supabase.co"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <div className="flex gap-2">
            <Button onClick={revelarTudo} disabled={loading} size="lg">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Revelar Tudo
            </Button>
            {data ? (
              <Button onClick={copiarTudo} variant="outline" size="lg">
                <Copy className="mr-2 h-4 w-4" /> Copiar Tudo
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Passo 1 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" /> Passo 1 — Credenciais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data ? (
            <>
              <SecretRow label="Project URL" value={data.project_url} />
              <SecretRow label="Anon Key" value={data.anon_key} />
              <SecretRow label="Service Role Key" value={data.service_role_key} />
              <div className="flex flex-wrap gap-2 pt-2">
                <CopyButton value={data.project_url} label="Copiar Project URL" />
                <CopyButton value={data.service_role_key} label="Copiar Service Role Key" />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Clique em Revelar Tudo.</p>
          )}
        </CardContent>
      </Card>

      {/* Passo 2 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5" /> Passo 2 — Edge Functions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data ? (
            <div className="flex flex-wrap gap-2">
              {data.edge_functions.length === 0 ? (
                <span className="text-sm text-muted-foreground">Nenhuma função detectada.</span>
              ) : (
                data.edge_functions.map((n) => <Badge key={n} variant="secondary">{n}</Badge>)
              )}
            </div>
          ) : null}
          <Button onClick={baixarEdgeFunctions} variant="outline">
            <Download className="mr-2 h-4 w-4" /> Baixar edge-functions.ts
          </Button>
        </CardContent>
      </Card>

      {/* Passo 3 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" /> Passo 3 — Secrets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data ? (
            <>
              {Object.keys(data.secrets).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum secret extra.</p>
              ) : (
                Object.entries(data.secrets).map(([k, v]) => (
                  <SecretRow key={k} label={k} value={v} />
                ))
              )}
              <Button onClick={baixarSecrets} variant="outline">
                <Download className="mr-2 h-4 w-4" /> Baixar secrets.ts
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Clique em Revelar Tudo.</p>
          )}
        </CardContent>
      </Card>

      {/* Passo 4 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" /> Passo 4 — Conferência
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data ? (
            <>
              <p className="text-sm">
                Total de tabelas: <strong>{data.database_tables.length}</strong>
              </p>
              <div className="space-y-1">
                {data.database_tables.map((t) => {
                  const c = classifyTable(t);
                  return (
                    <div
                      key={t.tablename}
                      className="flex items-center justify-between rounded border p-2 text-sm"
                    >
                      <span className="font-mono">{t.tablename}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{t.row_count} linhas</span>
                        <Badge variant={c.variant}>{c.label}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Sobre senhas de usuários</AlertTitle>
                <AlertDescription>
                  Senhas são copiadas como hash bcrypt. Se o JWT secret do destino mudar, sessões
                  antigas caem, mas a senha continua válida — o usuário só precisa fazer login de
                  novo.
                </AlertDescription>
              </Alert>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Clique em Revelar Tudo.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}