import { Router } from 'express';
import { pool } from '../db';
import { authMiddleware } from '../auth';
import { maybeStoreDataUrl } from '../cloud';

const router = Router();

router.post('/', authMiddleware, async (req, res) => {
  const {
    full_name,
    age,
    description,
    last_seen_location,
    last_seen_at,
    caregiver_name,
    caregiver_phone,
    emergency_contact,
    medical_notes,
    latitude,
    longitude,
    photo_url,
    status,
  } = req.body;
  if (!full_name || !String(full_name).trim()) {
    return res.status(400).json({ error: 'full_name is required' });
  }
  const storedPhoto = await maybeStoreDataUrl(photo_url || null, 'persons');
  const r = await pool.query(
    `INSERT INTO missing_persons(
      reported_by, full_name, age, description, last_seen_location, last_seen_at,
      caregiver_name, caregiver_phone, emergency_contact, medical_notes,
      latitude, longitude, photo_url, status
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING id`,
    [
      (req as any).user.id,
      full_name,
      age || null,
      description || null,
      last_seen_location || null,
      last_seen_at || null,
      caregiver_name || null,
      caregiver_phone || null,
      emergency_contact || null,
      medical_notes || null,
      latitude || null,
      longitude || null,
      storedPhoto,
      status || 'missing',
    ]
  );
  res.json({ id: r.rows[0].id });
});

router.get('/', async (_req, res) => {
  const r = await pool.query(`
    SELECT id, reported_by, full_name, age, description, last_seen_location, last_seen_at,
           caregiver_name, caregiver_phone, emergency_contact, medical_notes,
           latitude, longitude, photo_url, status, created_at
    FROM missing_persons
    ORDER BY id DESC
  `);
  res.json(r.rows);
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid person id' });
  }
  const r = await pool.query(`
    SELECT id, reported_by, full_name, age, description, last_seen_location, last_seen_at,
           caregiver_name, caregiver_phone, emergency_contact, medical_notes,
           latitude, longitude, photo_url, status, created_at
    FROM missing_persons
    WHERE id=$1
  `, [id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Person not found' });
  res.json(r.rows[0]);
});

router.patch('/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const {
    full_name,
    age,
    description,
    last_seen_location,
    last_seen_at,
    caregiver_name,
    caregiver_phone,
    emergency_contact,
    medical_notes,
    latitude,
    longitude,
    photo_url,
    status,
  } = req.body;
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid person id' });
  }
  if (!full_name || !String(full_name).trim()) {
    return res.status(400).json({ error: 'full_name is required' });
  }
  const storedPhoto = await maybeStoreDataUrl(photo_url || null, 'persons');
  const r = await pool.query(
    `UPDATE missing_persons
     SET full_name=$1, age=$2, description=$3, last_seen_location=$4, last_seen_at=$5,
         caregiver_name=$6, caregiver_phone=$7, emergency_contact=$8, medical_notes=$9,
         latitude=$10, longitude=$11, photo_url=$12, status=$13
     WHERE id=$14
     RETURNING id, reported_by, full_name, age, description, last_seen_location, last_seen_at,
               caregiver_name, caregiver_phone, emergency_contact, medical_notes,
               latitude, longitude, photo_url, status, created_at`,
    [
      full_name,
      age || null,
      description || null,
      last_seen_location || null,
      last_seen_at || null,
      caregiver_name || null,
      caregiver_phone || null,
      emergency_contact || null,
      medical_notes || null,
      latitude || null,
      longitude || null,
      storedPhoto,
      status || 'missing',
      id,
    ]
  );
  if (!r.rowCount) return res.status(404).json({ error: 'Person not found' });
  res.json(r.rows[0]);
});

router.put('/:id/status', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body.status || '').trim();
  const allowed = new Set(['missing', 'found', 'safe', 'closed', 'archived']);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid person id' });
  if (!allowed.has(status)) return res.status(400).json({ error: 'Invalid status' });
  const r = await pool.query(
    `UPDATE missing_persons
     SET status=$1
     WHERE id=$2
     RETURNING id, full_name, status`,
    [status, id]
  );
  if (!r.rowCount) return res.status(404).json({ error: 'Person not found' });
  res.json(r.rows[0]);
});

router.delete('/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid person id' });
  const r = await pool.query('DELETE FROM missing_persons WHERE id=$1 RETURNING id', [id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Person not found' });
  res.json({ deleted: true, id });
});

export default router;
