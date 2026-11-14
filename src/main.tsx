import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import './styles/index.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root missing')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Agent tools are optional and off the critical path.
void import('./agent/webmcp').then((m) => m.registerAgentTools())
