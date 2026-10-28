import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './ui/App';
import './ui/styles.css';

if (navigator.storage?.persist) {
  void navigator.storage.persist();
}

// 「重新登入」導到 /login 讓 Access 攔下；登入後 Pages 對不存在的路徑回 index.html，
// app 就停在 /login。這個 app 沒有路由，把網址改回根目錄，免得之後的重新整理或加到主畫面都帶著 /login
if (location.pathname === '/login') {
  history.replaceState(null, '', '/');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
