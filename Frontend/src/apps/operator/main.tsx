import '@patternfly/react-core/dist/styles/base.css';
import '@/shared/brand.css';
import './operator.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { OpsApp } from './App';

document.title = 'Tatv Cloud Operations';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OpsApp />
  </StrictMode>,
);
