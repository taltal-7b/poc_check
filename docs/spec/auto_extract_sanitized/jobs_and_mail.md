# Jobs / Mail

## ActiveJob

- Source: `app\jobs\\`

### `ApplicationJob`

- file: `app\jobs\application_job.rb`
- super: `ActiveJob::Base`
- methods: (none)

### `DestroyProjectJob`

- file: `app\jobs\destroy_project_job.rb`
- super: `ApplicationJob`
- methods: `delete_project`, `failure`, `info`, `perform`, `self.schedule`, `success`

### `DestroyProjectsJob`

- file: `app\jobs\destroy_projects_job.rb`
- super: `ApplicationJob`
- methods: `info`, `perform`, `self.schedule`

## MailHandler (inbound)

- model: `app\models\mail_handler.rb`
- controller: `app\controllers\mail_handler_controller.rb`
- routes: `config\routes.rb` (`mail_handler` GET/POST)

Notes (static view):

- `MailHandler.receive/safe_receive` is an entry point
- `MailHandlerController#index` checks `Setting.mail_handler_api_enabled?` and `Setting.mail_handler_api_key`
- Receive methods perform permission checks (e.g. `allowed_to?`, `notes_addable?`)

## Mailer (outbound)

- Source: `app\models\mailer.rb`

Representative APIs (deliver_later):

- `Mailer.deliver_issue_add(issue)`
- `Mailer.deliver_issue_edit(journal)`
- `Mailer.deliver_security_notification(users, sender, ...)`
- `Mailer.deliver_settings_updated(sender, changes, ...)`
