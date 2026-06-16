import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { UIPrefsProvider } from './state/uiPrefs'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <UIPrefsProvider>
      <App />
    </UIPrefsProvider>
  </React.StrictMode>,
)
