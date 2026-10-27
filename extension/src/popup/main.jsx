import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@tabler/icons-webfont/dist/tabler-icons-outline.min.css';
import '../../../src/index.css';
import './popup.css';
import { Popup } from './Popup.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
