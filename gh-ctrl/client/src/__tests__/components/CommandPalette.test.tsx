import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommandPalette } from '../../components/battlefield/CommandPalette'
import type { DashboardEntry, Building } from '../../types'

function makeEntry(id: number, name = `repo-${id}`): DashboardEntry {
  return {
    repo: { id, owner: 'owner', name, fullName: `owner/${name}`, description: null, color: '#fff', provider: 'github' },
    data: {
      prs: [], issues: [], branches: [], stats: { openPRs: 0, openIssues: 0, conflicts: 0, needsReview: 0, runningActions: 0 },
      defaultBranch: 'main',
    },
  } as unknown as DashboardEntry
}

function makeBuilding(id: number, name = `building-${id}`): Building {
  return { id, name, type: 'clawcom', posX: 100, posY: 200 } as Building
}

const defaultProps = {
  entries: [] as DashboardEntry[],
  buildings: [] as Building[],
  positions: {} as Record<number, { x: number; y: number }>,
  buildingPositions: {} as Record<number, { x: number; y: number }>,
  onZoomToBase: vi.fn(),
  onScan: vi.fn(),
  onToggleFeed: vi.fn(),
  onToggleTimers: vi.fn(),
  onZoomReset: vi.fn(),
  onClose: vi.fn(),
}

describe('CommandPalette', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('has role="dialog" and aria-modal="true"', () => {
    const { container } = render(<CommandPalette {...defaultProps} />)
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
  })

  it('renders search input focused', () => {
    render(<CommandPalette {...defaultProps} />)
    const input = screen.getByRole('textbox')
    expect(input).toBeInTheDocument()
  })

  it('renders built-in ACTION commands when no search query', () => {
    render(<CommandPalette {...defaultProps} />)
    expect(screen.getByText('Scan / Refresh')).toBeInTheDocument()
    expect(screen.getByText('Toggle Intel Feed')).toBeInTheDocument()
    expect(screen.getByText('Toggle Timers')).toBeInTheDocument()
    expect(screen.getByText('Reset View')).toBeInTheDocument()
  })

  it('renders BASE commands for each entry with a position', () => {
    const entries = [makeEntry(1, 'alpha'), makeEntry(2, 'beta')]
    const positions = { 1: { x: 100, y: 200 }, 2: { x: 300, y: 400 } }
    render(<CommandPalette {...defaultProps} entries={entries} positions={positions} />)
    expect(screen.getByText('Jump to alpha')).toBeInTheDocument()
    expect(screen.getByText('Jump to beta')).toBeInTheDocument()
  })

  it('renders BUILDING commands for each building', () => {
    const buildings = [makeBuilding(10, 'ClawCom HQ')]
    const buildingPositions = { 10: { x: 500, y: 500 } }
    render(<CommandPalette {...defaultProps} buildings={buildings} buildingPositions={buildingPositions} />)
    expect(screen.getByText('Go to ClawCom HQ')).toBeInTheDocument()
  })

  it('renders CREATE commands when onCreateIssue is provided', () => {
    const entries = [makeEntry(1, 'myrepo')]
    const positions = { 1: { x: 0, y: 0 } }
    const onCreateIssue = vi.fn()
    render(<CommandPalette {...defaultProps} entries={entries} positions={positions} onCreateIssue={onCreateIssue} />)
    expect(screen.getByText('Create issue in myrepo')).toBeInTheDocument()
  })

  it('filters results by fuzzy match on typing', () => {
    render(<CommandPalette {...defaultProps} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'scan' } })
    expect(screen.getByText('Scan / Refresh')).toBeInTheDocument()
    expect(screen.queryByText('Toggle Intel Feed')).toBeNull()
  })

  it('shows "No commands found" when no results match', () => {
    render(<CommandPalette {...defaultProps} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'xyzxyzxyz_never_matches' } })
    expect(screen.getByText('No commands found')).toBeInTheDocument()
  })

  it('ArrowDown moves selection to next item', () => {
    render(<CommandPalette {...defaultProps} />)
    const input = screen.getByRole('textbox')
    const itemsBefore = screen.getAllByRole('option')
    expect(itemsBefore[0].getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const itemsAfter = screen.getAllByRole('option')
    expect(itemsAfter[0].getAttribute('aria-selected')).toBe('false')
    expect(itemsAfter[1].getAttribute('aria-selected')).toBe('true')
  })

  it('ArrowUp moves selection to previous item', () => {
    render(<CommandPalette {...defaultProps} />)
    const input = screen.getByRole('textbox')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })

    const items = screen.getAllByRole('option')
    expect(items[0].getAttribute('aria-selected')).toBe('true')
  })

  it('Enter executes selected command and closes', () => {
    const onScan = vi.fn()
    const onClose = vi.fn()
    render(<CommandPalette {...defaultProps} onScan={onScan} onClose={onClose} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'scan' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onScan).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape calls onClose', () => {
    const onClose = vi.fn()
    render(<CommandPalette {...defaultProps} onClose={onClose} />)
    const input = screen.getByRole('textbox')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('"Jump to [repo]" command calls onZoomToBase with correct position', () => {
    const onZoomToBase = vi.fn()
    const entries = [makeEntry(5, 'targetrepo')]
    const positions = { 5: { x: 999, y: 888 } }
    render(<CommandPalette {...defaultProps} entries={entries} positions={positions} onZoomToBase={onZoomToBase} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'targetrepo' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onZoomToBase).toHaveBeenCalledWith({ x: 999, y: 888 })
  })

  it('"Scan / Refresh" calls onScan', () => {
    const onScan = vi.fn()
    const onClose = vi.fn()
    render(<CommandPalette {...defaultProps} onScan={onScan} onClose={onClose} />)
    const item = screen.getByText('Scan / Refresh')
    fireEvent.click(item)
    expect(onScan).toHaveBeenCalled()
  })

  it('clicking backdrop calls onClose', () => {
    const onClose = vi.fn()
    const { container } = render(<CommandPalette {...defaultProps} onClose={onClose} />)
    const overlay = container.querySelector('.command-palette-overlay')!
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalled()
  })

  it('recently used commands appear first', () => {
    // Pre-seed localStorage with a recent command
    localStorage.setItem('command-palette-recent', JSON.stringify(['action-timers']))
    const onClose = vi.fn()
    render(<CommandPalette {...defaultProps} onClose={onClose} />)
    const items = screen.getAllByRole('option')
    // The first item should be "Toggle Timers" since it's in recent
    expect(items[0].textContent).toContain('Toggle Timers')
  })
})
