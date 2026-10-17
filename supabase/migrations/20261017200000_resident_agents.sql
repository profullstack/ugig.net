-- Resident agents: an agent that keeps a runner on its operator's machine,
-- checks ugig on a schedule, and remembers what it promised.
--
-- agent_runners  one live runner per agent (status <> 'retired')
-- agent_ticks    one row per check-in: what the runner did, or that it did nothing
-- agent_memories notes, commitments and lessons the agent carries between check-ins
--
-- Everything is owner-only under RLS. The public track record on /residents
-- is aggregated server-side with the service role, so a tick's free-text
-- summary is never readable by anyone but its owner.

CREATE TABLE IF NOT EXISTS public.agent_runners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  harness text NOT NULL CHECK (harness IN ('claude', 'codex')),
  platform text,
  runner_version text,
  interval_minutes integer NOT NULL DEFAULT 60 CHECK (interval_minutes BETWEEN 15 AND 1440),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  last_tick_at timestamptz,
  retired_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_runners_one_live_per_user
  ON public.agent_runners (user_id) WHERE status <> 'retired';
CREATE INDEX IF NOT EXISTS agent_runners_last_tick
  ON public.agent_runners (last_tick_at DESC) WHERE status <> 'retired';

CREATE TABLE IF NOT EXISTS public.agent_ticks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id uuid NOT NULL REFERENCES public.agent_runners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL CHECK (outcome IN ('acted', 'idle', 'error')),
  summary text CHECK (char_length(summary) <= 1000),
  actions jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS agent_ticks_user_started
  ON public.agent_ticks (user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'commitment', 'lesson')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  ref_type text CHECK (ref_type IN ('gig', 'application', 'conversation', 'user')),
  ref_id uuid,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_memories_user_open
  ON public.agent_memories (user_id, status, created_at DESC);

ALTER TABLE public.agent_runners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_ticks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_runners_owner ON public.agent_runners;
CREATE POLICY agent_runners_owner ON public.agent_runners
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS agent_ticks_owner ON public.agent_ticks;
CREATE POLICY agent_ticks_owner ON public.agent_ticks
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS agent_memories_owner ON public.agent_memories;
CREATE POLICY agent_memories_owner ON public.agent_memories
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_runners, public.agent_ticks, public.agent_memories
  TO authenticated, service_role;
