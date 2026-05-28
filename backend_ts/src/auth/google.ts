import passport from 'passport';
import { Strategy as GoogleStrategy, VerifyCallback } from 'passport-google-oauth20';
import { pool } from '../db';

// Load env vars (already loaded via dotenv in app.ts)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID as string;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET as string;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_OAUTH_CALLBACK_URL as string;
export const isGoogleAuthConfigured = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_CALLBACK_URL);

if (!isGoogleAuthConfigured) {
  console.warn('Google OAuth env vars missing – Google login will be disabled');
}

// Configure Passport Google Strategy
if (isGoogleAuthConfigured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
      },
      async (_accessToken: string, _refreshToken: string, profile: any, done: VerifyCallback) => {
        try {
          // Extract email and name from Google profile
          const email = profile.emails?.[0]?.value;
          const name = profile.displayName || profile.name?.givenName || 'GoogleUser';
          if (!email) return done(null, false);

          // Look up user in DB, create if it does not exist.
          const result = await pool.query(
            'SELECT id, role FROM users WHERE email = $1',
            [email]
          );
          let userId: number;
          let role: string;
          if (result.rowCount) {
            userId = result.rows[0].id;
            role = result.rows[0].role;
          } else {
            const insert = await pool.query(
              'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, role',
              [name, email, '', 'family']
            );
            userId = insert.rows[0].id;
            role = insert.rows[0].role;
          }
          return done(null, { id: userId, role });
        } catch (err) {
          console.error('Google OAuth error:', err);
          return done(err, false);
        }
      }
    )
  );
}

// Serialize / deserialize (minimal – we store whole user object in session if ever used)
passport.serializeUser((user: any, cb) => cb(null, user));
passport.deserializeUser((obj: any, cb) => cb(null, obj));

export default passport;
