import { Router } from 'express';
import { pool } from '../db';
import { authMiddleware } from '../auth';
import { dispatchCloudAlert } from '../cloud';

const router = Router();

router.get('/', async (_req, res) => {
  const r = await pool.query(`
    SELECT a.id, a.person_id, p.full_name AS person_name, a.sighting_id,
           a.message, a.channel, a.status, a.created_at
    FROM alerts a
    LEFT JOIN missing_persons p ON p.id = a.person_id
    ORDER BY a.id DESC
  `);
  res.json(r.rows);
});

router.post('/', authMiddleware, async (req, res) => {
  const { person_id, message, channel } = req.body;
  const numericPersonId = Number(person_id);
  if (!Number.isInteger(numericPersonId) || numericPersonId <= 0) {
    return res.status(400).json({ error: 'Invalid person_id' });
  }
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  const exists = await pool.query('SELECT id FROM missing_persons WHERE id=$1', [numericPersonId]);
  if (!exists.rowCount) return res.status(404).json({ error: 'Person not found' });
  const r = await pool.query(
    `INSERT INTO alerts(person_id, message, channel, status)
     VALUES($1,$2,$3,'queued')
     RETURNING id, person_id, message, channel, status, created_at`,
    [numericPersonId, message, channel || 'in-app']
  );
  await dispatchCloudAlert({ personId: numericPersonId, message, channel: channel || 'in-app' });
  res.json(r.rows[0]);
});

router.patch('/:id/status', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body.status || '').trim();
  const allowed = new Set(['queued', 'sent', 'acknowledged', 'failed', 'archived']);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid alert id' });
  if (!allowed.has(status)) return res.status(400).json({ error: 'Invalid status' });
  const r = await pool.query(
    'UPDATE alerts SET status=$1 WHERE id=$2 RETURNING id, person_id, message, channel, status, created_at',
    [status, id]
  );
  if (!r.rowCount) return res.status(404).json({ error: 'Alert not found' });
  res.json(r.rows[0]);
});

router.delete('/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid alert id' });
  const r = await pool.query('DELETE FROM alerts WHERE id=$1 RETURNING id', [id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Alert not found' });
  res.json({ deleted: true, id });
});

export default router;
