#!/usr/bin/env node
/**
 * Version bump script following semantic versioning (semver).
 *
 * Usage:
 *   node scripts/bump-version.js [patch|minor|major]
 *
 * Defaults to 'patch' if no argument is provided.
 *
 * Examples:
 *   node scripts/bump-version.js         -> 1.0.0 => 1.0.1
 *   node scripts/bump-version.js patch   -> 1.0.0 => 1.0.1
 *   node scripts/bump-version.js minor   -> 1.0.0 => 1.1.0
 *   node scripts/bump-version.js major   -> 1.0.0 => 2.0.0
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgPath = resolve(__dirname, '../package.json')

const bumpType = process.argv[2] || 'patch'

if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error(`Invalid bump type: "${bumpType}". Use patch, minor, or major.`)
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const [major, minor, patch] = pkg.version.split('.').map(Number)

let nextVersion
if (bumpType === 'major') nextVersion = `${major + 1}.0.0`
else if (bumpType === 'minor') nextVersion = `${major}.${minor + 1}.0`
else nextVersion = `${major}.${minor}.${patch + 1}`

pkg.version = nextVersion
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

console.log(`Bumped version: ${major}.${minor}.${patch} → ${nextVersion}`)
