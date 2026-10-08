// src/shared/auth/login-screen.tsx — tela de login do app (Cap. 9.2)
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Container,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { setToken } from "./session";

interface LoginResponse {
  success: boolean;
  data: { accessToken: string; user?: { name?: string; role?: string } } | null;
  error?: { code?: string; message?: string };
}

export function LoginScreen() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json: LoginResponse = await res.json().catch(() => ({
        success: false,
        data: null,
      }));

      if (!res.ok || !json.success || !json.data?.accessToken) {
        setError(json.error?.message ?? "Credenciais inválidas.");
        return;
      }

      setToken(json.data.accessToken);
      navigate("/", { replace: true });
    } catch {
      setError("Falha de conexão com a API. Verifique se ela está no ar (:3001).");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container maxWidth="sm" className="flex min-h-full items-center justify-center">
      <Card className="w-full p-8" sx={{ background: "#101114", border: "1px solid rgba(39,39,42,0.6)" }}>
        <Stack spacing={3}>
          <div>
            <Typography variant="h5" fontWeight={700}>
              Filitech ERP
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Entre com sua conta para acessar o PDV e os módulos.
            </Typography>
          </div>

          {error && <Alert severity="error">{error}</Alert>}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <TextField
              label="E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              fullWidth
              size="small"
            />
            <TextField
              label="Senha"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              fullWidth
              size="small"
            />
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              fullWidth
              size="large"
            >
              {loading ? "Entrando…" : "Entrar"}
            </Button>
          </form>

          <Typography variant="caption" color="text.secondary">
            Demo: <b>demo@filitech.dev</b> / <b>Demo@123</b>
          </Typography>
        </Stack>
      </Card>
    </Container>
  );
}
