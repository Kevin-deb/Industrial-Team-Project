import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { EQueryProvider } from './modules/e-shared/query';
import { I18nProvider } from './shared/i18n';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <EQueryProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </EQueryProvider>
    </I18nProvider>
  </React.StrictMode>,
);
