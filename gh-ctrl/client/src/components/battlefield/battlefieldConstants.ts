export interface Position {
  x: number
  y: number
}

// Isometric grid layout — diamond arrangement
export const ISO_HALF_W = 180
export const ISO_HALF_H = 180
export const COLS = 4
export const ISO_MAP_CENTER_X = 600
export const ISO_MAP_OFFSET_Y = 120
export const MAP_PADDING = 100
export const ZOOM_MIN = 0.05
export const ZOOM_MAX = 2.5
export const ZOOM_FACTOR = 1.15

// Seeded PRNG (LCG) for stable terrain layout across renders
export function seededRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

export type TerrainType = 'tree' | 'rock' | 'crystal'
export interface TerrainItem { id: number; x: number; y: number; type: TerrainType; scale: number }

export const TERRAIN_ITEMS: TerrainItem[] = (() => {
  const rng = seededRng(0xCAFE1234)
  const types: TerrainType[] = ['tree', 'tree', 'tree', 'rock', 'rock', 'crystal']
  return Array.from({ length: 60 }, (_, i) => ({
    id: i,
    x: rng() * 2500 + 150,
    y: rng() * 2500 + 150,
    type: types[Math.floor(rng() * types.length)],
    scale: 0.75 + rng() * 0.55,
  }))
})()

export const ORE_ROUTES = [1, 2, 3, 4, 5]

// Map tile rendering constants
export const MAP_TILE_W = 64
export const MAP_TILE_H = 32
export const MAP_TILE_DEPTH = 14

export function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '')
  if (c.length !== 6) return [80, 80, 80]
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]
}

export function darkenHex(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgb(${Math.round(r * (1 - factor))},${Math.round(g * (1 - factor))},${Math.round(b * (1 - factor))})`
}
