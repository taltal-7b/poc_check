# Auto Extract (Target app v5.1.11 / core)

Generated_at: `2026-01-13T15:03:50`

## Outputs

- `routes.md`: routes (static parse of `config/routes.rb`, plugin routes excluded)
- `settings_keys.md`: settings keys (`config/settings.yml`)
- `domain_relations.md`: model relations (static scan of `app/models/**/*.rb`)
- `permissions_definitions.md`: permission definitions (from `lib/(omitted)/preparation.rb` `AccessControl.map`)
- `permissions_checks.md`: permission check call-sites (scan for `allowed_to?`, `authorize`, etc.)
- `jobs_and_mail.md`: jobs / mail related entry points

## Sources

- `config\routes.rb`
- `config\settings.yml`
- `lib\(omitted)\preparation.rb`
- `app\controllers\application_controller.rb`
- `app\models\mail_handler.rb`
- `app\models\mailer.rb`
- `app\jobs\\`