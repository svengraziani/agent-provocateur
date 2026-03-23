import '@testing-library/jest-dom'

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
