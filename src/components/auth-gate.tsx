import { useState, type ReactNode } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthGate({ children }: { children: ReactNode }) {
  const { ready, hasPassword, isAuthenticated, setPassword, login } = useAuth();
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  if (!ready) return null;
  if (isAuthenticated) return <>{children}</>;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      if (!hasPassword) {
        if (pwd.length < 4) {
          setErro("A senha deve ter pelo menos 4 caracteres.");
          return;
        }
        if (pwd !== pwd2) {
          setErro("As senhas não coincidem.");
          return;
        }
        await setPassword(pwd);
      } else {
        const ok = await login(pwd);
        if (!ok) {
          setErro("Senha incorreta.");
          return;
        }
      }
      setPwd("");
      setPwd2("");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            {hasPassword ? <Lock className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
          </div>
          <CardTitle>
            {hasPassword ? "Acesso restrito" : "Definir senha de administrador"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {hasPassword
              ? "Informe a senha para acessar o painel."
              : "Crie uma senha para proteger o acesso ao painel."}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                autoFocus
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                required
              />
            </div>
            {!hasPassword && (
              <div className="space-y-2">
                <Label htmlFor="senha2">Confirmar senha</Label>
                <Input
                  id="senha2"
                  type="password"
                  value={pwd2}
                  onChange={(e) => setPwd2(e.target.value)}
                  required
                />
              </div>
            )}
            {erro && <p className="text-sm text-destructive">{erro}</p>}
            <Button type="submit" className="w-full" disabled={carregando}>
              {hasPassword ? "Entrar" : "Definir senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}