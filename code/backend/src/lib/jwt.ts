import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import { config } from '../config';

export interface TokenPayload extends JwtPayload {
  id: string;
  email: string;
  role: string;
  userId?: string;
}

export const signToken = (
  payload: TokenPayload,
  options?: SignOptions
): string => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: (config.jwtExpiresIn as any) || '7d',
    ...options,
  });
};

export const generateToken = signToken;

export const verifyToken = <T extends object = TokenPayload>(token: string): T => {
  return jwt.verify(token, config.jwtSecret) as T;
};
