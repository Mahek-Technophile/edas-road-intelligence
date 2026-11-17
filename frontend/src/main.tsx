import React from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import './pages.css';
import App from './App';
import { PilotProvider } from './pilot/store';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><PilotProvider><App /></PilotProvider></React.StrictMode>,
);
