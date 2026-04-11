import React, { type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import { KeycloakProvider, keycloakEnabled } from './auth/KeycloakProvider'
import { AuthentikProvider, authentikEnabled } from './auth/AuthentikProvider'
import { OidcProvider, oidcEnabled } from './auth/OidcProvider'

const tree = (
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)

function wrapWithAuthProvider(children: ReactNode): ReactNode {
  if (keycloakEnabled) return <KeycloakProvider>{children}</KeycloakProvider>
  if (authentikEnabled) return <AuthentikProvider>{children}</AuthentikProvider>
  if (oidcEnabled) return <OidcProvider>{children}</OidcProvider>
  return children
}

ReactDOM.createRoot(document.getElementById('root')!).render(wrapWithAuthProvider(tree))
