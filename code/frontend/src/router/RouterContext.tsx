import {
  useCallback,
  useEffect,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { RouterContext } from './routerContextDef';
import { useRouter } from './useRouter';

export function Router({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname || '/';
    }
    return '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname || '/');
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    if (typeof window === 'undefined') return;

    if (options?.replace) {
      window.history.replaceState({}, '', to);
    } else {
      window.history.pushState({}, '', to);
    }
    const url = new URL(to, window.location.origin);
    setPath(url.pathname);
    window.scrollTo(0, 0);
  }, []);

  return (
    <RouterContext.Provider value={{ path, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  replace?: boolean;
  children: ReactNode;
}

export function Link({ to, replace = false, children, onClick, ...rest }: LinkProps) {
  const { navigate } = useRouter();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (onClick) {
      onClick(e);
    }
    if (
      !e.defaultPrevented &&
      e.button === 0 &&
      !e.metaKey &&
      !e.altKey &&
      !e.ctrlKey &&
      !e.shiftKey
    ) {
      e.preventDefault();
      navigate(to, { replace });
    }
  };

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}

export function Navigate({ to, replace = true }: { to: string; replace?: boolean }) {
  const { navigate } = useRouter();

  useEffect(() => {
    navigate(to, { replace });
  }, [to, replace, navigate]);

  return null;
}
