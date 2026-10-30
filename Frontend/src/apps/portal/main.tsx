import '@patternfly/react-core/dist/styles/base.css';
import '@/shared/brand.css';
import '@/shared/i18n/index';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { BRAND } from '@/shared/brand';

document.title = BRAND.productName;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
