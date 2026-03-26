import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import { KeycloakProvider, keycloakEnabled } from './auth/KeycloakProvider'

const tree = (
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  keycloakEnabled ? <KeycloakProvider>{tree}</KeycloakProvider> : tree
)
