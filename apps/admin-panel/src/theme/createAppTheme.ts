import { createTheme } from '@mui/material/styles';
// Augmenta `Theme.components` com a chave `MuiDataGrid`. Sem este import de
// TIPO o pacote nao registra o componente e o theme rejeita `MuiDataGrid`
// (TS2353) mesmo com `@mui/x-data-grid` instalado e em uso no painel.
import type {} from '@mui/x-data-grid';

const colorTokens = {
  brand: {
    indigo50: '#eef0ff', indigo100: '#e0e7ff', indigo200: '#c7d2fe',
    indigo300: '#a5b4fc', indigo400: '#818cf8', indigo500: '#6366F1',
    indigo600: '#4F46E5', indigo700: '#4338CA', indigo800: '#3730A3',
    indigo900: '#312E81',
  },
  surface: {
    darkBase: '#05060A',     // fundo da landing (Capítulo 2.2) e do modo escuro do app
    darkElevated: '#0D0E14',
    lightBase: '#FFFFFF',    // fundo padrão do app operacional (modo claro, 8.4.3)
    lightElevated: '#F7F8FA',
  },
  semantic: {
    success: '#16A34A', warning: '#D97706', danger: '#DC2626', info: '#2563EB',
  },
} as const;

const typographyTokens = {
  fontFamily: "'Inter', 'Roboto', sans-serif",
  scale: { xs: 12, sm: 14, base: 16, lg: 18, xl: 24, '2xl': 32, '3xl': 48 },
} as const;

const spacingTokens = { unit: 8, scale: [0, 4, 8, 12, 16, 24, 32, 48, 64] } as const;

export function createAppTheme(mode: 'light' | 'dark') {
  const isDark = mode === 'dark';
  
  return createTheme({
    palette: {
      mode,
      primary: {
        main: colorTokens.brand.indigo600,
        light: colorTokens.brand.indigo500,
        dark: colorTokens.brand.indigo900,
        contrastText: '#FFFFFF',
      },
      secondary: {
        main: colorTokens.brand.indigo500,
        light: colorTokens.brand.indigo50,
        dark: colorTokens.brand.indigo600,
        contrastText: '#FFFFFF',
      },
      background: {
        default: isDark ? colorTokens.surface.darkBase : colorTokens.surface.lightBase,
        paper: isDark ? colorTokens.surface.darkElevated : colorTokens.surface.lightElevated,
      },
      success: { main: colorTokens.semantic.success },
      warning: { main: colorTokens.semantic.warning },
      error: { main: colorTokens.semantic.danger },
      info: { main: colorTokens.semantic.info },
      divider: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      text: {
        primary: isDark ? '#FAFAFA' : '#1A1A2E',
        secondary: isDark ? '#A1A1AA' : '#52525B',
      },
      action: {
        hover: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
        selected: isDark ? 'rgba(99,102,241,0.16)' : 'rgba(99,102,241,0.08)',
        disabledBackground: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
        disabled: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
      },
    },
    typography: {
      fontFamily: typographyTokens.fontFamily,
      h1: { fontSize: typographyTokens.scale['3xl'], fontWeight: 700, lineHeight: 1.1 },
      h2: { fontSize: typographyTokens.scale['2xl'], fontWeight: 700, lineHeight: 1.2 },
      h3: { fontSize: typographyTokens.scale.xl, fontWeight: 600, lineHeight: 1.3 },
      h4: { fontSize: typographyTokens.scale.lg, fontWeight: 600, lineHeight: 1.4 },
      h5: { fontSize: typographyTokens.scale.base, fontWeight: 600, lineHeight: 1.4 },
      h6: { fontSize: typographyTokens.scale.sm, fontWeight: 600, lineHeight: 1.4 },
      body1: { fontSize: typographyTokens.scale.base, lineHeight: 1.6 },
      body2: { fontSize: typographyTokens.scale.sm, lineHeight: 1.5 },
      button: { fontSize: typographyTokens.scale.sm, fontWeight: 600, textTransform: 'none' },
      caption: { fontSize: typographyTokens.scale.xs, lineHeight: 1.4 },
      overline: { fontSize: typographyTokens.scale.xs, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' },
    },
    spacing: spacingTokens.unit,
    shape: { borderRadius: 12 },
    shadows: Array(25).fill('none') as any,
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          '*': { boxSizing: 'border-box' },
          html: { 
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
          },
          body: {
            backgroundColor: isDark ? colorTokens.surface.darkBase : colorTokens.surface.lightBase,
            color: isDark ? '#FAFAFA' : '#1A1A2E',
          },
          '::-webkit-scrollbar': { width: 8, height: 8 },
          '::-webkit-scrollbar-track': { background: 'transparent' },
          '::-webkit-scrollbar-thumb': { 
            backgroundColor: isDark ? '#3F3F46' : '#D4D4D8',
            borderRadius: 4,
          },
          '::-webkit-scrollbar-thumb:hover': { 
            backgroundColor: isDark ? '#52525B' : '#A1A1AA',
          },
          ':focus-visible': {
            outline: `2px solid ${colorTokens.brand.indigo500}`,
            outlineOffset: 2,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 10, padding: '10px 20px', fontWeight: 600 },
          contained: { boxShadow: 'none', '&:hover': { boxShadow: `0 0 24px ${colorTokens.brand.indigo500}40` } },
          outlined: { borderWidth: 1.5, '&:hover': { borderWidth: 1.5 } },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { 
            backgroundImage: 'none',
            border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: { 
            borderRadius: 16,
            border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
          },
        },
      },
      MuiTextField: {
        defaultProps: { variant: 'outlined', size: 'small' },
        styleOverrides: {
          root: { '& .MuiOutlinedInput-root': { borderRadius: 10 } },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: { fontWeight: 600, fontSize: typographyTokens.scale.xs, textTransform: 'uppercase', letterSpacing: '0.05em' },
          body: { fontSize: typographyTokens.scale.sm },
        },
      },
      MuiChip: {
        styleOverrides: { root: { borderRadius: 8, fontWeight: 500 } },
      },
      MuiAlert: {
        styleOverrides: { root: { borderRadius: 12 } },
      },
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: 16 } },
      },
      MuiDrawer: {
        styleOverrides: { paper: { borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` } },
      },
      MuiAppBar: {
        styleOverrides: { root: { boxShadow: 'none', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` } },
      },
      MuiTooltip: {
        styleOverrides: { tooltip: { borderRadius: 8, fontSize: typographyTokens.scale.xs } },
      },
    },
  });
}