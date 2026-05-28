import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgresql://safetrace:safetrace@db:5432/safetrace';
export const pool = new Pool({ connectionString });

export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'family',
        phone TEXT,
        email_verified BOOLEAN DEFAULT TRUE,
        email_verified_at TIMESTAMPTZ,
        verification_code_hash TEXT,
        verification_code_expires_at TIMESTAMPTZ,
        verification_attempts INT DEFAULT 0,
        verification_sent_at TIMESTAMPTZ,
        avatar_url TEXT,
        notification_prefs TEXT DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS missing_persons (
        id SERIAL PRIMARY KEY,
        reported_by INT REFERENCES users(id) ON DELETE SET NULL,
        full_name TEXT NOT NULL,
        age INT,
        description TEXT,
        last_seen_location TEXT,
        last_seen_at TIMESTAMPTZ,
        caregiver_name TEXT,
        caregiver_phone TEXT,
        emergency_contact TEXT,
        medical_notes TEXT,
        latitude DECIMAL(9,6),
        longitude DECIMAL(9,6),
        photo_url TEXT,
        status TEXT DEFAULT 'missing',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sightings (
        id SERIAL PRIMARY KEY,
        person_id INT NOT NULL REFERENCES missing_persons(id) ON DELETE CASCADE,
        reported_by INT REFERENCES users(id) ON DELETE SET NULL,
        reporter_name TEXT,
        reporter_phone TEXT,
        location TEXT NOT NULL,
        latitude DECIMAL(9,6),
        longitude DECIMAL(9,6),
        notes TEXT,
        confidence TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'new',
        photo_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        person_id INT REFERENCES missing_persons(id) ON DELETE CASCADE,
        sighting_id INT REFERENCES sightings(id) ON DELETE SET NULL,
        message TEXT NOT NULL,
        channel TEXT DEFAULT 'in-app',
        status TEXT DEFAULT 'queued',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE missing_persons ADD COLUMN IF NOT EXISTS reported_by INT REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE missing_persons ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
      ALTER TABLE missing_persons ADD COLUMN IF NOT EXISTS caregiver_name TEXT;
      ALTER TABLE missing_persons ADD COLUMN IF NOT EXISTS caregiver_phone TEXT;
      ALTER TABLE missing_persons ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
      ALTER TABLE missing_persons ADD COLUMN IF NOT EXISTS medical_notes TEXT;
      ALTER TABLE missing_persons ADD COLUMN IF NOT EXISTS latitude DECIMAL(9,6);
      ALTER TABLE missing_persons ADD COLUMN IF NOT EXISTS longitude DECIMAL(9,6);
      ALTER TABLE missing_persons ADD COLUMN IF NOT EXISTS photo_url TEXT;

      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs TEXT DEFAULT '{}';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT TRUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_hash TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_expires_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_attempts INT DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_sent_at TIMESTAMPTZ;
      UPDATE users SET email_verified = TRUE WHERE email_verified IS NULL;

      ALTER TABLE sightings ADD COLUMN IF NOT EXISTS reported_by INT REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE sightings ADD COLUMN IF NOT EXISTS reporter_name TEXT;
      ALTER TABLE sightings ADD COLUMN IF NOT EXISTS reporter_phone TEXT;
      ALTER TABLE sightings ADD COLUMN IF NOT EXISTS latitude DECIMAL(9,6);
      ALTER TABLE sightings ADD COLUMN IF NOT EXISTS longitude DECIMAL(9,6);
      ALTER TABLE sightings ADD COLUMN IF NOT EXISTS confidence TEXT DEFAULT 'medium';
      ALTER TABLE sightings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new';
      ALTER TABLE sightings ADD COLUMN IF NOT EXISTS photo_url TEXT;
    `);
  } finally {
    client.release();
  }
}
