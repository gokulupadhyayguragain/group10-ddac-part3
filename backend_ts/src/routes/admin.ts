import { Router } from 'express';
import { pool } from '../db';
import { hashPassword, authMiddleware } from '../auth';
import { getQueueStatus } from '../aws';

const router = Router();

async function requireAdmin(req: any, res: any) {
  const requesting = await pool.query('SELECT role FROM users WHERE id=$1', [req.user.id]);
  if (!requesting.rowCount || requesting.rows[0].role !== 'admin') {
    res.status(403).json({ error: 'admin required' });
    return false;
  }
  return true;
}

router.post('/seed', async (_req, res) => {
  const client = await pool.connect();
  try {
    const u = await client.query('SELECT COUNT(1) FROM users');
    if (Number(u.rows[0].count) === 0) {
      const pwd = hashPassword('password');
      await client.query('INSERT INTO users(name,email,password_hash,role,phone) VALUES($1,$2,$3,$4,$5)', ['Admin User','admin@example.com',pwd,'admin','+100000000']);
      await client.query('INSERT INTO users(name,email,password_hash,role,phone) VALUES($1,$2,$3,$4,$5)', ['Caregiver Demo','caregiver@example.com',pwd,'family','+9779800000001']);
      await client.query('INSERT INTO users(name,email,password_hash,role,phone) VALUES($1,$2,$3,$4,$5)', ['Community Volunteer','volunteer@example.com',pwd,'community','+9779800000002']);
    }
    const p = await client.query('SELECT COUNT(1) FROM missing_persons');
    if (Number(p.rows[0].count) === 0) {
      const person = await client.query(
        `INSERT INTO missing_persons(
          reported_by, full_name, age, description, last_seen_location, last_seen_at,
          caregiver_name, caregiver_phone, emergency_contact, medical_notes,
          latitude, longitude, status
        ) VALUES($1,$2,$3,$4,$5,NOW() - INTERVAL '2 hours',$6,$7,$8,$9,$10,$11,$12)
        RETURNING id`,
        [
          2,
          'Maya Shrestha',
          74,
          'Alzheimer patient, may appear confused and repeatedly ask for her old home.',
          'Jawalakhel, Lalitpur',
          'Sita Shrestha',
          '+9779800000001',
          'Family contact: +9779800000001',
          'Needs calm communication. Avoid crowding. Diabetic medication due at evening.',
          27.672800,
          85.318600,
          'missing',
        ]
      );
      await client.query(
        `INSERT INTO sightings(
          person_id, reported_by, reporter_name, reporter_phone, location,
          latitude, longitude, notes, confidence, status
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          person.rows[0].id,
          3,
          'Community Volunteer',
          '+9779800000002',
          'Near Patan Dhoka',
          27.678500,
          85.320900,
          'Seen walking slowly toward the main road, wearing a blue cardigan.',
          'high',
          'new',
        ]
      );
      await client.query(
        'INSERT INTO alerts(person_id, message, channel, status) VALUES($1,$2,$3,$4)',
        [person.rows[0].id, 'Community sighting received near Patan Dhoka. Caregiver should verify.', 'in-app', 'queued']
      );
    }
    res.json({ seeded: true });
  } finally { client.release(); }
});

router.get('/dashboard', authMiddleware, async (req, res) => {
  if (!(await requireAdmin(req as any, res))) return;
  const [persons, sightings, alerts, users] = await Promise.all([
    pool.query(`SELECT status, COUNT(*)::int AS count FROM missing_persons GROUP BY status`),
    pool.query(`SELECT status, COUNT(*)::int AS count FROM sightings GROUP BY status`),
    pool.query(`SELECT status, COUNT(*)::int AS count FROM alerts GROUP BY status`),
    pool.query(`SELECT role, COUNT(*)::int AS count FROM users GROUP BY role`),
  ]);
  res.json({
    persons: persons.rows,
    sightings: sightings.rows,
    alerts: alerts.rows,
    users: users.rows,
  });
});

router.get('/cloud-status', authMiddleware, async (req, res) => {
  if (!(await requireAdmin(req as any, res))) return;
  try {
    const queue = await getQueueStatus();
    res.json({
      queue,
      s3: {
        configured: Boolean(process.env.S3_BUCKET || process.env.AWS_S3_BUCKET),
        bucket: process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || null,
      },
      sns: {
        configured: Boolean(process.env.SNS_TOPIC_ARN || process.env.AWS_SNS_TOPIC_ARN),
        topicArn: process.env.SNS_TOPIC_ARN || process.env.AWS_SNS_TOPIC_ARN || null,
      },
      secretsManager: {
        configured: Boolean(process.env.SAFETRACE_SECRET_ID || process.env.AWS_SECRETS_MANAGER_SECRET_ID || process.env.AWS_SECRET_ID),
      },
      email: {
        resendConfigured: Boolean(process.env.RESEND_API_KEY || process.env.RESEND_KEY),
        from: process.env.RESEND_FROM_EMAIL || null,
      },
    });
  } catch (error: any) {
    res.status(502).json({ error: error.message || 'Unable to load AWS cloud status' });
  }
});

router.get('/users', authMiddleware, async (req, res) => {
  if (!(await requireAdmin(req as any, res))) return;
  const r = await pool.query('SELECT id, name, email, role, phone, email_verified, created_at FROM users ORDER BY id DESC');
  res.json(r.rows);
});

router.patch('/users/:id', authMiddleware, async (req, res) => {
  if (!(await requireAdmin(req as any, res))) return;
  const id = Number(req.params.id);
  const { name, role, phone } = req.body;
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid user id' });
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
  const allowedRoles = new Set(['admin', 'family', 'community', 'responder']);
  const nextRole = allowedRoles.has(role) ? role : 'family';
  const r = await pool.query(
    `UPDATE users
     SET name=$1, role=$2, phone=$3
     WHERE id=$4
     RETURNING id, name, email, role, phone, email_verified, created_at`,
    [name, nextRole, phone || null, id]
  );
  if (!r.rowCount) return res.status(404).json({ error: 'User not found' });
  res.json(r.rows[0]);
});

export default router;
