-- Database tables (PostgreSQL). Every table holding business data has a user_id,
-- so each user can only reach their own rows.

CREATE TABLE IF NOT EXISTS users (                      -- user accounts and logins
  user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,                          -- bcrypt hash, never the real password
  failed_logins INT NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_profiles (          -- business details used in AI prompts
  business_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  business_name   VARCHAR(100) NOT NULL,
  industry        VARCHAR(50) NOT NULL,
  products        TEXT NOT NULL,
  services        TEXT,
  brand_voice     TEXT,
  target_audience TEXT NOT NULL,
  seo_keywords    TEXT[] NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_chats (              -- saved Generate Content sessions
  chat_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES business_profiles ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generated_content (          -- AI-generated and edited content
  content_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id         UUID NOT NULL REFERENCES content_chats ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  business_id     UUID NOT NULL REFERENCES business_profiles ON DELETE CASCADE,
  content_type    VARCHAR(30) NOT NULL,
  topic           TEXT NOT NULL,
  tone            TEXT,
  keywords        TEXT[],
  additional_info TEXT,
  prompt_text     TEXT NOT NULL,                        -- original AI prompt
  ai_output       TEXT NOT NULL,                        -- original AI content
  edited_content  TEXT,                                 -- the user's edited version
  content_title   TEXT,
  status          VARCHAR(10) NOT NULL DEFAULT 'draft', -- 'draft' or 'saved'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analysis_reports (           -- SEO and tone analysis results
  analysis_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id        UUID NOT NULL REFERENCES generated_content ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  seo_score         INT NOT NULL,
  readability_score INT NOT NULL,
  readability_level VARCHAR(10) NOT NULL,
  tone_result       TEXT NOT NULL,
  keyword_results   JSONB NOT NULL,
  suggestions       JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS error_logs (                 -- errors and failed AI requests
  log_id        SERIAL PRIMARY KEY,
  user_id       UUID,
  endpoint      TEXT NOT NULL,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
