import { useRef, useEffect } from 'react'
import type { GameMap, MapTile } from '../../types'
import { MAP_TILE_W, MAP_TILE_H, MAP_TILE_DEPTH, darkenHex } from './battlefieldConstants'

export function BattlefieldMapCanvas({ map }: { map: GameMap }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const canvasW = (map.width + map.height) * (MAP_TILE_W / 2)
  const canvasH = (map.width + map.height) * (MAP_TILE_H / 2) + MAP_TILE_DEPTH + 10
  const offsetX = map.height * (MAP_TILE_W / 2)
  const offsetY = 10

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvasW
    canvas.height = canvasH
    canvas.style.width = `${canvasW}px`
    canvas.style.height = `${canvasH}px`

    ctx.clearRect(0, 0, canvasW, canvasH)

    let tiles: Record<string, MapTile> = {}
    try { tiles = JSON.parse(map.tiles) } catch { /* empty */ }

    const w2 = MAP_TILE_W / 2
    const h2 = MAP_TILE_H / 2

    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) {
        const key = `${col},${row}`
        const tile = tiles[key]
        if (!tile) continue

        const sx = (col - row) * w2 + offsetX
        const sy = (col + row) * h2 + offsetY
        const color = tile.color

        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx + w2, sy + h2)
        ctx.lineTo(sx, sy + MAP_TILE_H)
        ctx.lineTo(sx - w2, sy + h2)
        ctx.closePath()
        ctx.fillStyle = color
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'
        ctx.lineWidth = 0.5
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(sx - w2, sy + h2)
        ctx.lineTo(sx, sy + MAP_TILE_H)
        ctx.lineTo(sx, sy + MAP_TILE_H + MAP_TILE_DEPTH)
        ctx.lineTo(sx - w2, sy + h2 + MAP_TILE_DEPTH)
        ctx.closePath()
        ctx.fillStyle = darkenHex(color, 0.35)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(sx, sy + MAP_TILE_H)
        ctx.lineTo(sx + w2, sy + h2)
        ctx.lineTo(sx + w2, sy + h2 + MAP_TILE_DEPTH)
        ctx.lineTo(sx, sy + MAP_TILE_H + MAP_TILE_DEPTH)
        ctx.closePath()
        ctx.fillStyle = darkenHex(color, 0.55)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'
        ctx.stroke()
      }
    }
  }, [map, canvasW, canvasH, offsetX, offsetY])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    />
  )
}
