create extension if not exists vector;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  quota_remaining integer not null default 30 check (quota_remaining >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, version integer not null default 1, scene jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists boards_owner_updated_idx on public.boards(owner_id, updated_at desc);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  kind text not null check (kind in ('image','web','text')), title text not null, source_url text, object_key text,
  extracted_text text, metadata jsonb not null default '{}'::jsonb,
  status text not null default 'idle' check (status in ('idle','queued','processing','ready','failed')),
  embedding vector(1536), created_at timestamptz not null default now()
);
create index if not exists assets_board_idx on public.assets(board_id, created_at desc);
create index if not exists assets_embedding_idx on public.assets using hnsw (embedding vector_cosine_ops);

create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(), asset_id uuid not null references public.assets(id) on delete cascade,
  schema_version integer not null default 1, provider text not null, model text not null, result jsonb,
  status text not null check (status in ('queued','processing','ready','failed')), error text, created_at timestamptz not null default now()
);

create table if not exists public.relations (
  id uuid primary key default gen_random_uuid(), board_id uuid not null references public.boards(id) on delete cascade,
  source_id text not null, target_id text not null, type text not null, origin text not null check (origin in ('human','ai')), score real,
  unique(board_id, source_id, target_id, type)
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  type text not null, subject_id text not null, status text not null check (status in ('queued','processing','ready','failed')),
  attempts integer not null default 0, result jsonb, error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(), board_id uuid not null references public.boards(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade, token_hash text not null unique,
  revoked_at timestamptz, created_at timestamptz not null default now()
);

create table if not exists public.ai_credentials (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('openai','qwen','deepseek')), ciphertext text not null, iv text not null, auth_tag text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_id, provider)
);

create table if not exists public.usage_ledger (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  action text not null, units integer not null, job_id uuid references public.jobs(id) on delete set null, created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.assets enable row level security;
alter table public.analyses enable row level security;
alter table public.relations enable row level security;
alter table public.jobs enable row level security;
alter table public.share_links enable row level security;
alter table public.ai_credentials enable row level security;
alter table public.usage_ledger enable row level security;

create policy "profiles own" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "boards own" on public.boards for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "assets own" on public.assets for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "analyses through asset" on public.analyses for all using (exists(select 1 from public.assets a where a.id = asset_id and a.owner_id = auth.uid()));
create policy "relations through board" on public.relations for all using (exists(select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid()));
create policy "jobs own" on public.jobs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "shares own" on public.share_links for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "credentials own" on public.ai_credentials for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "usage own" on public.usage_ledger for select using (owner_id = auth.uid());

