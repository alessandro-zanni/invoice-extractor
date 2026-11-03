-- Uploaded documents with their extraction, validation issues and human corrections.
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_path text not null,
  media_type text not null check (media_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  status text not null check (status in ('ok', 'needs_review', 'corrected')),
  review_reason text check (review_reason in ('document_inconsistent', 'uncertain_extraction')),
  extraction jsonb,
  issues jsonb not null default '[]',
  attempts jsonb not null default '[]',
  cost_usd numeric(10, 6) not null default 0,
  correction jsonb,
  corrected_at timestamptz,
  created_at timestamptz not null default now()
);

create index documents_user_created_idx on public.documents (user_id, created_at desc);

alter table public.documents enable row level security;

revoke all on public.documents from anon;
grant select, insert, update, delete on public.documents to authenticated;

create policy "own documents: select" on public.documents for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own documents: insert" on public.documents for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own documents: update" on public.documents for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "own documents: delete" on public.documents for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Private bucket; files live under <user_id>/<document_id>.<ext>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

create policy "own files: select" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files: insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
