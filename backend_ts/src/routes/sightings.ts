import { Router } from 'express';
import { pool } from '../db';
import { authMiddleware } from '../auth';
import { dispatchCloudAlert, maybeStoreDataUrl } from '../cloud';

const router = Router();

router.post('/', authMiddleware, async (req, res) => {
  const {
    person_id,
    location,
    latitude,
    longitude,
    notes,
    reporter_name,
    reporter_phone,
    confidence,
    photo_url,
  } = req.body;
  const numericPersonId = Number(person_id);
  if (!Number.isInteger(numericPersonId) || numericPersonId <= 0) {
    return res.status(400).json({ error: 'Invalid person_id' });
  }
  if (!location || !String(location).trim()) {
    return res.status(400).json({ error: 'Location is required' });
  }
  const rcheck = await pool.query('SELECT id FROM missing_persons WHERE id=$1', [numericPersonId]);
  if (!rcheck.rowCount) return res.status(404).json({ error: 'Person not found' });
  const storedPhoto = await maybeStoreDataUrl(photo_url || null, 'sightings');
  const r = await pool.query(
    `INSERT INTO sightings(
      person_id, reported_by, reporter_name, reporter_phone, location,
      latitude, longitude, notes, confidence, photo_url
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING id, person_id, location, latitude, longitude, notes, confidence, status, created_at`,
    [
      numericPersonId,
      (req as any).user.id,
      reporter_name || null,
      reporter_phone || null,
      location,
      latitude || null,
      longitude || null,
      notes || null,
      confidence || 'medium',
      storedPhoto,
    ]
  );

  const alertMessage = `New sighting for person #${numericPersonId} at ${location}`;
  await pool.query(
    'INSERT INTO alerts(person_id, sighting_id, message, channel, status) VALUES($1,$2,$3,$4,$5)',
    [numericPersonId, r.rows[0].id, alertMessage, 'in-app', 'queued']
  );
  await dispatchCloudAlert({ personId: numericPersonId, sightingId: r.rows[0].id, message: alertMessage, channel: 'in-app' });
  res.json(r.rows[0]);
});

router.get('/', async (_req, res) => {
  const r = await pool.query(`
    SELECT s.id, s.person_id, p.full_name AS person_name, s.reported_by, s.reporter_name,
           s.reporter_phone, s.location, s.latitude, s.longitude, s.notes,
           s.confidence, s.status, s.photo_url, s.created_at
    FROM sightings s
    JOIN missing_persons p ON p.id = s.person_id
    ORDER BY s.id DESC
  `);
  res.json(r.rows);
});

router.get('/:personId', async (req, res) => {
  const personId = Number(req.params.personId);
  const r = await pool.query(`
    SELECT id, person_id, reported_by, reporter_name, reporter_phone, location,
           latitude, longitude, notes, confidence, status, photo_url, created_at
    FROM sightings
    WHERE person_id=$1
    ORDER BY id DESC
  `, [personId]);
  res.json(r.rows);
});

router.patch('/:id/status', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body.status || '').trim();
  const allowed = new Set(['new', 'reviewing', 'verified', 'dismissed', 'archived']);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid sighting id' });
  if (!allowed.has(status)) return res.status(400).json({ error: 'Invalid status' });
  const r = await pool.query(
    'UPDATE sightings SET status=$1 WHERE id=$2 RETURNING id, person_id, status',
    [status, id]
  );
  if (!r.rowCount) return res.status(404).json({ error: 'Sighting not found' });
  res.json(r.rows[0]);
});

router.delete('/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid sighting id' });
  const r = await pool.query('DELETE FROM sightings WHERE id=$1 RETURNING id', [id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Sighting not found' });
  res.json({ deleted: true, id });
});

export default router;
