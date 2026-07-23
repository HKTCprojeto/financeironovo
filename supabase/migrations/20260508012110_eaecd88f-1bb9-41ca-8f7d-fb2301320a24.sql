CREATE TABLE public.chat_messages (
  id bigserial PRIMARY KEY,
  thread_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('user','marcos','system')),
  content text NOT NULL,
  status text DEFAULT 'sent' CHECK (status IN ('pending','sent','delivered','error')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX chat_messages_thread_idx ON public.chat_messages(thread_id, created_at);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select" ON public.chat_messages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert" ON public.chat_messages
  FOR INSERT TO authenticated WITH CHECK (role = 'user');

CREATE POLICY "service_role_all" ON public.chat_messages
  FOR ALL USING (auth.role() = 'service_role');

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;