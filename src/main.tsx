import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import App from './App';
import './styles.css';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#98ebd3', contrastText: '#10231e' },
    secondary: { main: '#f1c172' },
    background: { default: '#101419', paper: '#192129' },
    text: { primary: '#edf3f6', secondary: '#aec0ca' },
  },
  typography: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    button: { textTransform: 'none', fontWeight: 700 },
  },
  shape: { borderRadius: 14 },
  components: {
    MuiButton: { styleOverrides: { root: { minHeight: 46 } } },
    MuiToggleButton: { styleOverrides: { root: { minHeight: 44 } } },
  },
});

createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={theme}><CssBaseline /><App /></ThemeProvider>,
);
