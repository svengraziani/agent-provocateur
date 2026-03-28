import { db } from './db'
import { maps } from './db/schema'

interface MapTile {
  type: string
  color: string
}

function generateFuturaX(): Record<string, MapTile> {
  const W = 30
  const H = 30
  const tiles: Record<string, MapTile> = {}

  const getTile = (col: number, row: number): MapTile => {
    // Rock border
    if (col === 0 || col === W - 1 || row === 0 || row === H - 1) {
      return { type: 'rock', color: '#5a5a6a' }
    }

    // X diagonals (the "X" in Futura_X)
    const d1 = Math.abs(col - row)
    const d2 = Math.abs(col - (H - 1 - row))
    if (d1 <= 1 || d2 <= 1) {
      return { type: 'lava', color: '#9a2a0a' }
    }

    // Top-left quadrant: col > row AND row+col < W-1
    if (col > row && row + col < W - 1) {
      if (row <= 5) return { type: 'snow', color: '#aababa' }
      return { type: 'mountain', color: '#7a7a8a' }
    }

    // Top-right quadrant: col > row AND row+col > W-1
    if (col > row && row + col > W - 1) {
      if (col >= W - 6) return { type: 'sand', color: '#9a8a4a' }
      return { type: 'ground', color: '#4a6b2a' }
    }

    // Bottom-left quadrant: row > col AND row+col < W-1
    if (row > col && row + col < W - 1) {
      return { type: 'water', color: '#1a4a7a' }
    }

    // Bottom-right quadrant: row > col AND row+col > W-1
    if (row > col && row + col > W - 1) {
      if (row >= H - 6) return { type: 'grass', color: '#5a9a2a' }
      return { type: 'forest', color: '#1a5a1a' }
    }

    return { type: 'ground', color: '#4a6b2a' }
  }

  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      tiles[`${col},${row}`] = getTile(col, row)
    }
  }

  return tiles
}

const DEFAULT_MAPS = [
  {
    name: 'Futura_X',
    width: 30,
    height: 30,
    tiles: () => generateFuturaX(),
  },
]

export async function seedDefaultMaps(): Promise<void> {
  const existing = await db.select().from(maps)
  if (existing.length > 0) return

  console.log('[seed] No maps found — seeding default maps...')
  for (const map of DEFAULT_MAPS) {
    await db.insert(maps).values({
      name: map.name,
      width: map.width,
      height: map.height,
      tiles: JSON.stringify(map.tiles()),
    })
    console.log(`[seed] Inserted default map: ${map.name}`)
  }
}
