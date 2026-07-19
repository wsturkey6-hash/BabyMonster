import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './ui/App';

if (navigator.storage?.persist) {
  void navigator.storage.persist();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
