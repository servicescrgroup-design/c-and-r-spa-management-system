-- Extra service languages beyond English and Thai. The owner picks which
-- languages the menu is offered in (site_content.service_languages, shared by
-- every service), and each service stores its own translated name and
-- description per language code: {"ja": {"name": "...", "description": "..."}}.

alter table public.services
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.services
  add constraint services_translations_is_object check (jsonb_typeof(translations) = 'object');

alter table public.site_content
  add column if not exists service_languages text[] not null default '{}';
