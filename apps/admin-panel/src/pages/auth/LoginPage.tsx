'use client';

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Card, CardContent, TextField, Button, Alert, InputAdornment, IconButton, Typography, CircularProgress } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useAuth } from '../../shared/auth/AuthProvider';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showTotp, setShowTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'password' | 'totp'>('password');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    try {
      if (step === 'totp') {
        await login('', '', totpCode);
      } else {
        await login(email, password);
      }
      navigate('/tenants');
    } catch (err: any) {
      if (err.code === 'REQUIRES_TWO_FACTOR') {
        setStep('totp');
        setError(null);
      } else {
        setError(err.message || 'Falha no login');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, bgcolor: 'background.default' }}>
      <Card sx={{ maxWidth: 420, width: '100%', boxShadow: '0 0 60px rgba(99,102,241,0.15)', border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h4" fontWeight={700} gutterBottom sx={{ textAlign: 'center', color: 'primary.main' }}>
            Filitech Admin
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 3 }}>
            Painel de Administração Global
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            {step === 'password' && (
              <>
                <TextField
                  fullWidth
                  label="E-mail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  margin="normal"
                  required
                  autoComplete="email"
                  autoFocus
                />
                <TextField
                  fullWidth
                  label="Senha"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  margin="normal"
                  required
                  autoComplete="current-password"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <Button
                  fullWidth
                  type="submit"
                  size="large"
                  variant="contained"
                  disabled={loading}
                  sx={{ mt: 3, mb: 2, py: 1.5 }}
                >
                  {loading ? <CircularProgress size={24} color="inherit" /> : 'Entrar'}
                </Button>
              </>
            )}

            {step === 'totp' && (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: 'center' }}>
                  Insira o código do seu aplicativo autenticador
                </Typography>
                <TextField
                  fullWidth
                  label="Código 2FA"
                  type={showTotp ? 'text' : 'password'}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  margin="normal"
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  inputProps={{ maxLength: 6 }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowTotp(!showTotp)} edge="end">
                          {showTotp ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <Button
                  fullWidth
                  type="submit"
                  size="large"
                  variant="contained"
                  disabled={loading}
                  sx={{ mt: 3, mb: 2, py: 1.5 }}
                >
                  {loading ? <CircularProgress size={24} color="inherit" /> : 'Verificar'}
                </Button>
                <Button
                  fullWidth
                  onClick={() => { setStep('password'); setTotpCode(''); setError(null); }}
                  variant="outlined"
                  sx={{ mt: 1 }}
                >
                  Voltar
                </Button>
              </>
            )}
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}