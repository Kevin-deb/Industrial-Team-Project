import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { EQueryProvider } from './modules/e-shared/query';
import { I18nProvider } from './shared/i18n';
import { AuthProvider } from './auth/AuthProvider';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <AuthProvider>
        <EQueryProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </EQueryProvider>
      </AuthProvider>
    </I18nProvider>
  </React.StrictMode>,
);
