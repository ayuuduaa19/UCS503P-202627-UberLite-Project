import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  role: Role | string;
  name?: string;
  phone?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

