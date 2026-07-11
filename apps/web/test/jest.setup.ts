import '@testing-library/jest-dom';

// Setup common Next.js mocks if needed or let test-utils handle them
import './test-utils';

// Mock IntersectionObserver
class IntersectionObserver {
  observe = jest.fn()
  disconnect = jest.fn()
  unobserve = jest.fn()
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: IntersectionObserver,
})


// Mock ResizeObserver
class ResizeObserver {
  observe = jest.fn()
  disconnect = jest.fn()
  unobserve = jest.fn()
}
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: ResizeObserver,
})


// Mock window.scrollTo
window.scrollTo = jest.fn();

