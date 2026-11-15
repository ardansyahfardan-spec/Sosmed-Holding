-- Restrict task assignees to actual Workspace Crew/admin accounts.
CREATE OR REPLACE FUNCTION private.is_ghoustory_workspace_member_id(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM private.ghoustory_group_memberships m WHERE m.user_id = p_user_id)
    OR EXISTS (SELECT 1 FROM private.ghoustory_app_admins a WHERE a.user_id = p_user_id);
$function$;

REVOKE EXECUTE ON FUNCTION private.is_ghoustory_workspace_member_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_ghoustory_workspace_member_id(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.ghoustory_workspace_crew_roster()
RETURNS TABLE(user_id uuid, nickname text, role text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT private.is_ghoustory_workspace_member()
     AND NOT private.is_ghoustory_app_admin() THEN
    RAISE EXCEPTION 'Akses Workspace Crew diperlukan.';
  END IF;

  RETURN QUERY
  SELECT p.user_id, p.nickname, p.role
  FROM private.ghoustory_group_memberships m
  JOIN public.ghoustory_profiles p ON p.user_id = m.user_id
  UNION
  SELECT p.user_id, p.nickname, p.role
  FROM private.ghoustory_app_admins a
  JOIN public.ghoustory_profiles p ON p.user_id = a.user_id
  ORDER BY 2;
END;
$function$;

REVOKE EXECUTE ON FUNCTION private.ghoustory_workspace_crew_roster() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.ghoustory_workspace_crew_roster() TO authenticated;

CREATE OR REPLACE FUNCTION public.ghoustory_workspace_crew_roster()
RETURNS TABLE(user_id uuid, nickname text, role text)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM private.ghoustory_workspace_crew_roster();
$function$;

REVOKE EXECUTE ON FUNCTION public.ghoustory_workspace_crew_roster() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ghoustory_workspace_crew_roster() TO authenticated;

DROP POLICY IF EXISTS "Members create tasks" ON public.ghoustory_workspace_tasks;
CREATE POLICY "Members create tasks"
ON public.ghoustory_workspace_tasks
FOR INSERT TO authenticated
WITH CHECK (
  (private.is_ghoustory_workspace_member() OR private.is_ghoustory_app_admin())
  AND created_by = (SELECT auth.uid())
  AND (assigned_to IS NULL OR private.is_ghoustory_workspace_member_id(assigned_to))
);

DROP POLICY IF EXISTS "Task owners update tasks" ON public.ghoustory_workspace_tasks;
CREATE POLICY "Task owners update tasks"
ON public.ghoustory_workspace_tasks
FOR UPDATE TO authenticated
USING (
  (private.is_ghoustory_workspace_member() OR private.is_ghoustory_app_admin())
  AND (created_by = (SELECT auth.uid()) OR private.is_ghoustory_app_admin())
)
WITH CHECK (
  (private.is_ghoustory_workspace_member() OR private.is_ghoustory_app_admin())
  AND (created_by = (SELECT auth.uid()) OR private.is_ghoustory_app_admin())
  AND (assigned_to IS NULL OR private.is_ghoustory_workspace_member_id(assigned_to))
);