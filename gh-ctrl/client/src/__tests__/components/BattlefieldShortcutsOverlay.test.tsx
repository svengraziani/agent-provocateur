import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BattlefieldShortcutsOverlay } from '../../components/battlefield/BattlefieldShortcutsOverlay'
import type { DashboardEntry, Building } from '../../types'
import type { ShortcutConfig } from '../../hooks/useBattlefieldKeyboardShortcuts'

function makeEntry(id: number, name = `repo-${id}`): DashboardEntry {
  return {
    repo: { id, owner: 'owner', name, fullName: `owner/${name}`, description: null, color: '#aabbcc', provider: 'github' },
    data: {
      prs: [], issues: [], branches: [], stats: { openPRs: 0, openIssues: 0, conflicts: 0, needsReview: 0, runningActions: 0 },
      defaultBranch: 'main',
    },
  } as unknown as DashboardEntry
}

function makeBuilding(id: number, name = `building-${id}`): Building {
  return { id, name, type: 'clawcom', posX: 0, posY: 0 } as Building
}

const emptyShortcuts: ShortcutConfig = { bases: {}, buildings: {} }

describe('BattlefieldShortcutsOverlay', () => {
  it('has role="dialog" and aria-modal="true"', () => {
    const { container } = render(
      <BattlefieldShortcutsOverlay
        entries={[]}
        buildings={[]}
        shortcuts={emptyShortcuts}
        assigningFor={null}
        onClose={vi.fn()}
        onStartAssigning={vi.fn()}
        onClearShortcut={vi.fn()}
        onCancelAssigning={vi.fn()}
      />
    )
    const panel = container.querySelector('[role="dialog"]')
    expect(panel).not.toBeNull()
    expect(panel?.getAttribute('aria-modal')).toBe('true')
  })

  it('renders built-in NAVIGATION shortcuts', () => {
    render(
      <BattlefieldShortcutsOverlay
        entries={[]}
        buildings={[]}
        shortcuts={emptyShortcuts}
        assigningFor={null}
        onClose={vi.fn()}
        onStartAssigning={vi.fn()}
        onClearShortcut={vi.fn()}
        onCancelAssigning={vi.fn()}
      />
    )
    expect(screen.getByText('NAVIGATION')).toBeInTheDocument()
    expect(screen.getByText('Zoom in')).toBeInTheDocument()
    expect(screen.getByText('Pan camera')).toBeInTheDocument()
  })

  it('renders a row for each DashboardEntry', () => {
    const entries = [makeEntry(1, 'alpha'), makeEntry(2, 'beta')]
    render(
      <BattlefieldShortcutsOverlay
        entries={entries}
        buildings={[]}
        shortcuts={emptyShortcuts}
        assigningFor={null}
        onClose={vi.fn()}
        onStartAssigning={vi.fn()}
        onClearShortcut={vi.fn()}
        onCancelAssigning={vi.fn()}
      />
    )
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('beta')).toBeInTheDocument()
  })

  it('renders a row for each Building', () => {
    const buildings = [makeBuilding(10, 'ClawTower'), makeBuilding(11, 'HealthHub')]
    render(
      <BattlefieldShortcutsOverlay
        entries={[]}
        buildings={buildings}
        shortcuts={emptyShortcuts}
        assigningFor={null}
        onClose={vi.fn()}
        onStartAssigning={vi.fn()}
        onClearShortcut={vi.fn()}
        onCancelAssigning={vi.fn()}
      />
    )
    expect(screen.getByText('ClawTower')).toBeInTheDocument()
    expect(screen.getByText('HealthHub')).toBeInTheDocument()
  })

  it('"Assign" button calls onStartAssigning with correct type and id', () => {
    const onStartAssigning = vi.fn()
    const entries = [makeEntry(5, 'delta')]
    render(
      <BattlefieldShortcutsOverlay
        entries={entries}
        buildings={[]}
        shortcuts={emptyShortcuts}
        assigningFor={null}
        onClose={vi.fn()}
        onStartAssigning={onStartAssigning}
        onClearShortcut={vi.fn()}
        onCancelAssigning={vi.fn()}
      />
    )
    const assignBtn = screen.getByRole('button', { name: /assign shortcut.*delta/i })
    fireEvent.click(assignBtn)
    expect(onStartAssigning).toHaveBeenCalledWith('base', 5)
  })

  it('"✕" clear button calls onClearShortcut when a key is assigned', () => {
    const onClearShortcut = vi.fn()
    const entries = [makeEntry(3, 'gamma')]
    const shortcuts: ShortcutConfig = { bases: { 3: 'q' }, buildings: {} }
    render(
      <BattlefieldShortcutsOverlay
        entries={entries}
        buildings={[]}
        shortcuts={shortcuts}
        assigningFor={null}
        onClose={vi.fn()}
        onStartAssigning={vi.fn()}
        onClearShortcut={onClearShortcut}
        onCancelAssigning={vi.fn()}
      />
    )
    const clearBtn = screen.getByRole('button', { name: /remove shortcut.*gamma/i })
    fireEvent.click(clearBtn)
    expect(onClearShortcut).toHaveBeenCalledWith('base', 3)
  })

  it('"Cancel" button calls onCancelAssigning when assigningFor is set', () => {
    const onCancelAssigning = vi.fn()
    const entries = [makeEntry(1, 'repo-1')]
    render(
      <BattlefieldShortcutsOverlay
        entries={entries}
        buildings={[]}
        shortcuts={emptyShortcuts}
        assigningFor={{ type: 'base', id: 1 }}
        onClose={vi.fn()}
        onStartAssigning={vi.fn()}
        onClearShortcut={vi.fn()}
        onCancelAssigning={onCancelAssigning}
      />
    )
    const cancelBtn = screen.getAllByRole('button', { name: /cancel/i })[0]
    fireEvent.click(cancelBtn)
    expect(onCancelAssigning).toHaveBeenCalled()
  })

  it('clicking the backdrop calls onClose', () => {
    const onClose = vi.fn()
    const { container } = render(
      <BattlefieldShortcutsOverlay
        entries={[]}
        buildings={[]}
        shortcuts={emptyShortcuts}
        assigningFor={null}
        onClose={onClose}
        onStartAssigning={vi.fn()}
        onClearShortcut={vi.fn()}
        onCancelAssigning={vi.fn()}
      />
    )
    const backdrop = container.querySelector('.shortcuts-overlay')!
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('close ✕ button calls onClose', () => {
    const onClose = vi.fn()
    render(
      <BattlefieldShortcutsOverlay
        entries={[]}
        buildings={[]}
        shortcuts={emptyShortcuts}
        assigningFor={null}
        onClose={onClose}
        onStartAssigning={vi.fn()}
        onClearShortcut={vi.fn()}
        onCancelAssigning={vi.fn()}
      />
    )
    const closeBtn = screen.getByRole('button', { name: /close shortcuts overlay/i })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('assigning banner is shown when assigningFor is non-null', () => {
    const entries = [makeEntry(2)]
    render(
      <BattlefieldShortcutsOverlay
        entries={entries}
        buildings={[]}
        shortcuts={emptyShortcuts}
        assigningFor={{ type: 'base', id: 2 }}
        onClose={vi.fn()}
        onStartAssigning={vi.fn()}
        onClearShortcut={vi.fn()}
        onCancelAssigning={vi.fn()}
      />
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('assigning banner is NOT shown when assigningFor is null', () => {
    render(
      <BattlefieldShortcutsOverlay
        entries={[]}
        buildings={[]}
        shortcuts={emptyShortcuts}
        assigningFor={null}
        onClose={vi.fn()}
        onStartAssigning={vi.fn()}
        onClearShortcut={vi.fn()}
        onCancelAssigning={vi.fn()}
      />
    )
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('KeyBadge renders the assigned key string', () => {
    const entries = [makeEntry(7, 'echo')]
    const shortcuts: ShortcutConfig = { bases: { 7: 'z' }, buildings: {} }
    render(
      <BattlefieldShortcutsOverlay
        entries={entries}
        buildings={[]}
        shortcuts={shortcuts}
        assigningFor={null}
        onClose={vi.fn()}
        onStartAssigning={vi.fn()}
        onClearShortcut={vi.fn()}
        onCancelAssigning={vi.fn()}
      />
    )
    expect(screen.getByText('Z')).toBeInTheDocument()
  })
})
