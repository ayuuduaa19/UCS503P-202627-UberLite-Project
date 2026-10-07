import { useContext } from 'react';
import { RouterContext, type RouterContextType } from './routerContextDef';

export function useRouter(): RouterContextType {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within a Router');
  }
  return context;
}
