import { create } from 'zustand';
import { type ApiItem, type Snapshot, type AgentFixSummary, type GraphLink, type GraphNode, initializeMockData } from '../mock/data';

interface AppState {
  // Data
  apis: ApiItem[];
  snapshots: Snapshot[];
  fixSummaries: AgentFixSummary[];
  graphData: { nodes: GraphNode[]; links: GraphLink[] };
  isLoading: boolean;
  
  // Actions
  loadLatestData: () => Promise<void>;
}

export const useStore = create<AppState>((set) => ({
  apis: [],
  snapshots: [],
  fixSummaries: [],
  graphData: { nodes: [], links: [] },
  isLoading: true,
  
  loadLatestData: async () => {
    set({ isLoading: true });
    try {
      const data = await initializeMockData();
      set({ 
        apis: data.apis, 
        snapshots: data.snapshots, 
        fixSummaries: data.fixSummaries, 
        graphData: data.graphData,
        isLoading: false 
      });
    } catch (error) {
      console.error('Failed to load mock data:', error);
      set({ isLoading: false });
    }
  }
}));
