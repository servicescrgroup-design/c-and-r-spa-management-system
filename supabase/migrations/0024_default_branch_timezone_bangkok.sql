-- The table defaults were still 'America/New_York' from the original
-- scaffold; a branch created through the admin UI without explicitly
-- setting a timezone silently inherited that instead of Thailand's.
alter table public.branches alter column timezone set default 'Asia/Bangkok';
alter table public.organizations alter column timezone set default 'Asia/Bangkok';
