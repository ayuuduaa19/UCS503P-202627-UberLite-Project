import { createContext } from 'react';

export interface RouterContextType {
  path: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

export const RouterContext = createContext<RouterContextType | undefined>(undefined);
