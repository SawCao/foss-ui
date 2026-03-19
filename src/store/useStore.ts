import { create } from 'zustand';
import { type ApiItem, type Snapshot, mockApis, mockSnapshots, mockFixSummaries, mockGraphData } from '../mock/data';

interface AppState {
  // Data
  apis: ApiItem[];
  snapshots: Snapshot[];
  fixSummaries: typeof mockFixSummaries;
  graphData: typeof mockGraphData;
  
  // Actions
  // (In a real app, these would be fetch calls)
  loadLatestData: () => void;
}

export const useStore = create<AppState>((set) => ({
  apis: mockApis,
  snapshots: mockSnapshots,
  fixSummaries: mockFixSummaries,
  graphData: mockGraphData,
  
  loadLatestData: () => {
    // simulate loading
    set({ apis: mockApis });
  }
}));
