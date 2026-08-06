-- Realtime no /chat: sem a tabela na publicação, o Postgres não emite
-- postgres_changes e a assinatura em chat.tsx fica muda (a resposta da Lívia
-- só aparecia depois de F5). A migration 20260508012110 já fazia isso, mas o
-- schema aplicado no Supabase do time veio da 20260724000000_cfo_schema.sql,
-- que recria chat_messages sem adicionar à publicação.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;

-- REPLICA IDENTITY FULL: o payload de UPDATE precisa trazer a linha completa.
-- O placeholder "pending" da Lívia é resolvido por UPDATE (chat-marcos-reply),
-- não por INSERT — sem isso a tela não recebe o conteúdo da resposta.
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
