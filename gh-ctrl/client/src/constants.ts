import type { BaseDesign } from './types'

export const BASE_DESIGNS: { id: BaseDesign; label: string; src: string; colorized: boolean }[] = [
  { id: 'default',      label: 'Standard Kommando', src: '/buildings/kommando_chromakey.png', colorized: true  },
  { id: 'landing_base', label: 'Landing Base',       src: '/buildings/landing_base.png',       colorized: false },
  { id: 'api_base',      label: 'API Base',            src: '/buildings/api_base.png',           colorized: false },
  { id: 'frontend_base', label: 'Frontend Base',       src: '/buildings/frontend_base.png',     colorized: false },
]
