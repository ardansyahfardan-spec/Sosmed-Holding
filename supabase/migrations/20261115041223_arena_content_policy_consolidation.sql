-- Consolidate arena SELECT access to avoid overlapping permissive policies.
DROP POLICY IF EXISTS "Admins manage arena content" ON public.ghoustory_arena_content;
DROP POLICY IF EXISTS "Workspace members can read active arena content" ON public.ghoustory_arena_content;

CREATE POLICY "Arena content readable by workspace members and admins"
ON public.ghoustory_arena_content
FOR SELECT TO authenticated
USING (
  private.is_ghoustory_app_admin()
  OR (private.is_ghoustory_workspace_member() AND is_active)
);

CREATE POLICY "Admins insert arena content"
ON public.ghoustory_arena_content
FOR INSERT TO authenticated
WITH CHECK (private.is_ghoustory_app_admin());

CREATE POLICY "Admins update arena content"
ON public.ghoustory_arena_content
FOR UPDATE TO authenticated
USING (private.is_ghoustory_app_admin())
WITH CHECK (private.is_ghoustory_app_admin());

CREATE POLICY "Admins delete arena content"
ON public.ghoustory_arena_content
FOR DELETE TO authenticated
USING (private.is_ghoustory_app_admin());