export type Person = {
  id: number;
  reported_by?: number | null;
  full_name: string;
  age?: number | null;
  description?: string | null;
  last_seen_location?: string | null;
  last_seen_at?: string | null;
  caregiver_name?: string | null;
  caregiver_phone?: string | null;
  emergency_contact?: string | null;
  medical_notes?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  photo_url?: string | null;
  status?: string | null;
  created_at?: string | null;
};

export type Sighting = {
  id: number;
  person_id: number;
  person_name?: string | null;
  reporter_name?: string | null;
  reporter_phone?: string | null;
  location: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  notes?: string | null;
  confidence?: string | null;
  status?: string | null;
  photo_url?: string | null;
  created_at?: string | null;
};

export type Alert = {
  id: number;
  person_id?: number | null;
  person_name?: string | null;
  sighting_id?: number | null;
  message: string;
  channel?: string | null;
  status?: string | null;
  created_at?: string | null;
};

export type User = {
  id: number;
  name: string;
  email: string;
  role?: string | null;
  phone?: string | null;
  email_verified?: boolean | null;
  avatar_url?: string | null;
  notification_prefs?: string | null;
  created_at?: string | null;
};
