import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NavBar } from './NavBar';
import { mockAuthStore, resetMocks, mockUsePathname, mockUseRouter, mockApi } from '../test/test-utils';

describe('NavBar', () => {
  beforeEach(() => {
    resetMocks();
    mockUsePathname.mockReturnValue('/some-page');
  });

  it('renders login/register links when user is NOT authenticated (no auth store state)', () => {
    mockAuthStore.email = null;
    render(<NavBar />);
    
    expect(screen.getByText(/login/i)).toBeInTheDocument();
    expect(screen.getByText(/register/i)).toBeInTheDocument();
  });

  it('renders merchant dashboard link when user is MERCHANT_ADMIN', () => {
    mockAuthStore.email = 'merchant@test.com';
    mockAuthStore.role = 'MERCHANT_ADMIN';
    render(<NavBar />);
    
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('My Events')).toBeInTheDocument();
  });

  it('renders admin dashboard link when user is OPS_ADMIN', () => {
    mockAuthStore.email = 'admin@test.com';
    mockAuthStore.role = 'OPS_ADMIN';
    render(<NavBar />);
    
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('All Events')).toBeInTheDocument();
  });

  it('does NOT render admin link when user is MERCHANT_ADMIN (cross-role bleed check)', () => {
    mockAuthStore.email = 'merchant@test.com';
    mockAuthStore.role = 'MERCHANT_ADMIN';
    render(<NavBar />);
    
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('clicking logout calls api.post(/auth/logout) before clearing auth state', async () => {
    mockAuthStore.email = 'user@test.com';
    mockAuthStore.role = 'SHOPPER';
    
    // Setup local storage mock for the test
    const localStorageMock = {
      getItem: jest.fn((key) => key === 'refreshToken' ? 'mock-refresh' : 'mock-access'),
      setItem: jest.fn(),
      clear: jest.fn()
    };
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

    render(<NavBar />);
    
    const signOutBtn = screen.getByText('Sign Out', { exact: false });
    fireEvent.click(signOutBtn);
    
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/auth/logout', {
        refreshToken: 'mock-refresh',
        accessToken: 'mock-access'
      });
    });
    
    expect(mockAuthStore.clearAuth).toHaveBeenCalled();
    expect(mockUseRouter().push).toHaveBeenCalledWith('/login');
  });
});
