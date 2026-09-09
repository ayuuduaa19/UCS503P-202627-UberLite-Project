import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import { config } from '../config';

export interface TokenPayload extends JwtPayload {
  id: string;
  email: string;
  role: string;
}

/**
 * Generate/sign a new JWT token for a given user payload
 */
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

/**
 * Verify and decode a JWT token using the configured secret
 */
export const verifyToken = <T extends object = TokenPayload>(token: string): T => {
  return jwt.verify(token, config.jwtSecret) as T;
};
