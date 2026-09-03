-- Supabase 대시보드 왼쪽 메뉴 "SQL Editor" 에서 이 전체를 붙여넣고 Run 누르면 됩니다.

create table if not exists public.strokes (
  problem_id int primary key,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.strokes enable row level security;

-- 지금은 로그인 기능이 없는 프로토타입이라 anon 키로 누구나 읽고/쓸 수 있게 열어둡니다.
-- (나중에 로그인을 붙이면 이 정책을 사용자별로 제한하도록 바꿔야 합니다.)
create policy "public read strokes" on public.strokes
  for select using (true);

create policy "public insert strokes" on public.strokes
  for insert with check (true);

create policy "public update strokes" on public.strokes
  for update using (true) with check (true);

create policy "public delete strokes" on public.strokes
  for delete using (true);
