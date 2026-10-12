create or replace function public.ra_join_room(p_token text,p_display text) returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid; rr text; existing_role text;
begin
if auth.uid() is null then raise exception 'Bạn cần đăng nhập'; end if;
select room_id,case when judge_token=p_token then 'judge' else 'candidate' end into rid,rr from public.ra_invites where judge_token=p_token or candidate_token=p_token limit 1;
if rid is null then raise exception 'Link mời không hợp lệ'; end if;
select role into existing_role from public.ra_members where room_id=rid and user_id=auth.uid();
if existing_role is not null then
 if existing_role<>rr then raise exception 'Thiết bị này đã tham gia với vai trò %. Hãy dùng trình duyệt hoặc thiết bị riêng cho từng người.',existing_role; end if;
 return rid;
end if;
if rr='candidate' and exists(select 1 from public.ra_members where room_id=rid and role='candidate') then raise exception 'Phòng đã có thí sinh'; end if;
insert into public.ra_members(room_id,user_id,display_name,role) values(rid,auth.uid(),left(coalesce(nullif(trim(p_display),''),'Khách'),60),rr);
return rid;
end$$;
create or replace function public.ra_join_by_code(p_code text,p_display text) returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid; rr text; normalized text; existing_role text;
begin
if auth.uid() is null then raise exception 'Bạn cần đăng nhập';end if;
normalized:=upper(regexp_replace(coalesce(p_code,''),'\s','','g'));
select room_id,case when judge_code=normalized then 'judge' else 'candidate' end into rid,rr from public.ra_invites where judge_code=normalized or candidate_code=normalized limit 1;
if rid is null then raise exception 'Mã mời không hợp lệ';end if;
select role into existing_role from public.ra_members where room_id=rid and user_id=auth.uid();
if existing_role is not null then
 if existing_role<>rr then raise exception 'Thiết bị này đã tham gia với vai trò %. Hãy dùng trình duyệt hoặc thiết bị riêng cho từng người.',existing_role;end if;
 return rid;
end if;
if rr='candidate' and exists(select 1 from public.ra_members where room_id=rid and role='candidate') then raise exception 'Phòng đã có thí sinh';end if;
insert into public.ra_members(room_id,user_id,display_name,role) values(rid,auth.uid(),left(coalesce(nullif(trim(p_display),''),'Khách'),60),rr);
return rid;
end$$;
create or replace function public.ra_enforce_room_update() returns trigger language plpgsql security invoker set search_path=public as $$
begin
if auth.uid() is distinct from old.host_id then raise exception 'Chỉ Host có quyền quản lý phòng';end if;
if new.id is distinct from old.id or new.host_id is distinct from old.host_id then raise exception 'Không được thay đổi chủ phòng';end if;
if new.phase is distinct from old.phase then
 if not ((old.phase='lobby' and new.phase='voting') or (old.phase='voting' and new.phase='preview') or (old.phase='preview' and new.phase='preparation') or (old.phase='preparation' and new.phase='audition') or (old.phase='audition' and new.phase in ('break','results')) or (old.phase='break' and new.phase='audition')) then
 raise exception 'Chuyển giai đoạn không hợp lệ: % → %',old.phase,new.phase;
 end if;
end if;
return new;
end$$;
drop trigger if exists ra_room_guard on public.ra_rooms;
create trigger ra_room_guard before update on public.ra_rooms for each row execute function public.ra_enforce_room_update();
drop policy if exists ra_score_insert on public.ra_scores;
create policy ra_score_insert on public.ra_scores for insert to authenticated with check(public.ra_is_judge(room_id) and judge_id=auth.uid() and submitted=true and jsonb_typeof("values")='array' and jsonb_array_length("values")=5 and exists(select 1 from public.ra_rooms r where r.id=room_id and r.phase='audition' and r.skill=skill and not skill=any(r.skips)));
drop policy if exists ra_score_update on public.ra_scores;
create policy ra_score_update on public.ra_scores for update to authenticated using(public.ra_is_judge(room_id) and judge_id=auth.uid() and submitted=false) with check(public.ra_is_judge(room_id) and judge_id=auth.uid() and exists(select 1 from public.ra_rooms r where r.id=room_id and r.phase='audition' and r.skill=skill));
drop policy if exists ra_appeal_insert on public.ra_appeals;
create policy ra_appeal_insert on public.ra_appeals for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.ra_members m join public.ra_rooms r on r.id=m.room_id where m.room_id=ra_appeals.room_id and m.user_id=auth.uid() and m.role='candidate' and r.phase='preparation'));
do $$ begin
if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='ra_rooms') then alter publication supabase_realtime add table public.ra_rooms;end if;
if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='ra_members') then alter publication supabase_realtime add table public.ra_members;end if;
end $$;
notify pgrst, 'reload schema';
