import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { loadRuntimeSecrets } from './aws';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: '8mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'backend-ts' }));

const PORT = Number(process.env.PORT || 5000);

async function bootstrap() {
  await loadRuntimeSecrets();
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);

  const [
    cookieParser,
    passport,
    googleRouter,
    authRoutes,
    personsRoutes,
    sightingsRoutes,
    alertsRoutes,
    adminRoutes,
    uploadsRoutes,
    db,
  ] = await Promise.all([
    import('cookie-parser').then((module) => module.default),
    import('./auth/google').then((module) => module.default),
    import('./routes/google').then((module) => module.default),
    import('./routes/auth').then((module) => module.default),
    import('./routes/persons').then((module) => module.default),
    import('./routes/sightings').then((module) => module.default),
    import('./routes/alerts').then((module) => module.default),
    import('./routes/admin').then((module) => module.default),
    import('./routes/uploads').then((module) => module.default),
    import('./db'),
  ]);

  app.use(cookieParser());
  app.use(passport.initialize());
  app.use('/api/auth', googleRouter);
  app.use('/api/auth', authRoutes);
  app.use('/api/persons', personsRoutes);
  app.use('/api/sightings', sightingsRoutes);
  app.use('/api/alerts', alertsRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/uploads', uploadsRoutes);

  await db.initDb();
  app.listen(PORT, () => console.log(`Backend (TS) listening on ${PORT}`));
}

bootstrap().catch(err => {
  console.error('App bootstrap failed', err);
  process.exit(1);
});

export default app;
