import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/motion/_root.css';
import './styles/motion/accordion.css';
import './styles/motion/skeleton.css';
import './styles/motion/nav-menu.css';
import './styles/motion/number.css';
import './styles/motion/error-shake.css';
import './styles/motion/success.css';
import './styles/desk/workspace.css';

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
