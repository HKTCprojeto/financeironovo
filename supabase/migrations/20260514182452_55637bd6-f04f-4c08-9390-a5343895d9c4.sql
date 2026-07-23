
DROP POLICY IF EXISTS auth_insert ON public.chat_messages;

CREATE POLICY auth_insert_own_thread ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (thread_id = 'panel:' || auth.uid()::text);

CREATE POLICY auth_update_own_thread ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (thread_id = 'panel:' || auth.uid()::text)
  WITH CHECK (thread_id = 'panel:' || auth.uid()::text);

CREATE POLICY auth_delete_own_thread ON public.chat_messages
  FOR DELETE TO authenticated
  USING (thread_id = 'panel:' || auth.uid()::text);
