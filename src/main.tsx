import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Canvas textures (felt logo, plaques) are drawn once at scene init, so web fonts must be ready first
const fontsReady = Promise.all(
  ['800 86px "Bodoni Moda"', '700 21px "Hanken Grotesk"'].map((f) => document.fonts.load(f))
).catch(() => undefined);

void fontsReady.then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
