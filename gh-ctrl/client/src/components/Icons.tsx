interface IconProps {
  size?: number
  className?: string
  title?: string
}

export function CloseIcon({ size = 12, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function LinkIcon({ size = 12, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d="M6.5 3.5H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9.5 3.5H12a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function LabelIcon({ size = 12, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d="M2 2h6l6 6-6 6-6-6V2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="5.5" cy="5.5" r="1" fill="currentColor" />
    </svg>
  )
}

export function CommentIcon({ size = 12, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d="M2 2h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6l-3 3v-3H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export function LockIcon({ size = 16, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <rect x="3" y="7" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11" r="1" fill="currentColor" />
    </svg>
  )
}

export function GlobeIcon({ size = 16, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 2c-1.5 2-2 4-2 6s.5 4 2 6M8 2c1.5 2 2 4 2 6s-.5 4-2 6" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function RefreshIcon({ size = 14, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d="M13.5 2.5A6.5 6.5 0 1 1 7 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <polyline points="9,1 13.5,2.5 12,7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function BranchIcon({ size = 12, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <circle cx="4" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="4" cy="13" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="4" y1="4.5" x2="4" y2="11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 4.5C12 8 8 9 4 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function ExternalLinkIcon({ size = 12, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d="M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 1h3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="11" y1="1" x2="5" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function RelocateIcon({ size = 12, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8" y1="2" x2="8" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="11" x2="8" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="8" x2="5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="11" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function ScanIcon({ size = 12, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="8" y1="8" x2="12.5" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
    </svg>
  )
}

export function BuildIcon({ size = 12, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d="M3 13l7-7M11 2l-2 2 3 3 2-2-1-1-1 1-1-1 1-1-1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 13l-1 1 1 1 1-1-1-1z" fill="currentColor" />
      <path d="M9 5l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function MapIcon({ size = 12, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d="M1 3.5l4-1.5 6 2 4-2v10l-4 2-6-2-4 1.5V3.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="5" y1="2" x2="5" y2="13" stroke="currentColor" strokeWidth="1" opacity="0.5" strokeDasharray="2 1.5" />
      <line x1="11" y1="3.5" x2="11" y2="14" stroke="currentColor" strokeWidth="1" opacity="0.5" strokeDasharray="2 1.5" />
    </svg>
  )
}

export function FeedIcon({ size = 12, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function PlusIcon({ size = 12, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function AssigneeIcon({ size = 12, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function CopyIcon({ size = 12, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <rect x="5" y="5" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function GitHubIcon({ size = 16, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

export function GitLabIcon({ size = 16, className, title }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden={!title} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d="M8 15.2l-3.1-9.5H1.1L8 15.2zM8 15.2l3.1-9.5h3.8L8 15.2zM1.1 5.7L0 9.1l.5 1.5L8 15.2 1.1 5.7zM14.9 5.7L16 9.1l-.5 1.5L8 15.2l6.9-9.5zM4.9 5.7h6.2L8 1 4.9 5.7zM8 1L6.2 5.7h3.6L8 1z" />
    </svg>
  )
}
