import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App.js';
import { LocaleProvider } from './i18n/LocaleProvider.js';
import { registerServiceWorker } from './pwa/register.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><LocaleProvider><App /></LocaleProvider></BrowserRouter></StrictMode>
);
registerServiceWorker();
