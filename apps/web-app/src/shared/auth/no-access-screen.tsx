// src/shared/auth/no-access-screen.tsx — módulo não contratado (Cap. 2.6 / 8.1)
import { Button, Card, Container, Stack, Typography } from "@mui/material";
import { useNavigate, useSearchParams } from "react-router-dom";

export function NoAccessScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const module = params.get("modulo");

  return (
    <Container maxWidth="sm" className="flex min-h-full items-center justify-center">
      <Card
        className="w-full p-8"
        sx={{ background: "#101114", border: "1px solid rgba(39,39,42,0.6)" }}
      >
        <Stack spacing={2} alignItems="flex-start">
          <Typography variant="h6" fontWeight={700}>
            Sem acesso ao módulo
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {module
              ? `O módulo "${module}" não está contratado neste tenant. Fale com o administrador para ativá-lo.`
              : "Este módulo não está contratado neste tenant. Fale com o administrador para ativá-lo."}
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button variant="contained" onClick={() => navigate("/pdv")}>
              Ir para o PDV
            </Button>
            <Button variant="outlined" onClick={() => navigate("/")}>
              Início
            </Button>
          </Stack>
        </Stack>
      </Card>
    </Container>
  );
}
