import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { VaultProvider } from './context/VaultContext.jsx';
import App from './App.jsx';
import { UpdatePrompt } from './components/UpdatePrompt.jsx';
import '@tabler/icons-webfont/dist/tabler-icons-outline.min.css';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <VaultProvider>
      <App />
    </VaultProvider>
    <UpdatePrompt />
  </StrictMode>,
);
