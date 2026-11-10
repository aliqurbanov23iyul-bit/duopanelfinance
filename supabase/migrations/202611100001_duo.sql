begin;
create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 username text not null check(length(username) between 1 and 60),
 last_seen timestamptz,
 updated_at timestamptz not null default now()
);
create table public.workspaces (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(name) between 1 and 80),
 created_by uuid not null unique references auth.users,
 created_at timestamptz not null default now()
);
create table public.workspace_members (
 workspace_id uuid references public.workspaces on delete cascade,
 user_id uuid references auth.users on delete cascade,
 created_at timestamptz not null default now(),
 primary key(workspace_id,user_id),
 unique(user_id)
);
create table public.invitations (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces on delete cascade,
 email text not null,
 expires_at timestamptz not null default now() + interval '48 hours',
 accepted_at timestamptz,
 created_at timestamptz not null default now()
);
create function public.is_member(w uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid());
$$;
create function public.create_workspace(label text) returns uuid language plpgsql security definer set search_path = '' as $$
declare w uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 insert into public.workspaces(name,created_by) values(trim(label),auth.uid()) returning id into w;
 insert into public.workspace_members values(w,auth.uid(),now());
 return w;
end $$;
create function public.invite_member(w uuid, address text) returns uuid language plpgsql security definer set search_path = '' as $$
declare token uuid;
begin
 perform 1 from public.workspaces where id=w and created_by=auth.uid() for update;
 if not found then raise exception 'Owner required'; end if;
 if (select count(*) from public.workspace_members where workspace_id=w)>=2 then raise exception 'Workspace full'; end if;
 if length(address)>254 or address !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then raise exception 'Invalid address'; end if;
 if (select count(*) from public.invitations where workspace_id=w and created_at>now()-interval '1 hour')>=5 then raise exception 'Try again later'; end if;
 insert into public.invitations(workspace_id,email) values(w,lower(trim(address))) returning id into token;
 return token;
end $$;
create function public.accept_invite(token uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation public.invitations;
begin
 select * into invitation from public.invitations where id=token for update;
 if auth.uid() is null or invitation.id is null or invitation.expires_at<=now() or invitation.accepted_at is not null or
 not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and lower(email)=invitation.email)
 then raise exception 'Invalid or expired invitation'; end if;
 perform 1 from public.workspaces where id=invitation.workspace_id for update;
 if (select count(*) from public.workspace_members where workspace_id=invitation.workspace_id)>=2 then raise exception 'Workspace full'; end if;
 insert into public.workspace_members(workspace_id,user_id) values(invitation.workspace_id,auth.uid());
 update public.invitations set accepted_at=now() where id=token;
 return invitation.workspace_id;
end $$;
revoke execute on function public.is_member(uuid), public.create_workspace(text), public.invite_member(uuid,text), public.accept_invite(uuid) from public, anon;
grant execute on function public.is_member(uuid), public.create_workspace(text), public.invite_member(uuid,text), public.accept_invite(uuid) to authenticated;
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
alter table public.workspaces enable row level security;
revoke all on public.workspaces from anon, authenticated;
alter table public.workspace_members enable row level security;
revoke all on public.workspace_members from anon, authenticated;
alter table public.invitations enable row level security;
revoke all on public.invitations from anon, authenticated;
grant select on public.workspaces,public.workspace_members,public.profiles to authenticated;
grant insert(id,username), update(username,last_seen) on public.profiles to authenticated;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or exists(select 1 from public.workspace_members m where m.user_id=id and public.is_member(m.workspace_id)));
create policy profile_insert on public.profiles for insert to authenticated with check(id=auth.uid());
create policy profile_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy workspace_read on public.workspaces for select to authenticated using(public.is_member(id));
create policy membership_read on public.workspace_members for select to authenticated using(public.is_member(workspace_id));
create function public.touch_row() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at=now(); return new; end $$;
create trigger profile_touch before update on public.profiles for each row execute function public.touch_row();
create table public.expenses (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 owner_id uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,workspace_id),
 foreign key(workspace_id,owner_id) references public.workspace_members(workspace_id,user_id) on delete cascade,
 title text not null, amount_minor bigint not null check (amount_minor between 1 and 100000000000), category text not null, day date not null, shared boolean not null default false, check(length(title) between 1 and 180)
);
create index expenses_scope on public.expenses(workspace_id, created_at desc,id desc);
alter table public.expenses enable row level security;
revoke all on public.expenses from anon, authenticated;
grant select, delete on public.expenses to authenticated;
grant insert(workspace_id,title,amount_minor,category,day,shared) on public.expenses to authenticated;
grant update(title,amount_minor,category,day,shared) on public.expenses to authenticated;
create policy read_scope on public.expenses for select to authenticated using(public.is_member(workspace_id) and (shared or owner_id=auth.uid()));
create policy insert_scope on public.expenses for insert to authenticated with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy update_scope on public.expenses for update to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid()) with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy delete_scope on public.expenses for delete to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid());
create trigger touch before update on public.expenses for each row execute function public.touch_row();
create table public.settlements (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 owner_id uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,workspace_id),
 foreign key(workspace_id,owner_id) references public.workspace_members(workspace_id,user_id) on delete cascade,
 amount_minor bigint not null check (amount_minor between 1 and 100000000000), day date not null
);
create index settlements_scope on public.settlements(workspace_id, created_at desc,id desc);
alter table public.settlements enable row level security;
revoke all on public.settlements from anon, authenticated;
grant select, delete on public.settlements to authenticated;
grant insert(workspace_id,amount_minor,day) on public.settlements to authenticated;
grant update(amount_minor,day) on public.settlements to authenticated;
create policy read_scope on public.settlements for select to authenticated using(public.is_member(workspace_id));
create policy insert_scope on public.settlements for insert to authenticated with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy update_scope on public.settlements for update to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid()) with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy delete_scope on public.settlements for delete to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid());
create trigger touch before update on public.settlements for each row execute function public.touch_row();
create table public.budgets (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 owner_id uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,workspace_id),
 foreign key(workspace_id,owner_id) references public.workspace_members(workspace_id,user_id) on delete cascade,
 title text not null, amount_minor bigint not null check (amount_minor between 1 and 100000000000), month date not null, check(length(title) between 1 and 180)
);
create index budgets_scope on public.budgets(workspace_id, created_at desc,id desc);
alter table public.budgets enable row level security;
revoke all on public.budgets from anon, authenticated;
grant select, delete on public.budgets to authenticated;
grant insert(workspace_id,title,amount_minor,month) on public.budgets to authenticated;
grant update(title,amount_minor,month) on public.budgets to authenticated;
create policy read_scope on public.budgets for select to authenticated using(public.is_member(workspace_id));
create policy insert_scope on public.budgets for insert to authenticated with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy update_scope on public.budgets for update to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid()) with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy delete_scope on public.budgets for delete to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid());
create trigger touch before update on public.budgets for each row execute function public.touch_row();
create table public.messages (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 owner_id uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,workspace_id),
 foreign key(workspace_id,owner_id) references public.workspace_members(workspace_id,user_id) on delete cascade,
 body text not null check (length(body) between 1 and 8000), pinned boolean not null default false
);
create index messages_scope on public.messages(workspace_id, created_at desc,id desc);
alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;
grant select, delete on public.messages to authenticated;
grant insert(workspace_id,body,pinned) on public.messages to authenticated;
grant update(body,pinned) on public.messages to authenticated;
create policy read_scope on public.messages for select to authenticated using(public.is_member(workspace_id));
create policy insert_scope on public.messages for insert to authenticated with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy update_scope on public.messages for update to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid()) with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy delete_scope on public.messages for delete to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid());
create trigger touch before update on public.messages for each row execute function public.touch_row();
create table public.folders (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 owner_id uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,workspace_id),
 foreign key(workspace_id,owner_id) references public.workspace_members(workspace_id,user_id) on delete cascade,
 title text not null, private boolean not null default false, check(length(title) between 1 and 180)
);
create index folders_scope on public.folders(workspace_id, created_at desc,id desc);
alter table public.folders enable row level security;
revoke all on public.folders from anon, authenticated;
grant select, delete on public.folders to authenticated;
grant insert(workspace_id,title,private) on public.folders to authenticated;
grant update(title,private) on public.folders to authenticated;
create policy read_scope on public.folders for select to authenticated using(public.is_member(workspace_id) and (not private or owner_id=auth.uid()));
create policy insert_scope on public.folders for insert to authenticated with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy update_scope on public.folders for update to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid()) with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy delete_scope on public.folders for delete to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid());
create trigger touch before update on public.folders for each row execute function public.touch_row();
create table public.files (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 owner_id uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,workspace_id),
 foreign key(workspace_id,owner_id) references public.workspace_members(workspace_id,user_id) on delete cascade,
 title text not null, path text not null unique, size bigint not null check(size between 0 and 26214400), private boolean not null default false, check(length(title) between 1 and 180), check(split_part(path,'/',1)=workspace_id::text and split_part(path,'/',2)=owner_id::text and split_part(path,'/',3)=case when private then 'private' else 'shared' end and path ~ '^[^/]+/[^/]+/(shared|private)/[0-9a-f-]{36}$')
);
create index files_scope on public.files(workspace_id, created_at desc,id desc);
alter table public.files enable row level security;
revoke all on public.files from anon, authenticated;
grant select, delete on public.files to authenticated;
grant insert(workspace_id,title,path,size,private) on public.files to authenticated;
grant update(title) on public.files to authenticated;
create policy read_scope on public.files for select to authenticated using(public.is_member(workspace_id) and (not private or owner_id=auth.uid()));
create policy insert_scope on public.files for insert to authenticated with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy update_scope on public.files for update to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid()) with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy delete_scope on public.files for delete to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid());
create trigger touch before update on public.files for each row execute function public.touch_row();
create table public.projects (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 owner_id uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,workspace_id),
 foreign key(workspace_id,owner_id) references public.workspace_members(workspace_id,user_id) on delete cascade,
 title text not null, body text not null default '', check(length(title) between 1 and 180)
);
create index projects_scope on public.projects(workspace_id, created_at desc,id desc);
alter table public.projects enable row level security;
revoke all on public.projects from anon, authenticated;
grant select, delete on public.projects to authenticated;
grant insert(workspace_id,title,body) on public.projects to authenticated;
grant update(title,body) on public.projects to authenticated;
create policy read_scope on public.projects for select to authenticated using(public.is_member(workspace_id));
create policy insert_scope on public.projects for insert to authenticated with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy update_scope on public.projects for update to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid()) with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy delete_scope on public.projects for delete to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid());
create trigger touch before update on public.projects for each row execute function public.touch_row();
create table public.tasks (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 owner_id uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,workspace_id),
 foreign key(workspace_id,owner_id) references public.workspace_members(workspace_id,user_id) on delete cascade,
 title text not null, body text not null default '', due date, priority text not null check(priority in ('low','normal','high')), status text not null check(status in ('todo','doing','review','done')), project_id uuid, assignee uuid, foreign key(project_id,workspace_id) references public.projects(id,workspace_id) on delete cascade, foreign key(workspace_id,assignee) references public.workspace_members(workspace_id,user_id), check(length(title) between 1 and 180)
);
create index tasks_scope on public.tasks(workspace_id, created_at desc,id desc);
alter table public.tasks enable row level security;
revoke all on public.tasks from anon, authenticated;
grant select, delete on public.tasks to authenticated;
grant insert(workspace_id,title,body,due,priority,status,project_id,assignee) on public.tasks to authenticated;
grant update(title,body,due,priority,status,project_id,assignee) on public.tasks to authenticated;
create policy read_scope on public.tasks for select to authenticated using(public.is_member(workspace_id));
create policy insert_scope on public.tasks for insert to authenticated with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy update_scope on public.tasks for update to authenticated using(public.is_member(workspace_id) and (owner_id=auth.uid() or assignee=auth.uid())) with check(public.is_member(workspace_id) and (owner_id=auth.uid() or assignee=auth.uid()));
create policy delete_scope on public.tasks for delete to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid());
create trigger touch before update on public.tasks for each row execute function public.touch_row();
create table public.notes (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 owner_id uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,workspace_id),
 foreign key(workspace_id,owner_id) references public.workspace_members(workspace_id,user_id) on delete cascade,
 title text not null, body text not null default '', tags text not null default '', pinned boolean not null default false, private boolean not null default false, check(length(title) between 1 and 180)
);
create index notes_scope on public.notes(workspace_id, created_at desc,id desc);
alter table public.notes enable row level security;
revoke all on public.notes from anon, authenticated;
grant select, delete on public.notes to authenticated;
grant insert(workspace_id,title,body,tags,pinned,private) on public.notes to authenticated;
grant update(title,body,tags,pinned,private) on public.notes to authenticated;
create policy read_scope on public.notes for select to authenticated using(public.is_member(workspace_id) and (not private or owner_id=auth.uid()));
create policy insert_scope on public.notes for insert to authenticated with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy update_scope on public.notes for update to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid()) with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy delete_scope on public.notes for delete to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid());
create trigger touch before update on public.notes for each row execute function public.touch_row();
create table public.calendar_events (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 owner_id uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,workspace_id),
 foreign key(workspace_id,owner_id) references public.workspace_members(workspace_id,user_id) on delete cascade,
 title text not null, body text not null default '', day date not null, private boolean not null default false, check(length(title) between 1 and 180)
);
create index calendar_events_scope on public.calendar_events(workspace_id, created_at desc,id desc);
alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from anon, authenticated;
grant select, delete on public.calendar_events to authenticated;
grant insert(workspace_id,title,body,day,private) on public.calendar_events to authenticated;
grant update(title,body,day,private) on public.calendar_events to authenticated;
create policy read_scope on public.calendar_events for select to authenticated using(public.is_member(workspace_id) and (not private or owner_id=auth.uid()));
create policy insert_scope on public.calendar_events for insert to authenticated with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy update_scope on public.calendar_events for update to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid()) with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy delete_scope on public.calendar_events for delete to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid());
create trigger touch before update on public.calendar_events for each row execute function public.touch_row();
create table public.vibes (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 owner_id uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,workspace_id),
 foreign key(workspace_id,owner_id) references public.workspace_members(workspace_id,user_id) on delete cascade,
 title text not null, kind text not null check(kind in ('movie','game','music')), url text not null default '', favorite boolean not null default false, check(length(title) between 1 and 180)
);
create index vibes_scope on public.vibes(workspace_id, created_at desc,id desc);
alter table public.vibes enable row level security;
revoke all on public.vibes from anon, authenticated;
grant select, delete on public.vibes to authenticated;
grant insert(workspace_id,title,kind,url,favorite) on public.vibes to authenticated;
grant update(title,kind,url,favorite) on public.vibes to authenticated;
create policy read_scope on public.vibes for select to authenticated using(public.is_member(workspace_id));
create policy insert_scope on public.vibes for insert to authenticated with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy update_scope on public.vibes for update to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid()) with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy delete_scope on public.vibes for delete to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid());
create trigger touch before update on public.vibes for each row execute function public.touch_row();
create table public.user_settings (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 owner_id uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,workspace_id),
 foreign key(workspace_id,owner_id) references public.workspace_members(workspace_id,user_id) on delete cascade,
 accent text not null default '#8e72ff', dashboard_order text[] not null default '{}', unique(workspace_id,owner_id)
);
create index user_settings_scope on public.user_settings(workspace_id, created_at desc,id desc);
alter table public.user_settings enable row level security;
revoke all on public.user_settings from anon, authenticated;
grant select, delete on public.user_settings to authenticated;
grant insert(workspace_id,accent,dashboard_order) on public.user_settings to authenticated;
grant update(accent,dashboard_order) on public.user_settings to authenticated;
create policy read_scope on public.user_settings for select to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid());
create policy insert_scope on public.user_settings for insert to authenticated with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy update_scope on public.user_settings for update to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid()) with check(public.is_member(workspace_id) and owner_id=auth.uid());
create policy delete_scope on public.user_settings for delete to authenticated using(public.is_member(workspace_id) and owner_id=auth.uid());
create trigger touch before update on public.user_settings for each row execute function public.touch_row();
insert into storage.buckets(id,name,public,file_size_limit) values('duo-private','duo-private',false,26214400);
create policy duo_upload on storage.objects for insert to authenticated with check (
 bucket_id='duo-private' and (storage.foldername(name))[2]=auth.uid()::text
 and (storage.foldername(name))[3] in ('shared','private')
 and exists(select 1 from public.workspace_members m where m.user_id=auth.uid() and m.workspace_id::text=(storage.foldername(name))[1])
);
create policy duo_read on storage.objects for select to authenticated using (
 bucket_id='duo-private'
 and exists(select 1 from public.workspace_members m where m.user_id=auth.uid() and m.workspace_id::text=(storage.foldername(name))[1])
 and ((storage.foldername(name))[2]=auth.uid()::text or ((storage.foldername(name))[3]='shared' and exists(select 1 from public.files f where f.path=name and not f.private)))
);
create policy duo_remove on storage.objects for delete to authenticated using (
 bucket_id='duo-private' and (storage.foldername(name))[2]=auth.uid()::text
 and exists(select 1 from public.workspace_members m where m.user_id=auth.uid() and m.workspace_id::text=(storage.foldername(name))[1])
);
alter publication supabase_realtime add table public.messages,public.tasks,public.expenses,public.notes,public.calendar_events,public.files,public.profiles,public.vibes,public.projects,public.budgets,public.settlements,public.workspace_members;
commit;