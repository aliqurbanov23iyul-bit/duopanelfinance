begin;
create function public.admin_add_member(workspace uuid, member uuid, actor uuid, label text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.workspaces where id=workspace and created_by=actor for update;
  if not found then raise exception 'Workspace owner required'; end if;
  if (select count(*) from public.workspace_members where workspace_id=workspace)>=2
    then raise exception 'Workspace full'; end if;
  insert into public.workspace_members(workspace_id,user_id) values(workspace,member);
  insert into public.profiles(id,username) values(member,label);
end $$;
revoke execute on function public.admin_add_member(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_add_member(uuid,uuid,uuid,text) to service_role;
commit;