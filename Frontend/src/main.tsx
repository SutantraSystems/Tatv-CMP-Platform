import '@patternfly/react-core/dist/styles/base.css';
import './brand.css';
import './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { BRAND } from './brand';

document.title = BRAND.productName;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
