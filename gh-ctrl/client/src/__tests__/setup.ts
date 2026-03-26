import '@testing-library/jest-dom'

// Ensure localStorage is fully functional (bun's jsdom integration may provide a broken stub)
function makeLocalStorageMock() {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value) },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (i: number) => Object.keys(store)[i] ?? null,
  }
}

try {
  localStorage.clear()
} catch {
  // localStorage is broken in this jsdom environment — replace it with a working mock
  Object.defineProperty(window, 'localStorage', {
    value: makeLocalStorageMock(),
    writable: true,
    configurable: true,
  })
}

// Reset localStorage before each test to prevent state leakage
beforeEach(() => {
  localStorage.clear()
})

// Suppress console errors in tests for cleaner output
// (remove if you want to see React prop-types warnings etc.)
const originalError = console.error
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const msg = String(args[0])
    if (
      msg.includes('Warning: ReactDOM.render') ||
      msg.includes('Warning: An update to') ||
      msg.includes('act(')
    ) {
      return
    }
    originalError(...args)
  }
})

afterAll(() => {
  console.error = originalError
})
