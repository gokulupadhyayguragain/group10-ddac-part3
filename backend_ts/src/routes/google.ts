import { Router } from 'express';
import passport, { isGoogleAuthConfigured } from '../auth/google';
import { signToken } from '../auth';

const router = Router();

// Initiates Google login
router.get('/google', (req, res, next) => {
  if (!isGoogleAuthConfigured) return res.status(503).json({ error: 'Google OAuth is not configured' });
  return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// Google callback – issue JWT and redirect to frontend
router.get(
  '/google/callback',
  (req, res, next) => {
    if (!isGoogleAuthConfigured) return res.status(503).json({ error: 'Google OAuth is not configured' });
    return passport.authenticate('google', { session: false, failureRedirect: '/' })(req, res, next);
  },
  (req, res) => {
    const user = (req as any).user as { id: number; role: string };
    const token = signToken(user.id);
    // Set JWT in HttpOnly cookie
    const redirectUrl = process.env.FRONTEND_PUBLIC_URL || '/';
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: redirectUrl.startsWith('https://'),
      sameSite: 'lax',
      maxAge: 3600 * 1000, // 1 hour
    });
    res.redirect(redirectUrl);
  }
);

export default router;
