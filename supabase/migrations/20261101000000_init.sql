-- =====================================================================
-- Foco Beauty · estrutura inicial
-- Perfis + créditos (SaaS), análises, bucket de fotos e regras de acesso
-- =====================================================================

-- PERFIS --------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text,
  studio      text,
  plano       text not null default 'gratis' check (plano in ('gratis', 'pro', 'studio')),
  creditos    integer not null default 5 check (creditos >= 0),
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "perfil: ler o próprio" on public.profiles
  for select using (auth.uid() = id);

-- A profissional só pode editar nome e studio. Plano e créditos só mudam pelo servidor.
create policy "perfil: editar o próprio" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

revoke update on public.profiles from authenticated;
grant update (nome, studio) on public.profiles to authenticated;

-- Cria o perfil automaticamente no cadastro (5 análises grátis)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ANÁLISES ------------------------------------------------------------
create table if not exists public.analyses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  segmento     text not null,
  observacoes  text,
  foto_path    text not null,
  resultado    jsonb not null,
  nota_geral   numeric(3,1),
  created_at   timestamptz not null default now()
);

create index if not exists analyses_user_created_idx on public.analyses (user_id, created_at desc);

alter table public.analyses enable row level security;

create policy "análises: ler as próprias" on public.analyses
  for select using (auth.uid() = user_id);

create policy "análises: apagar as próprias" on public.analyses
  for delete using (auth.uid() = user_id);
-- Inserção é feita somente pela Edge Function (service role), depois da IA responder.

-- CRÉDITOS (chamado pela Edge Function) --------------------------------
create or replace function public.consumir_credito(p_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare restantes integer;
begin
  update public.profiles
     set creditos = creditos - 1
   where id = p_user and creditos > 0
  returning creditos into restantes;
  return coalesce(restantes, -1); -- -1 = sem créditos
end $$;

create or replace function public.devolver_credito(p_user uuid)
returns void language sql security definer set search_path = public as $$
  update public.profiles set creditos = creditos + 1 where id = p_user;
$$;

revoke execute on function public.consumir_credito(uuid) from public, anon, authenticated;
revoke execute on function public.devolver_credito(uuid) from public, anon, authenticated;

-- STORAGE: fotos dos procedimentos (privado) ----------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('procedimentos', 'procedimentos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Cada profissional só acessa a própria pasta: procedimentos/<user_id>/arquivo.jpg
create policy "fotos: enviar na própria pasta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'procedimentos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "fotos: ver as próprias" on storage.objects
  for select to authenticated
  using (bucket_id = 'procedimentos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "fotos: apagar as próprias" on storage.objects
  for delete to authenticated
  using (bucket_id = 'procedimentos' and (storage.foldername(name))[1] = auth.uid()::text);
