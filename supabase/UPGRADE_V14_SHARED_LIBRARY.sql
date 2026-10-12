-- V14: Thư viện nhạc riêng của từng tài khoản Host, dùng chung cho mọi phòng.
-- Chạy sau schema.sql và các nâng cấp V11/V13. Không xóa bảng cũ.
create table if not exists public.ra_host_library (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null,
 category text not null check(category in ('vocal','rap','expression','pitch-high','pitch-low')),
 path text not null,
 created_at timestamptz not null default now(),
 unique(owner_id,path)
);
create index if not exists ra_host_library_owner_idx on public.ra_host_library(owner_id,created_at desc);
alter table public.ra_host_library enable row level security;
drop policy if exists ra_host_library_select on public.ra_host_library;
create policy ra_host_library_select on public.ra_host_library for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists ra_host_library_insert on public.ra_host_library;
create policy ra_host_library_insert on public.ra_host_library for insert to authenticated with check(owner_id=(select auth.uid()));
drop policy if exists ra_host_library_delete on public.ra_host_library;
create policy ra_host_library_delete on public.ra_host_library for delete to authenticated using(owner_id=(select auth.uid()));
-- Di chuyển chỉ mục các bài đã upload trong những phòng Host sở hữu.
-- Không di chuyển/xóa file Storage, không xóa bài đã đề cử, không xóa phiếu.
insert into public.ra_host_library(owner_id,title,category,path,created_at)
select r.host_id,t.title,t.category,t.path,coalesce(t.created_at,now())
from public.ra_tracks t join public.ra_rooms r on r.id=t.room_id
where r.host_id is not null
on conflict(owner_id,path) do nothing;
notify pgrst, 'reload schema';
