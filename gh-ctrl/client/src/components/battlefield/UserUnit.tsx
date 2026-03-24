import { useState, useEffect } from 'react'
import type { BattlefieldUser } from '../../types'

const MAP_W = 2800
const MAP_H = 2800
const UNIT_MARGIN = 60

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

interface UserUnitProps {
  user: BattlefieldUser
  spawnPos?: { x: number; y: number }
}

export function UserUnit({ user, spawnPos }: UserUnitProps) {
  const [pos, setPos] = useState(() => {
    if (spawnPos) {
      return {
        x: clamp(spawnPos.x + (Math.random() - 0.5) * 160, UNIT_MARGIN, MAP_W - UNIT_MARGIN),
        y: clamp(spawnPos.y + (Math.random() - 0.5) * 160, UNIT_MARGIN, MAP_H - UNIT_MARGIN),
      }
    }
    return {
      x: UNIT_MARGIN + Math.random() * (MAP_W - UNIT_MARGIN * 2),
      y: UNIT_MARGIN + Math.random() * (MAP_H - UNIT_MARGIN * 2),
    }
  })
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    const move = () => {
      setPos((prev) => ({
        x: clamp(prev.x + (Math.random() - 0.5) * 120, UNIT_MARGIN, MAP_W - UNIT_MARGIN),
        y: clamp(prev.y + (Math.random() - 0.5) * 80, UNIT_MARGIN, MAP_H - UNIT_MARGIN),
      }))
    }
    const delay = 2000 + Math.random() * 2000
    const t = setTimeout(move, delay)
    return () => clearTimeout(t)
  }, [pos])

  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        transform: 'translate(-50%, -50%)',
        transition: 'left 2s ease-in-out, top 2s ease-in-out',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        zIndex: 10,
        userSelect: 'none',
      }}
      onClick={(e) => {
        e.stopPropagation()
        window.location.href = `mailto:${user.login}@users.noreply.github.com`
      }}
      title={user.login}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img
        src={user.avatarUrl}
        alt={user.login}
        width={40}
        height={40}
        style={{
          borderRadius: '50%',
          border: '2px solid rgba(0, 255, 100, 0.6)',
          boxShadow: hovered ? '0 0 16px rgba(0, 255, 100, 0.9)' : '0 0 8px rgba(0, 255, 100, 0.4)',
          transform: hovered ? 'scale(1.2)' : 'scale(1)',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        }}
      />
      <span
        style={{
          fontSize: 10,
          color: 'rgba(0, 255, 100, 0.85)',
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          padding: '1px 4px',
          borderRadius: 2,
          maxWidth: 80,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: 'monospace',
          letterSpacing: '0.03em',
        }}
      >
        {user.login}
      </span>
    </div>
  )
}
