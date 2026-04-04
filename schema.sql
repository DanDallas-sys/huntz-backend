-- ============================================================
--  HUNTZ DATABASE SCHEMA
--  Run this file in your PostgreSQL database to set up all tables
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  user_type     TEXT NOT NULL CHECK (user_type IN ('seeker', 'employer')),
  state         TEXT,
  nin           TEXT,
  nin_verified  BOOLEAN DEFAULT FALSE,
  id_doc_url    TEXT,
  id_verified   BOOLEAN DEFAULT FALSE,
  email_verified BOOLEAN DEFAULT FALSE,
  email_verify_token TEXT,
  reset_token   TEXT,
  reset_token_expires TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Seeker Profiles ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS seeker_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  industry            TEXT,
  job_title           TEXT,
  years_experience    TEXT,
  education_level     TEXT,
  preferred_job_types TEXT[],
  expected_salary_min INTEGER,
  expected_salary_max INTEGER,
  cv_url              TEXT,
  cv_parsed_data      JSONB,
  certificates_urls   TEXT[],
  profile_complete    BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── Employer Profiles ────────────────────────────────────
CREATE TABLE IF NOT EXISTS employer_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  company_name        TEXT NOT NULL,
  company_address     TEXT,
  company_location    TEXT,
  website_url         TEXT,
  cac_number          TEXT,
  cac_doc_url         TEXT,
  cac_verified        BOOLEAN DEFAULT FALSE,
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── Jobs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id             UUID REFERENCES employer_profiles(id) ON DELETE CASCADE,
  title                   TEXT NOT NULL,
  department              TEXT,
  job_type                TEXT CHECK (job_type IN ('full-time', 'part-time', 'contract', 'hybrid')),
  location                TEXT,
  location_type           TEXT CHECK (location_type IN ('remote', 'on-site', 'hybrid')),
  salary_min              INTEGER,
  salary_max              INTEGER,
  experience_required     TEXT,
  education_required      TEXT,
  skills_required         TEXT[],
  description             TEXT,
  application_requirements TEXT,
  is_active               BOOLEAN DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ── Applications ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS applications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID REFERENCES jobs(id) ON DELETE CASCADE,
  seeker_id           UUID REFERENCES seeker_profiles(id) ON DELETE CASCADE,
  status              TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'viewed', 'shortlisted', 'rejected')),
  employability_score INTEGER CHECK (employability_score BETWEEN 0 AND 100),
  ai_summary          TEXT,
  ai_strengths        TEXT[],
  ai_gaps             TEXT[],
  submitted_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, seeker_id)
);

-- ── AI Job Matches (Find Me a Job path) ─────────────────
CREATE TABLE IF NOT EXISTS job_matches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seeker_id    UUID REFERENCES seeker_profiles(id) ON DELETE CASCADE,
  job_title    TEXT,
  company_name TEXT,
  location     TEXT,
  job_type     TEXT,
  salary_range TEXT,
  match_score  INTEGER,
  source_url   TEXT,
  status       TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'dismissed')),
  found_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Notifications ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  message    TEXT NOT NULL,
  is_read    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes for performance ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_seeker_user_id ON seeker_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_employer_user_id ON employer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_employer_id ON jobs(employer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_active ON jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_seeker_id ON applications(seeker_id);
CREATE INDEX IF NOT EXISTS idx_matches_seeker_id ON job_matches(seeker_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
