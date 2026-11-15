-- Return a participant's direct-message inbox in one bounded RPC instead of N+1 REST requests.
CREATE OR REPLACE FUNCTION public.ghoustory_dm_inbox()
RETURNS TABLE (
  conversation_id uuid,
  peer_user_id uuid,
  nickname text,
  avatar_url text,
  last_body text,
  last_created_at timestamptz,
  last_deleted_at timestamptz,
  unread_count bigint
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  WITH caller AS (
    SELECT (SELECT auth.uid()) AS user_id
  ),
  mine AS (
    SELECT p.conversation_id
    FROM public.ghoustory_dm_participants p
    CROSS JOIN caller u
    WHERE p.user_id = u.user_id
  ),
  peer AS (
    SELECT DISTINCT ON (p.conversation_id) p.conversation_id, p.user_id
    FROM public.ghoustory_dm_participants p
    JOIN mine m USING (conversation_id)
    CROSS JOIN caller u
    WHERE p.user_id <> u.user_id
    ORDER BY p.conversation_id, p.joined_at, p.user_id
  ),
  latest AS (
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id, m.body, m.created_at, m.deleted_at
    FROM public.ghoustory_dm_messages m
    JOIN mine USING (conversation_id)
    ORDER BY m.conversation_id, m.created_at DESC, m.id DESC
  ),
  unread AS (
    SELECT m.conversation_id, count(*)::bigint AS unread_count
    FROM public.ghoustory_dm_messages m
    JOIN mine ON mine.conversation_id = m.conversation_id
    CROSS JOIN caller u
    LEFT JOIN public.ghoustory_dm_message_reads r
      ON r.message_id = m.id AND r.user_id = u.user_id
    WHERE m.sender_id <> u.user_id
      AND m.deleted_at IS NULL
      AND r.message_id IS NULL
    GROUP BY m.conversation_id
  )
  SELECT peer.conversation_id, peer.user_id AS peer_user_id,
    COALESCE(profile.nickname, 'Crew') AS nickname, profile.avatar_url,
    latest.body AS last_body, latest.created_at AS last_created_at,
    latest.deleted_at AS last_deleted_at,
    COALESCE(unread.unread_count, 0)::bigint AS unread_count
  FROM peer
  JOIN public.ghoustory_profiles profile ON profile.user_id = peer.user_id
  LEFT JOIN latest ON latest.conversation_id = peer.conversation_id
  LEFT JOIN unread ON unread.conversation_id = peer.conversation_id
  ORDER BY latest.created_at DESC NULLS LAST, peer.conversation_id;
$$;
REVOKE EXECUTE ON FUNCTION public.ghoustory_dm_inbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ghoustory_dm_inbox() TO authenticated;
