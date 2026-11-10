begin;
create table public.user_xp_events (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces on delete cascade,
 owner_id uuid not null references auth.users,
 source_id uuid not null unique,
 xp integer not null check(xp>0),
 created_at timestamptz not null default now()
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces on delete cascade,
 owner_id uuid not null references auth.users,
 kind text not null,
 read_at timestamptz,
 created_at timestamptz not null default now()
);
create index xp_scope on public.user_xp_events(workspace_id,created_at desc);
create index notification_inbox on public.notifications(workspace_id,owner_id,created_at desc);
alter table public.user_xp_events enable row level security;
alter table public.notifications enable row level security;
revoke all on public.user_xp_events,public.notifications from anon,authenticated;
grant select on public.user_xp_events,public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
create policy xp_read on public.user_xp_events for select to authenticated using(public.is_member(workspace_id));
create policy notification_read on public.notifications for select to authenticated using(owner_id=auth.uid() and public.is_member(workspace_id));
create policy notification_update on public.notifications for update to authenticated using(owner_id=auth.uid() and public.is_member(workspace_id)) with check(owner_id=auth.uid() and public.is_member(workspace_id));
create function public.award_task_xp() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.status='done' then
  insert into public.user_xp_events(workspace_id,owner_id,source_id,xp)
  values(new.workspace_id,auth.uid(),new.id,10) on conflict(source_id) do nothing;
 end if;
 return new;
end $$;
-- A new task cannot start completed or earn XP through its initial insert.
alter table public.tasks drop policy insert_scope;
create policy insert_scope on public.tasks for insert to authenticated
 with check(public.is_member(workspace_id) and owner_id=auth.uid() and status<>'done');
create function public.protect_task_fields() returns trigger language plpgsql set search_path = '' as $$
begin
 if old.owner_id<>auth.uid() and
 (new.title,new.body,new.due,new.priority,new.project_id,new.assignee) is distinct from
 (old.title,old.body,old.due,old.priority,old.project_id,old.assignee)
 then raise exception 'Task assignees may only change status'; end if;
 return new;
end $$;
create trigger task_fields before update on public.tasks for each row execute function public.protect_task_fields();
create trigger task_xp after update of status on public.tasks for each row when (old.status is distinct from new.status) execute function public.award_task_xp();
create function public.notify_partner() returns trigger language plpgsql security definer set search_path = '' as $$
declare row_data jsonb := to_jsonb(new);
begin
 if coalesce((row_data->>'private')::boolean,false) or
 (tg_table_name='expenses' and not (row_data->>'shared')::boolean) then return new; end if;
 insert into public.notifications(workspace_id,owner_id,kind)
 select new.workspace_id,user_id,tg_table_name from public.workspace_members
 where workspace_id=new.workspace_id and user_id<>new.owner_id;
 return new;
end $$;
revoke execute on function public.notify_partner(), public.award_task_xp() from public,anon,authenticated;
create trigger notify_partner after insert on public.messages for each row execute function public.notify_partner();
create trigger notify_partner after insert on public.tasks for each row execute function public.notify_partner();
create trigger notify_partner after insert on public.files for each row execute function public.notify_partner();
create trigger notify_partner after insert on public.expenses for each row execute function public.notify_partner();
create trigger notify_partner after insert on public.settlements for each row execute function public.notify_partner();
create trigger notify_partner after insert on public.calendar_events for each row execute function public.notify_partner();
alter publication supabase_realtime add table public.notifications,public.user_xp_events;
commit;