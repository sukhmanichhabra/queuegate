import React from 'react';
import { render } from '@testing-library/react';

// Setup Mock for next/navigation
export const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  refresh: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
};
export const mockUseRouter = jest.fn(() => mockRouter);
export const mockUsePathname = jest.fn(() => '/');
export const mockUseParams = jest.fn(() => ({}));

jest.mock('next/navigation', () => ({
  useRouter: () => mockUseRouter(),
  usePathname: () => mockUsePathname(),
  useParams: () => mockUseParams(),
}));

// Setup Mock for lib/api
export const mockApi = {
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
};

jest.mock('@/lib/api', () => ({
  api: mockApi,
}));

// Setup Mock for hooks/useQueueSocket
export const mockUseQueueSocket = jest.fn();
jest.mock('@/hooks/useQueueSocket', () => ({
  useQueueSocket: () => mockUseQueueSocket(),
}));

// Setup Mock for stores/auth-store
export const mockAuthStore = {
  token: null,
  role: null,
  email: null,
  setAuth: jest.fn(),
  logout: jest.fn(),
  clearAuth: jest.fn(),
  hydrate: jest.fn(),
};

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: any) => {
    // If no selector is provided, return the whole store mock
    if (!selector) return mockAuthStore;
    // Otherwise execute the selector with the mock state
    return selector(mockAuthStore);
  },
}));

// Setup Mock for lib/socket
export const mockSocket = {
  connected: true,
  emit: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  off: jest.fn(),
};

jest.mock('@/lib/socket', () => ({
  socket: mockSocket,
  connectSocket: jest.fn(),
  disconnectSocket: jest.fn(),
}));

// Setup Mock for hooks/useRoleGuard
export const mockUseRoleGuard = jest.fn();
jest.mock('@/hooks/useRoleGuard', () => ({
  useRoleGuard: (role: string) => mockUseRoleGuard(role),
}));

// Setup Mock for hooks/useMerchantStats
export const mockUseMerchantStats = jest.fn();
jest.mock('@/hooks/useMerchantStats', () => ({
  useMerchantStats: (eventId: string) => mockUseMerchantStats(eventId),
}));

// Setup Mock for stores/queue-store
export const mockQueueStore = {
  position: 10,
  total: 100,
  etaSeconds: 60,
  status: 'WAITING',
  checkoutToken: null,
  expiresAt: null,
  entryId: null,
  sessionId: 'test-session',
  eventId: 'test-event',
  isHydrated: true,
  setQueueState: jest.fn(),
  setAdmitted: jest.fn(),
  setExpired: jest.fn(),
  setPosition: jest.fn(),
  reset: jest.fn(),
};

jest.mock('@/stores/queue-store', () => ({
  useQueueStore: (selector: any) => {
    // If it's the default import (as used in useQueueStore.getState()), return the store mock
    if (selector && selector.getState) return mockQueueStore;
    if (!selector) return mockQueueStore;
    return selector(mockQueueStore);
  },
}));
// Also mock it for getState
(mockQueueStore as any).getState = () => mockQueueStore;

// Export a custom render if needed, or just standard RTL utilities
export * from '@testing-library/react';

// Helper to reset all mocks before each test
export const resetMocks = () => {
  jest.clearAllMocks();
  
  mockUseRouter.mockClear();
  mockRouter.push.mockReset();
  mockRouter.replace.mockReset();
  mockRouter.refresh.mockReset();
  mockUsePathname.mockReset();
  mockUsePathname.mockReturnValue('/');
  mockUseParams.mockReset();
  mockUseParams.mockReturnValue({});
  
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.delete.mockReset();
  
  mockUseQueueSocket.mockReset();
  
  // Reset auth store default state
  mockAuthStore.token = null;
  mockAuthStore.role = null;
  mockAuthStore.email = null;
  mockAuthStore.setAuth.mockReset();
  mockAuthStore.logout.mockReset();
  mockAuthStore.clearAuth.mockReset();
  mockAuthStore.hydrate.mockReset();

  // Reset useRoleGuard and useMerchantStats
  mockUseRoleGuard.mockReset();
  mockUseRoleGuard.mockReturnValue({ isAuthorized: true });
  mockUseMerchantStats.mockReset();
  mockUseMerchantStats.mockReturnValue({
    stats: { queueDepth: 0, admissionRate: 0, throttleActive: false },
    rateHistory: []
  });

  // Reset queue store default state
  mockQueueStore.position = 10;
  mockQueueStore.etaSeconds = 60;
  mockQueueStore.status = 'WAITING';
  mockQueueStore.checkoutToken = null;
  mockQueueStore.setQueueState.mockReset();
  mockQueueStore.setAdmitted.mockReset();
  mockQueueStore.setAdmitted.mockReset();
  mockQueueStore.setExpired.mockReset();
  mockQueueStore.setPosition.mockReset();
  mockQueueStore.reset.mockReset();

  // Reset socket mock
  mockSocket.connected = true;
  mockSocket.emit.mockReset();
  mockSocket.on.mockReset();
  mockSocket.once.mockReset();
  mockSocket.off.mockReset();
};
