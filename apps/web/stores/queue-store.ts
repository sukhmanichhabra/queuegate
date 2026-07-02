import { create } from 'zustand';

interface QueueState {
  position: number | null;
  total: number;
  etaSeconds: number | null;
  status: 'WAITING' | 'ADMITTED' | 'EXPIRED' | 'COMPLETED' | 'IDLE';
  checkoutToken: string | null;
  expiresAt: string | null;
  entryId: string | null;
  sessionId: string | null;
  eventId: string | null;
  isHydrated: boolean;
  // Ticket category fields
  categoryId: string | null;
  categoryName: string | null;
  categoryPrice: number | null;
  categoryColor: string | null;

  setPosition: (data: { position: number; total: number; etaSeconds: number }) => void;
  setAdmitted: (data: { checkoutToken: string; expiresAt: string; entryId: string }) => void;
  setExpired: () => void;
  reset: () => void;
  setQueueState: (state: Partial<QueueState>) => void;
  setCategory: (cat: { categoryId: string; categoryName: string; categoryPrice: number; categoryColor: string }) => void;
}

export const useQueueStore = create<QueueState>((set) => ({
  position: null,
  total: 0,
  etaSeconds: null,
  status: 'IDLE',
  checkoutToken: null,
  expiresAt: null,
  entryId: null,
  sessionId: null,
  eventId: null,
  isHydrated: false,
  categoryId: null,
  categoryName: null,
  categoryPrice: null,
  categoryColor: null,

  setPosition: (data) =>
    set((state) => ({
      ...state,
      position:    data.position,
      total:       data.total,
      etaSeconds:  data.etaSeconds,
      status:      state.status === 'IDLE' ? 'WAITING' : state.status,
      isHydrated:  true,
    })),

  setAdmitted: (data) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('queuegate_checkout_token', data.checkoutToken);
      localStorage.setItem('queuegate_expires_at',     data.expiresAt);
      localStorage.setItem('queuegate_entry_id',       data.entryId);
    }
    set({
      status:        'ADMITTED',
      checkoutToken: data.checkoutToken,
      expiresAt:     data.expiresAt,
      entryId:       data.entryId,
    });
  },

  setExpired: () => set({ status: 'EXPIRED' }),

  setCategory: (cat) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('queuegate_category_id',    cat.categoryId);
      localStorage.setItem('queuegate_category_name',  cat.categoryName);
      localStorage.setItem('queuegate_category_price', String(cat.categoryPrice));
      localStorage.setItem('queuegate_category_color', cat.categoryColor);
    }
    set({
      categoryId:    cat.categoryId,
      categoryName:  cat.categoryName,
      categoryPrice: cat.categoryPrice,
      categoryColor: cat.categoryColor,
    });
  },

  reset: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('queuegate_checkout_token');
      localStorage.removeItem('queuegate_expires_at');
      localStorage.removeItem('queuegate_entry_id');
      localStorage.removeItem('queuegate_category_id');
      localStorage.removeItem('queuegate_category_name');
      localStorage.removeItem('queuegate_category_price');
      localStorage.removeItem('queuegate_category_color');
    }
    set({
      position:      null,
      total:         0,
      etaSeconds:    null,
      status:        'IDLE',
      checkoutToken: null,
      expiresAt:     null,
      entryId:       null,
      sessionId:     null,
      eventId:       null,
      isHydrated:    false,
      categoryId:    null,
      categoryName:  null,
      categoryPrice: null,
      categoryColor: null,
    });
  },

  setQueueState: (newState) =>
    set((state) => ({
      ...state,
      ...newState,
      position:   newState.position ?? state.position,
      isHydrated: true,
    })),
}));
