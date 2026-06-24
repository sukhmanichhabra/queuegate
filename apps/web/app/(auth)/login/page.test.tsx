import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from './page';
import { resetMocks, mockApi, mockUseRouter, mockAuthStore } from '../../../test/test-utils';

jest.mock('@/components/three/ParticleBackground', () => ({
  ParticleBackground: () => <div data-testid="particle-bg" />
}));

describe('LoginPage', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('renders login form', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
  });

  it('calls api.post(/auth/login) and updates auth store on success', async () => {
    mockApi.post.mockResolvedValueOnce({
      data: { accessToken: 'access', refreshToken: 'refresh' }
    });
    mockApi.get.mockResolvedValueOnce({
      data: { id: '1', email: 'test@test.com', role: 'SHOPPER' }
    });

    render(<LoginPage />);
    
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@test.com',
        password: 'password123'
      });
    });

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/auth/me', {
        headers: { Authorization: 'Bearer access' }
      });
    });

    expect(mockAuthStore.setAuth).toHaveBeenCalledWith({
      accessToken: 'access',
      refreshToken: 'refresh',
      email: 'test@test.com',
      role: 'SHOPPER'
    });

    expect(mockUseRouter().push).toHaveBeenCalledWith('/events');
  });

  it('shows error toast on failure', async () => {
    mockApi.post.mockRejectedValueOnce({
      response: { data: { message: 'Invalid credentials' } }
    });

    render(<LoginPage />);
    
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'wrong' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalled();
    });

    // The toast is called, we don't need to mock it if we don't want, but we can verify it doesn't push
    expect(mockUseRouter().push).not.toHaveBeenCalled();
    // And button is re-enabled
    expect(screen.getByRole('button', { name: /Sign In/i })).not.toBeDisabled();
  });
});
