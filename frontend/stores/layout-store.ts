'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Panel types available in the layout
export type PanelType = 'scanner' | 'chart' | 'comparison' | 'glassbox' | 'cockpit';

export interface PanelConfig {
  id: string;
  type: PanelType;
  title: string;
  visible: boolean;
  minimized: boolean;
}

const DEFAULT_PANELS: PanelConfig[] = [
  { id: 'scanner', type: 'scanner', title: 'Market Scanner', visible: true, minimized: false },
  { id: 'chart', type: 'chart', title: 'Price Discovery', visible: true, minimized: false },
  { id: 'comparison', type: 'comparison', title: 'Platform Comparison', visible: true, minimized: false },
  { id: 'glassbox', type: 'glassbox', title: 'Glass Box', visible: true, minimized: false },
  { id: 'cockpit', type: 'cockpit', title: 'Agent Cockpit', visible: true, minimized: false },
];

interface LayoutStore {
  // Panel configurations
  panels: PanelConfig[];
  
  // Actions
  togglePanelVisibility: (panelId: string) => void;
  togglePanelMinimized: (panelId: string) => void;
  setPanelVisible: (panelId: string, visible: boolean) => void;
  showAllPanels: () => void;
  hideAllPanels: () => void;
  
  // Get visible panels for rendering
  getVisiblePanels: () => PanelConfig[];
  
  // Get visible count
  getVisibleCount: () => number;
}

export const useLayoutStore = create<LayoutStore>()(
  persist(
    (set, get) => ({
      panels: DEFAULT_PANELS,
      
      togglePanelVisibility: (panelId) => set((state) => ({
        panels: state.panels.map((p) =>
          p.id === panelId ? { ...p, visible: !p.visible } : p
        ),
      })),
      
      togglePanelMinimized: (panelId) => set((state) => ({
        panels: state.panels.map((p) =>
          p.id === panelId ? { ...p, minimized: !p.minimized } : p
        ),
      })),
      
      setPanelVisible: (panelId, visible) => set((state) => ({
        panels: state.panels.map((p) =>
          p.id === panelId ? { ...p, visible } : p
        ),
      })),
      
      showAllPanels: () => set((state) => ({
        panels: state.panels.map((p) => ({ ...p, visible: true, minimized: false })),
      })),
      
      hideAllPanels: () => set((state) => ({
        panels: state.panels.map((p) => ({ ...p, visible: false })),
      })),
      
      getVisiblePanels: () => {
        return get().panels.filter((p) => p.visible);
      },
      
      getVisibleCount: () => {
        return get().panels.filter((p) => p.visible).length;
      },
    }),
    {
      name: 'agentpm-layout-v3',
      partialize: (state) => ({
        panels: state.panels,
      }),
    }
  )
);
