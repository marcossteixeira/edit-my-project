import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Wallet,
  HandCoins,
  Search,
  LogOut,
  Pencil,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cobranças — Saiba quem está devendo" },
      {
        name: "description",
        content:
          "Sistema simples de cobrança: cadastre clientes, registre pagamentos parciais e veja rapidamente quem está devendo.",
      },
      { property: "og:title", content: "Cobranças — Saiba quem está devendo" },
      {
        property: "og:description",
        content:
          "Sistema simples de cobrança: cadastre clientes, registre pagamentos parciais e veja rapidamente quem está devendo.",
      },
    ],
  }),
  component: Index,
});

type Status = "pendente" | "pago" | "atrasado" | "parcial";

type Pagamento = {
  id: string;
  valor: number;
  data: string; // ISO
};

type Parcela = {
  id: string;
  numero: number;
  valor: number;
  vencimento?: string; // yyyy-mm-dd
  pagamentos: Pagamento[];
};

type Cobranca = {
  id: string;
  cliente: string;
  contato: string;
  descricao: string;
  valor: number;
  vencimento?: string; // yyyy-mm-dd (vencimento base / 1ª parcela)
  parcelas: Parcela[];
  criadaEm: string;
  aluno?: string;
  endereco?: string;
  serie?: string;
  doColegio?: boolean;
};

const STORAGE_KEY = "cobrancas_v3";
const LEGACY_V2 = "cobrancas_v2";
const LEGACY_V1 = "cobrancas_v1";

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pagoParcela(p: Parcela) {
  return p.pagamentos.reduce((s, x) => s + x.valor, 0);
}

function restanteParcela(p: Parcela) {
  return Math.max(0, p.valor - pagoParcela(p));
}

function totalPago(c: Cobranca) {
  return c.parcelas.reduce((s, p) => s + pagoParcela(p), 0);
}

function restante(c: Cobranca) {
  return Math.max(0, c.valor - totalPago(c));
}

function isVencido(dateStr?: string) {
  if (!dateStr) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(dateStr + "T00:00:00");
  return venc < hoje;
}

function statusParcela(p: Parcela): Status {
  const pago = pagoParcela(p);
  if (pago >= p.valor) return "pago";
  if (isVencido(p.vencimento)) return "atrasado";
  if (pago > 0) return "parcial";
  return "pendente";
}

function computeStatus(c: Cobranca): Status {
  const pago = totalPago(c);
  if (pago >= c.valor) return "pago";
  const algumaAtrasada = c.parcelas.some(
    (p) => restanteParcela(p) > 0 && isVencido(p.vencimento),
  );
  if (algumaAtrasada) return "atrasado";
  if (pago > 0) return "parcial";
  return "pendente";
}

function addMonths(dateStr: string, months: number) {
  const d = new Date(dateStr + "T00:00:00");
  const dia = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ultimoDia));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function gerarParcelas(valor: number, n: number, vencimentoBase?: string): Parcela[] {
  const qtd = Math.max(1, Math.floor(n));
  const centavos = Math.round(valor * 100);
  const base = Math.floor(centavos / qtd);
  const resto = centavos - base * qtd;
  return Array.from({ length: qtd }, (_, i) => {
    const cents = base + (i < resto ? 1 : 0);
    return {
      id: crypto.randomUUID(),
      numero: i + 1,
      valor: cents / 100,
      vencimento: vencimentoBase ? addMonths(vencimentoBase, i) : undefined,
      pagamentos: [],
    };
  });
}

function StatusBadge({ status }: { status: Status }) {
  if (status === "pago")
    return (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Pago
      </Badge>
    );
  if (status === "atrasado")
    return (
      <Badge variant="destructive">
        <AlertTriangle className="mr-1 h-3 w-3" /> Atrasado
      </Badge>
    );
  if (status === "parcial")
    return (
      <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-200">
        <HandCoins className="mr-1 h-3 w-3" /> Parcial
      </Badge>
    );
  return (
    <Badge variant="secondary">
      <Clock className="mr-1 h-3 w-3" /> Pendente
    </Badge>
  );
}

function Index() {
  const { logout } = useAuth();
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");

  // form nova cobrança
  const [cliente, setCliente] = useState("");
  const [contato, setContato] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [numParcelas, setNumParcelas] = useState("1");
  const [aluno, setAluno] = useState("");
  const [endereco, setEndereco] = useState("");
  const [serie, setSerie] = useState("");
  const [doColegio, setDoColegio] = useState<"S" | "N">("N");
  const [editandoId, setEditandoId] = useState<string | null>(null);

  // dar baixa (cobrança + parcela)
  const [baixaId, setBaixaId] = useState<string | null>(null);
  const [baixaParcelaId, setBaixaParcelaId] = useState<string | null>(null);
  const [baixaValor, setBaixaValor] = useState("");
  const [baixaData, setBaixaData] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setCobrancas(JSON.parse(raw));
      } else {
        const v2 = localStorage.getItem(LEGACY_V2);
        if (v2) {
          const arr = JSON.parse(v2) as Array<
            Omit<Cobranca, "parcelas"> & { pagamentos?: Pagamento[] }
          >;
          const migrated: Cobranca[] = arr.map((c) => ({
            ...c,
            parcelas: [
              {
                id: crypto.randomUUID(),
                numero: 1,
                valor: c.valor,
                vencimento: c.vencimento,
                pagamentos: c.pagamentos ?? [],
              },
            ],
          }));
          setCobrancas(migrated);
        } else {
          const v1 = localStorage.getItem(LEGACY_V1);
          if (v1) {
            const arr = JSON.parse(v1) as Array<
              Cobranca & { status?: Status }
            >;
            const migrated: Cobranca[] = arr.map((c) => ({
              id: c.id,
              cliente: c.cliente,
              contato: c.contato,
              descricao: c.descricao,
              valor: c.valor,
              vencimento: c.vencimento,
              criadaEm: c.criadaEm,
              parcelas: [
                {
                  id: crypto.randomUUID(),
                  numero: 1,
                  valor: c.valor,
                  vencimento: c.vencimento,
                  pagamentos:
                    c.status === "pago"
                      ? [{ id: crypto.randomUUID(), valor: c.valor, data: c.criadaEm }]
                      : [],
                },
              ],
            }));
            setCobrancas(migrated);
          }
        }
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(cobrancas));
  }, [cobrancas, loaded]);

  const cobrancasComStatus = useMemo(
    () =>
      cobrancas.map((c) => ({
        ...c,
        status: computeStatus(c),
        pago: totalPago(c),
        restante: restante(c),
      })),
    [cobrancas],
  );

  const totalDevido = cobrancasComStatus.reduce((s, c) => s + c.restante, 0);
  const totalAtrasado = cobrancasComStatus
    .filter((c) => c.status === "atrasado")
    .reduce((s, c) => s + c.restante, 0);
  const totalRecebido = cobrancasComStatus.reduce((s, c) => s + c.pago, 0);

  const devedores = useMemo(() => {
    const map = new Map<
      string,
      { cliente: string; contato: string; total: number; qtd: number; atrasadas: number }
    >();
    for (const c of cobrancasComStatus) {
      if (c.restante <= 0) continue;
      const key = c.cliente.trim().toLowerCase();
      const cur =
        map.get(key) ?? { cliente: c.cliente, contato: c.contato, total: 0, qtd: 0, atrasadas: 0 };
      cur.total += c.restante;
      cur.qtd += 1;
      if (c.status === "atrasado") cur.atrasadas += 1;
      if (!cur.contato && c.contato) cur.contato = c.contato;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [cobrancasComStatus]);

  const buscaNormalizada = busca.trim().toLowerCase();
  const cobrancasFiltradas = buscaNormalizada
    ? cobrancasComStatus.filter(
        (c) =>
          c.cliente.toLowerCase().includes(buscaNormalizada) ||
          c.contato.toLowerCase().includes(buscaNormalizada),
      )
    : cobrancasComStatus;
  const devedoresFiltrados = buscaNormalizada
    ? devedores.filter(
        (d) =>
          d.cliente.toLowerCase().includes(buscaNormalizada) ||
          d.contato.toLowerCase().includes(buscaNormalizada),
      )
    : devedores;

  function resetForm() {
    setCliente("");
    setContato("");
    setDescricao("");
    setValor("");
    setVencimento("");
    setNumParcelas("1");
    setAluno("");
    setEndereco("");
    setSerie("");
    setDoColegio("N");
  }

  function adicionar() {
    const v = parseFloat(valor.replace(",", "."));
    if (!cliente.trim() || isNaN(v) || v <= 0) return;
    const n = Math.max(1, parseInt(numParcelas || "1", 10) || 1);
    const nova: Cobranca = {
      id: crypto.randomUUID(),
      cliente: cliente.trim(),
      contato: contato.trim(),
      descricao: descricao.trim(),
      valor: v,
      vencimento: vencimento || undefined,
      parcelas: gerarParcelas(v, n, vencimento || undefined),
      criadaEm: new Date().toISOString(),
      aluno: aluno.trim() || undefined,
      endereco: endereco.trim() || undefined,
      serie: serie.trim() || undefined,
      doColegio: doColegio === "S",
    };
    setCobrancas((prev) => [nova, ...prev]);
    resetForm();
    setOpen(false);
  }

  function remover(id: string) {
    setCobrancas((prev) => prev.filter((c) => c.id !== id));
  }

  function abrirBaixa(c: Cobranca, parcelaId?: string) {
    const parcela =
      (parcelaId && c.parcelas.find((p) => p.id === parcelaId)) ||
      c.parcelas.find((p) => restanteParcela(p) > 0) ||
      c.parcelas[0];
    setBaixaId(c.id);
    setBaixaParcelaId(parcela.id);
    setBaixaValor(restanteParcela(parcela).toFixed(2).replace(".", ","));
    setBaixaData(new Date().toISOString().slice(0, 10));
  }

  function selecionarParcelaBaixa(parcelaId: string) {
    const c = cobrancas.find((x) => x.id === baixaId);
    if (!c) return;
    const parcela = c.parcelas.find((p) => p.id === parcelaId);
    if (!parcela) return;
    setBaixaParcelaId(parcelaId);
    setBaixaValor(restanteParcela(parcela).toFixed(2).replace(".", ","));
  }

  function fecharBaixa() {
    setBaixaId(null);
    setBaixaParcelaId(null);
    setBaixaValor("");
    setBaixaData("");
  }

  function confirmarBaixa() {
    const c = cobrancas.find((x) => x.id === baixaId);
    if (!c) return fecharBaixa();
    const parcela = c.parcelas.find((p) => p.id === baixaParcelaId);
    if (!parcela) return fecharBaixa();
    const v = parseFloat(baixaValor.replace(",", "."));
    if (isNaN(v) || v <= 0) return;
    const r = restanteParcela(parcela);
    const valorFinal = Math.min(v, r);
    const dataISO = baixaData
      ? new Date(baixaData + "T00:00:00").toISOString()
      : new Date().toISOString();
    setCobrancas((prev) =>
      prev.map((x) =>
        x.id === c.id
          ? {
              ...x,
              parcelas: x.parcelas.map((p) =>
                p.id === parcela.id
                  ? {
                      ...p,
                      pagamentos: [
                        ...p.pagamentos,
                        { id: crypto.randomUUID(), valor: valorFinal, data: dataISO },
                      ],
                    }
                  : p,
              ),
            }
          : x,
      ),
    );
    // próxima parcela em aberto, se houver
    const proxima = c.parcelas.find(
      (p) => p.id !== parcela.id && restanteParcela(p) > 0,
    );
    if (valorFinal >= r && proxima) {
      setBaixaParcelaId(proxima.id);
      setBaixaValor(restanteParcela(proxima).toFixed(2).replace(".", ","));
    } else {
      fecharBaixa();
    }
  }

  function removerPagamento(cobrancaId: string, parcelaId: string, pagamentoId: string) {
    setCobrancas((prev) =>
      prev.map((c) =>
        c.id === cobrancaId
          ? {
              ...c,
              parcelas: c.parcelas.map((p) =>
                p.id === parcelaId
                  ? { ...p, pagamentos: p.pagamentos.filter((x) => x.id !== pagamentoId) }
                  : p,
              ),
            }
          : c,
      ),
    );
  }

  const cobrancaBaixa = cobrancas.find((c) => c.id === baixaId) ?? null;
  const parcelaBaixa =
    cobrancaBaixa?.parcelas.find((p) => p.id === baixaParcelaId) ?? null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Cobranças</h1>
              <p className="text-xs text-muted-foreground">Saiba quem está devendo</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Nova cobrança
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova cobrança</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="cliente">Cliente *</Label>
                  <Input id="cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="contato">Contato</Label>
                  <Input id="contato" value={contato} onChange={(e) => setContato(e.target.value)} placeholder="E-mail ou telefone" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="aluno">Nome do aluno</Label>
                  <Input id="aluno" value={aluno} onChange={(e) => setAluno(e.target.value)} placeholder="Nome do aluno" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="endereco">Endereço</Label>
                  <Input id="endereco" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, bairro" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="serie">Ano / Série</Label>
                    <Input id="serie" value={serie} onChange={(e) => setSerie(e.target.value)} placeholder="Ex.: 5º ano" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="doColegio">Do colégio?</Label>
                    <select
                      id="doColegio"
                      value={doColegio}
                      onChange={(e) => setDoColegio(e.target.value as "S" | "N")}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="S">Sim</option>
                      <option value="N">Não</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="descricao">Descrição / itens</Label>
                  <Textarea id="descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="O que está sendo cobrado" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="valor">Valor (R$) *</Label>
                    <Input id="valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="vencimento">1º Vencimento</Label>
                    <Input id="vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="parcelas">Parcelas</Label>
                    <Input
                      id="parcelas"
                      type="number"
                      min={1}
                      max={60}
                      value={numParcelas}
                      onChange={(e) => setNumParcelas(e.target.value)}
                    />
                  </div>
                </div>
                {(() => {
                  const v = parseFloat(valor.replace(",", "."));
                  const n = Math.max(1, parseInt(numParcelas || "1", 10) || 1);
                  if (!isNaN(v) && v > 0 && n > 1) {
                    return (
                      <p className="text-xs text-muted-foreground">
                        {n}x de aproximadamente {formatBRL(v / n)} — vencimentos mensais
                        {vencimento ? " a partir do 1º vencimento." : "."}
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={adicionar}>Salvar</Button>
              </DialogFooter>
            </DialogContent>
            </Dialog>
            <Button variant="outline" size="icon" onClick={logout} title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <section className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total a receber</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{formatBRL(totalDevido)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Em atraso</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-destructive">{formatBRL(totalAtrasado)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Recebido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-emerald-600">{formatBRL(totalRecebido)}</div>
            </CardContent>
          </Card>
        </section>

        <div className="mt-8 mb-4 relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar por cliente ou contato..."
            className="pl-9"
          />
        </div>

        <Tabs defaultValue="devedores">
          <TabsList>
            <TabsTrigger value="devedores">Quem está devendo</TabsTrigger>
            <TabsTrigger value="todas">Todas as cobranças</TabsTrigger>
          </TabsList>

          <TabsContent value="devedores" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {devedores.length === 0 ? (
                  <div className="p-10 text-center text-sm text-muted-foreground">
                    Ninguém está devendo no momento. 🎉
                  </div>
                ) : devedoresFiltrados.length === 0 ? (
                  <div className="p-10 text-center text-sm text-muted-foreground">
                    Nenhum cliente encontrado para "{busca}".
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Contato</TableHead>
                        <TableHead className="text-center">Cobranças em aberto</TableHead>
                        <TableHead className="text-center">Atrasadas</TableHead>
                        <TableHead className="text-right">Total devido</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {devedoresFiltrados.map((d) => (
                        <TableRow key={d.cliente}>
                          <TableCell className="font-medium">{d.cliente}</TableCell>
                          <TableCell className="text-muted-foreground">{d.contato || "—"}</TableCell>
                          <TableCell className="text-center">{d.qtd}</TableCell>
                          <TableCell className="text-center">
                            {d.atrasadas > 0 ? (
                              <Badge variant="destructive">{d.atrasadas}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">{formatBRL(d.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="todas" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {cobrancasComStatus.length === 0 ? (
                  <div className="p-10 text-center text-sm text-muted-foreground">
                    Nenhuma cobrança cadastrada. Clique em "Nova cobrança" para começar.
                  </div>
                ) : cobrancasFiltradas.length === 0 ? (
                  <div className="p-10 text-center text-sm text-muted-foreground">
                    Nenhuma cobrança encontrada para "{busca}".
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-center">Parcelas</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Pago</TableHead>
                        <TableHead className="text-right">Restante</TableHead>
                        <TableHead className="w-[180px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cobrancasFiltradas.map((c) => {
                        const pagas = c.parcelas.filter((p) => restanteParcela(p) <= 0).length;
                        return (
                          <TableRow key={c.id}>
                            <TableCell>
                              <div className="font-medium">{c.cliente}</div>
                              {c.contato && (
                                <div className="text-xs text-muted-foreground">{c.contato}</div>
                              )}
                              {c.aluno && (
                                <div className="text-xs text-muted-foreground">
                                  Aluno: {c.aluno}
                                  {c.serie ? ` • ${c.serie}` : ""}
                                  {c.doColegio ? " • Colégio" : ""}
                                </div>
                              )}
                              {c.endereco && (
                                <div className="text-xs text-muted-foreground">{c.endereco}</div>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[220px] truncate text-muted-foreground">
                              {c.descricao || "—"}
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground">
                              {pagas}/{c.parcelas.length}
                            </TableCell>
                            <TableCell><StatusBadge status={c.status} /></TableCell>
                            <TableCell className="text-right font-semibold">{formatBRL(c.valor)}</TableCell>
                            <TableCell className="text-right text-emerald-600">{formatBRL(c.pago)}</TableCell>
                            <TableCell className="text-right font-semibold">{formatBRL(c.restante)}</TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => abrirBaixa(c)}
                                  disabled={c.restante <= 0}
                                >
                                  <HandCoins className="mr-1 h-4 w-4" /> Dar baixa
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => remover(c.id)}
                                  aria-label="Remover"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Dialog: dar baixa */}
      <Dialog open={baixaId !== null} onOpenChange={(o) => !o && fecharBaixa()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dar baixa em parcela</DialogTitle>
            {cobrancaBaixa && (
              <DialogDescription>
                {cobrancaBaixa.cliente} • Total {formatBRL(cobrancaBaixa.valor)} • Restante{" "}
                <span className="font-semibold text-foreground">
                  {formatBRL(restante(cobrancaBaixa))}
                </span>
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="grid gap-4">
            {cobrancaBaixa && (
              <div>
                <div className="mb-2 text-sm font-medium">Parcelas</div>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Restante</TableHead>
                        <TableHead className="w-[110px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cobrancaBaixa.parcelas.map((p) => {
                        const st = statusParcela(p);
                        const r = restanteParcela(p);
                        const selecionada = p.id === baixaParcelaId;
                        return (
                          <TableRow
                            key={p.id}
                            className={selecionada ? "bg-muted/60" : undefined}
                          >
                            <TableCell className="font-medium">{p.numero}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {p.vencimento
                                ? new Date(p.vencimento + "T00:00:00").toLocaleDateString("pt-BR")
                                : "—"}
                            </TableCell>
                            <TableCell><StatusBadge status={st} /></TableCell>
                            <TableCell className="text-right">{formatBRL(p.valor)}</TableCell>
                            <TableCell className="text-right font-medium">{formatBRL(r)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant={selecionada ? "default" : "outline"}
                                onClick={() => selecionarParcelaBaixa(p.id)}
                                disabled={r <= 0}
                              >
                                {selecionada ? "Selecionada" : "Selecionar"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="baixa-valor">Valor recebido (R$) *</Label>
                <Input
                  id="baixa-valor"
                  inputMode="decimal"
                  value={baixaValor}
                  onChange={(e) => setBaixaValor(e.target.value)}
                  placeholder="0,00"
                  disabled={!parcelaBaixa || restanteParcela(parcelaBaixa) <= 0}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="baixa-data">Data do pagamento</Label>
                <Input
                  id="baixa-data"
                  type="date"
                  value={baixaData}
                  onChange={(e) => setBaixaData(e.target.value)}
                />
              </div>
            </div>

            {parcelaBaixa && restanteParcela(parcelaBaixa) > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setBaixaValor(restanteParcela(parcelaBaixa).toFixed(2).replace(".", ","))
                  }
                >
                  Pagar parcela ({formatBRL(restanteParcela(parcelaBaixa))})
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setBaixaValor(
                      (restanteParcela(parcelaBaixa) / 2).toFixed(2).replace(".", ","),
                    )
                  }
                >
                  Metade
                </Button>
              </div>
            )}

            {parcelaBaixa && parcelaBaixa.pagamentos.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-medium">
                  Histórico — parcela {parcelaBaixa.numero}
                </div>
                <ul className="space-y-1.5">
                  {parcelaBaixa.pagamentos
                    .slice()
                    .sort((a, b) => (a.data < b.data ? 1 : -1))
                    .map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                      >
                        <span className="text-muted-foreground">
                          {new Date(p.data).toLocaleDateString("pt-BR")}
                        </span>
                        <span className="font-medium">{formatBRL(p.valor)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            cobrancaBaixa &&
                            removerPagamento(cobrancaBaixa.id, parcelaBaixa.id, p.id)
                          }
                          aria-label="Remover pagamento"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={fecharBaixa}>Fechar</Button>
            <Button
              onClick={confirmarBaixa}
              disabled={!parcelaBaixa || restanteParcela(parcelaBaixa) <= 0}
            >
              Registrar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
