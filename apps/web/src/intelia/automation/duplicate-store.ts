import { create } from "zustand";

export type DuplicateRequest = { taskId: string; title: string };

// The duplicate that waits for a level to be chosen. The dialog lives in a
// host mounted once in the authenticated layout: the context menu that asks
// for it unmounts as soon as the menu closes.
export const useDuplicateAutomationStore = create<{
  request: DuplicateRequest | null;
  ask: (request: DuplicateRequest) => void;
  close: () => void;
}>((set) => ({
  request: null,
  ask: (request) => set({ request }),
  close: () => set({ request: null }),
}));
