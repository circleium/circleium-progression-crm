-- Circleium Progression CRM — Test Mode schema
-- Run this whole file once in Supabase > SQL Editor.
create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('admin','partner');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null,
 role public.app_role not null default 'partner',
 active boolean not null default true,
 created_at timestamptz not null default now()
);

create table if not exists public.partners(
 id uuid primary key default gen_random_uuid(),
 user_id uuid unique references auth.users(id) on delete set null,
 name text not null,
 email text not null,
 active boolean not null default true,
 accepting_new boolean not null default true,
 created_at timestamptz not null default now()
);

create table if not exists public.partner_areas(
 partner_id uuid references public.partners(id) on delete cascade,
 county text not null,
 area text not null,
 primary key(partner_id,county,area)
);
create table if not exists public.partner_categories(
 partner_id uuid references public.partners(id) on delete cascade,
 category text not null,
 primary key(partner_id,category)
);
create table if not exists public.route_state(
 home_county text not null,
 partner_area text not null,
 interest_pool text not null,
 last_index integer not null default -1,
 primary key(home_county,partner_area,interest_pool)
);

create table if not exists public.progressions(
 id uuid primary key default gen_random_uuid(),
 reference text unique,
 created_at timestamptz not null default now(),
 member_profile_name text not null,
 member_email text not null,
 home_county text not null,
 partner_area text not null,
 interest_pool text not null,
 division text,
 asset_county text,
 asset_location text,
 location_flexibility text,
 opportunity text not null,
 specific_asset text,
 asset_model text,
 budget text,
 preferred_owners text,
 finance_interest text,
 usage text,
 preferred_access text,
 usage_notes text,
 timescale text,
 coowner_preferences text,
 support text,
 assigned_partner_id uuid references public.partners(id) on delete set null,
 status text not null default 'New',
 last_contact date,
 next_action text not null default 'Initial review',
 internal_notes text
);

create table if not exists public.progression_history(
 id uuid primary key default gen_random_uuid(),
 progression_id uuid not null references public.progressions(id) on delete cascade,
 partner_id uuid references public.partners(id) on delete set null,
 created_at timestamptz not null default now(),
 status text,
 note text not null
);

create table if not exists public.potential_groups(
 id uuid primary key default gen_random_uuid(),
 name text not null,
 interest_pool text,
 asset_county text,
 target_owners integer not null default 4,
 status text not null default 'Potential Group',
 created_by_partner_id uuid references public.partners(id) on delete set null,
 created_at timestamptz not null default now()
);
create table if not exists public.group_progressions(
 group_id uuid references public.potential_groups(id) on delete cascade,
 progression_id uuid references public.progressions(id) on delete cascade,
 linked_at timestamptz not null default now(),
 primary key(group_id,progression_id)
);
create table if not exists public.linkup_requests(
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 from_partner_id uuid not null references public.partners(id),
 to_partner_id uuid not null references public.partners(id),
 source_progression_id uuid not null references public.progressions(id),
 target_progression_id uuid not null references public.progressions(id),
 status text not null default 'Requested',
 responded_at timestamptz
);

create or replace function public.current_role() returns public.app_role language sql stable security definer set search_path=public as $$
 select role from public.profiles where id=auth.uid()
$$;
create or replace function public.current_partner_id() returns uuid language sql stable security definer set search_path=public as $$
 select id from public.partners where user_id=auth.uid() and active=true limit 1
$$;

alter table public.profiles enable row level security;
alter table public.partners enable row level security;
alter table public.partner_areas enable row level security;
alter table public.partner_categories enable row level security;
alter table public.progressions enable row level security;
alter table public.progression_history enable row level security;
alter table public.potential_groups enable row level security;
alter table public.group_progressions enable row level security;
alter table public.linkup_requests enable row level security;

drop policy if exists profiles_self_or_admin on public.profiles;
create policy profiles_self_or_admin on public.profiles for select to authenticated using (id=auth.uid() or public.current_role()='admin');
drop policy if exists partners_authenticated_read on public.partners;
create policy partners_authenticated_read on public.partners for select to authenticated using (true);
drop policy if exists partnerareas_authenticated_read on public.partner_areas;
create policy partnerareas_authenticated_read on public.partner_areas for select to authenticated using (true);
drop policy if exists partnercats_authenticated_read on public.partner_categories;
create policy partnercats_authenticated_read on public.partner_categories for select to authenticated using (true);

drop policy if exists progression_own_or_admin on public.progressions;
create policy progression_own_or_admin on public.progressions for select to authenticated using (
 public.current_role()='admin' or assigned_partner_id=public.current_partner_id()
);
drop policy if exists history_own_or_admin on public.progression_history;
create policy history_own_or_admin on public.progression_history for select to authenticated using (
 public.current_role()='admin' or exists(select 1 from public.progressions p where p.id=progression_id and p.assigned_partner_id=public.current_partner_id())
);
drop policy if exists requests_participants_or_admin on public.linkup_requests;
create policy requests_participants_or_admin on public.linkup_requests for select to authenticated using (
 public.current_role()='admin' or from_partner_id=public.current_partner_id() or to_partner_id=public.current_partner_id()
);

-- Public submission. Direct anon access to progressions remains blocked; this controlled function performs the insert.
create or replace function public.submit_progression(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
 v_partner uuid; v_count int; v_idx int; v_ref text; v_id uuid;
begin
 if coalesce(p_payload->>'member_profile_name','')='' or coalesce(p_payload->>'member_email','')='' then raise exception 'Profile name and email are required'; end if;
 select count(*) into v_count from (
   select distinct p.id from partners p
   join partner_areas a on a.partner_id=p.id
   join partner_categories c on c.partner_id=p.id
   where p.active and p.accepting_new
     and a.county=p_payload->>'home_county'
     and a.area=p_payload->>'partner_area'
     and c.category=p_payload->>'interest_pool'
 ) q;
 if v_count>0 then
   insert into route_state(home_county,partner_area,interest_pool,last_index)
   values(p_payload->>'home_county',p_payload->>'partner_area',p_payload->>'interest_pool',0)
   on conflict(home_county,partner_area,interest_pool)
   do update set last_index=(route_state.last_index+1)%v_count
   returning last_index into v_idx;
   select id into v_partner from (
     select distinct p.id,p.name from partners p
     join partner_areas a on a.partner_id=p.id
     join partner_categories c on c.partner_id=p.id
     where p.active and p.accepting_new
       and a.county=p_payload->>'home_county'
       and a.area=p_payload->>'partner_area'
       and c.category=p_payload->>'interest_pool'
     order by p.name
     offset v_idx limit 1
   ) q;
 end if;

 v_ref='PR-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 insert into progressions(reference,member_profile_name,member_email,home_county,partner_area,interest_pool,asset_county,asset_location,location_flexibility,opportunity,specific_asset,asset_model,budget,preferred_owners,finance_interest,usage,preferred_access,usage_notes,timescale,coowner_preferences,assigned_partner_id)
 values(v_ref,p_payload->>'member_profile_name',p_payload->>'member_email',p_payload->>'home_county',p_payload->>'partner_area',p_payload->>'interest_pool',p_payload->>'asset_county',p_payload->>'asset_location',p_payload->>'location_flexibility',p_payload->>'opportunity',p_payload->>'specific_asset',p_payload->>'asset_model',p_payload->>'budget',p_payload->>'preferred_owners',p_payload->>'finance_interest',p_payload->>'usage',p_payload->>'preferred_access',p_payload->>'usage_notes',p_payload->>'timescale',p_payload->>'coowner_preferences',v_partner)
 returning id into v_id;
 return jsonb_build_object('id',v_id,'reference',v_ref,'assigned',v_partner is not null);
end $$;
revoke all on function public.submit_progression(jsonb) from public;
grant execute on function public.submit_progression(jsonb) to anon, authenticated;

-- Restricted global matching register. No email, private notes or full submission.
create or replace function public.global_progression_register()
returns table(id uuid,reference text,member_profile_name text,home_county text,partner_area text,interest_pool text,asset_county text,asset_location text,opportunity text,budget text,preferred_owners text,timescale text,status text,partner_name text,group_availability text)
language sql stable security definer set search_path=public
as $$
 select p.id,p.reference,p.member_profile_name,p.home_county,p.partner_area,p.interest_pool,p.asset_county,p.asset_location,p.opportunity,p.budget,p.preferred_owners,p.timescale,p.status,
 coalesce(pa.name,'Unassigned'),
 case when p.status in ('Formation Ready','Progressed','Withdrawn') then p.status
      else 'In '||(select count(*) from group_progressions gp where gp.progression_id=p.id)||' Potential Group(s)' end
 from progressions p left join partners pa on pa.id=p.assigned_partner_id
 where auth.uid() is not null and public.current_role() in ('admin','partner');
$$;
grant execute on function public.global_progression_register() to authenticated;

create or replace function public.update_progression_management(p_progression_id uuid,p_status text,p_last_contact date,p_next_action text,p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare v_partner uuid:=public.current_partner_id();
begin
 if public.current_role()<>'admin' and not exists(select 1 from progressions where id=p_progression_id and assigned_partner_id=v_partner) then raise exception 'Not permitted'; end if;
 update progressions set status=p_status,last_contact=p_last_contact,next_action=p_next_action where id=p_progression_id;
 if coalesce(trim(p_note),'')<>'' then insert into progression_history(progression_id,partner_id,status,note) values(p_progression_id,v_partner,p_status,p_note); end if;
end $$;
grant execute on function public.update_progression_management(uuid,text,date,text,text) to authenticated;

create or replace function public.create_potential_group(p_name text,p_progression_ids uuid[],p_target_owners int default 4)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_partner uuid:=public.current_partner_id(); v_group uuid; v_pool text; v_count int;
begin
 if public.current_role()<>'partner' then raise exception 'Partner account required'; end if;
 select count(*) into v_count from progressions where id=any(p_progression_ids) and assigned_partner_id=v_partner;
 if v_count<>cardinality(p_progression_ids) then raise exception 'You can start a group using only your assigned member progressions'; end if;
 select interest_pool into v_pool from progressions where id=p_progression_ids[1];
 insert into potential_groups(name,interest_pool,target_owners,created_by_partner_id) values(p_name,v_pool,p_target_owners,v_partner) returning id into v_group;
 insert into group_progressions(group_id,progression_id) select v_group,unnest(p_progression_ids);
 return v_group;
end $$;
grant execute on function public.create_potential_group(text,uuid[],int) to authenticated;

create or replace function public.request_linkup(p_source_progression_id uuid,p_target_progression_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_from uuid:=public.current_partner_id();v_to uuid;v_id uuid;v_status text;
begin
 if not exists(select 1 from progressions where id=p_source_progression_id and assigned_partner_id=v_from) then raise exception 'Source progression must be your assigned member';end if;
 select assigned_partner_id,status into v_to,v_status from progressions where id=p_target_progression_id;
 if v_to is null or v_to=v_from then raise exception 'Target must belong to another Partner';end if;
 if v_status in ('Formation Ready','Progressed','Withdrawn') then raise exception 'Target progression is no longer open for link-up requests';end if;
 if exists(select 1 from linkup_requests where source_progression_id=p_source_progression_id and target_progression_id=p_target_progression_id and status='Requested') then raise exception 'A request is already pending';end if;
 insert into linkup_requests(from_partner_id,to_partner_id,source_progression_id,target_progression_id) values(v_from,v_to,p_source_progression_id,p_target_progression_id) returning id into v_id;
 return v_id;
end $$;
grant execute on function public.request_linkup(uuid,uuid) to authenticated;

create or replace function public.respond_linkup(p_request_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path=public as $$
declare r linkup_requests%rowtype;v_partner uuid:=public.current_partner_id();v_group uuid;
begin
 select * into r from linkup_requests where id=p_request_id for update;
 if r.id is null then raise exception 'Request not found';end if;
 if public.current_role()<>'admin' and r.to_partner_id<>v_partner then raise exception 'Not permitted';end if;
 if r.status<>'Requested' then raise exception 'Request already resolved';end if;
 if not p_approve then update linkup_requests set status='Declined',responded_at=now() where id=r.id;return;end if;
 select gp.group_id into v_group from group_progressions gp join potential_groups g on g.id=gp.group_id where gp.progression_id=r.source_progression_id and g.status='Potential Group' order by g.created_at desc limit 1;
 if v_group is null then
   insert into potential_groups(name,interest_pool,created_by_partner_id)
   select interest_pool||' Potential Group',interest_pool,r.from_partner_id from progressions where id=r.source_progression_id returning id into v_group;
   insert into group_progressions values(v_group,r.source_progression_id,now()) on conflict do nothing;
 end if;
 insert into group_progressions values(v_group,r.target_progression_id,now()) on conflict do nothing;
 update linkup_requests set status='Approved',responded_at=now() where id=r.id;
end $$;
grant execute on function public.respond_linkup(uuid,boolean) to authenticated;

create or replace function public.my_partner_groups()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_partner uuid:=public.current_partner_id(); result jsonb;
begin
 if public.current_role()='admin' then
   select coalesce(jsonb_agg(obj),'[]'::jsonb) into result from (
    select jsonb_build_object('id',g.id,'name',g.name,'interest_pool',g.interest_pool,'status',g.status,
      'members',(select coalesce(jsonb_agg(jsonb_build_object('progression_id',p.id,'member_profile_name',p.member_profile_name,'partner_name',coalesce(pa.name,'Unassigned'),'is_mine',false)),'[]'::jsonb) from group_progressions gp join progressions p on p.id=gp.progression_id left join partners pa on pa.id=p.assigned_partner_id where gp.group_id=g.id),
      'partners',(select coalesce(jsonb_agg(distinct pa.name),'[]'::jsonb) from group_progressions gp join progressions p on p.id=gp.progression_id join partners pa on pa.id=p.assigned_partner_id where gp.group_id=g.id),
      'pending_requests',0) obj from potential_groups g order by g.created_at desc
   )x;
 else
   select coalesce(jsonb_agg(obj),'[]'::jsonb) into result from (
    select jsonb_build_object('id',g.id,'name',g.name,'interest_pool',g.interest_pool,'status',g.status,
      'members',(select coalesce(jsonb_agg(jsonb_build_object('progression_id',p.id,'member_profile_name',p.member_profile_name,'partner_name',coalesce(pa.name,'Unassigned'),'is_mine',p.assigned_partner_id=v_partner)),'[]'::jsonb) from group_progressions gp join progressions p on p.id=gp.progression_id left join partners pa on pa.id=p.assigned_partner_id where gp.group_id=g.id),
      'partners',(select coalesce(jsonb_agg(distinct pa.name),'[]'::jsonb) from group_progressions gp join progressions p on p.id=gp.progression_id join partners pa on pa.id=p.assigned_partner_id where gp.group_id=g.id),
      'pending_requests',(select count(*) from linkup_requests lr where lr.status='Requested' and (lr.from_partner_id=v_partner or lr.to_partner_id=v_partner))) obj
    from potential_groups g where exists(select 1 from group_progressions gp join progressions p on p.id=gp.progression_id where gp.group_id=g.id and p.assigned_partner_id=v_partner)
    order by g.created_at desc
   )x;
 end if;
 return result;
end $$;
grant execute on function public.my_partner_groups() to authenticated;

-- First admin: after creating your user in Authentication > Users, run:
-- insert into public.profiles(id,full_name,role) values ('YOUR-AUTH-USER-UUID','David Hinton','admin');
