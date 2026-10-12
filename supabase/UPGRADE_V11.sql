alter table public.ra_invites add column if not exists judge_code text;
alter table public.ra_invites add column if not exists candidate_code text;
update public.ra_invites set judge_code = upper(substr(replace(pg_catalog.gen_random_uuid()::text,'-',''),1,12)) where judge_code is null;
update public.ra_invites set candidate_code = upper(substr(replace(pg_catalog.gen_random_uuid()::text,'-',''),1,12)) where candidate_code is null;
create unique index if not exists ra_invites_judge_code_unique on public.ra_invites(judge_code);
create unique index if not exists ra_invites_candidate_code_unique on public.ra_invites(candidate_code);
create or replace function public.ra_create_room(p_name text,p_display text) returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid;begin
if auth.uid() is null then raise exception 'Bạn cần đăng nhập';end if;
insert into public.ra_rooms(name,host_id) values(left(coalesce(nullif(trim(p_name),''),'Audition'),100),auth.uid()) returning id into rid;
insert into public.ra_invites(room_id,judge_token,candidate_token,judge_code,candidate_code) values(rid,replace(pg_catalog.gen_random_uuid()::text,'-','')||replace(pg_catalog.gen_random_uuid()::text,'-',''),replace(pg_catalog.gen_random_uuid()::text,'-','')||replace(pg_catalog.gen_random_uuid()::text,'-',''),upper(substr(replace(pg_catalog.gen_random_uuid()::text,'-',''),1,12)),upper(substr(replace(pg_catalog.gen_random_uuid()::text,'-',''),1,12)));
insert into public.ra_members(room_id,user_id,display_name,role) values(rid,auth.uid(),left(coalesce(nullif(trim(p_display),''),'Host'),60),'host');return rid;end$$;
create or replace function public.ra_join_by_code(p_code text,p_display text) returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid; rr text; normalized text;begin
if auth.uid() is null then raise exception 'Bạn cần đăng nhập';end if;
normalized:=upper(regexp_replace(coalesce(p_code,''),'\s','','g'));
select room_id,case when judge_code=normalized then 'judge' else 'candidate' end into rid,rr from public.ra_invites where judge_code=normalized or candidate_code=normalized limit 1;
if rid is null then raise exception 'Mã mời không hợp lệ';end if;
if exists(select 1 from public.ra_members where room_id=rid and user_id=auth.uid()) then return rid;end if;
if rr='candidate' and exists(select 1 from public.ra_members where room_id=rid and role='candidate') then raise exception 'Phòng đã có thí sinh';end if;
insert into public.ra_members(room_id,user_id,display_name,role) values(rid,auth.uid(),left(coalesce(nullif(trim(p_display),''),'Khách'),60),rr);return rid;end$$;
revoke all on function public.ra_join_by_code(text,text) from public;
grant execute on function public.ra_join_by_code(text,text) to authenticated;
notify pgrst, 'reload schema';
