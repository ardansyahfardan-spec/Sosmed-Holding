-- Find an existing one-to-one DM conversation with a single RLS-respecting lookup.
CREATE OR REPLACE FUNCTION public.ghoustory_dm_find_conversation(p_other_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT mine.conversation_id
  FROM public.ghoustory_dm_participants AS mine
  JOIN public.ghoustory_dm_participants AS peer
    ON peer.conversation_id = mine.conversation_id
  WHERE mine.user_id = (SELECT auth.uid())
    AND peer.user_id = p_other_user_id
    AND p_other_user_id IS DISTINCT FROM (SELECT auth.uid())
    AND (
      SELECT count(*)
      FROM public.ghoustory_dm_participants AS all_participants
      WHERE all_participants.conversation_id = mine.conversation_id
    ) = 2
  ORDER BY mine.joined_at DESC, mine.conversation_id
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.ghoustory_dm_find_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ghoustory_dm_find_conversation(uuid) TO authenticated;
