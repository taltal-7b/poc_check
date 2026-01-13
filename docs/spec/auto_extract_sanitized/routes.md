# Routes (core / static extract)

- Source: `config\routes.rb`
- Note: plugin route loading block at end of routes.rb is excluded

## Explicit routes (get/post/match)

| verb | path | to | as | via |
|---|---|---|---|---|
| `match` | `login` | `account#login` | `signin` | `[:get, :post]` |
| `match` | `logout` | `account#logout` | `signout` | `[:get, :post]` |
| `match` | `account/twofa/confirm` | `account#twofa_confirm` |  | `:get` |
| `match` | `account/twofa/resend` | `account#twofa_resend` |  | `:post` |
| `match` | `account/twofa` | `account#twofa` |  | `[:get, :post]` |
| `match` | `account/register` | `account#register` | `register` | `[:get, :post]` |
| `match` | `account/lost_password` | `account#lost_password` | `lost_password` | `[:get, :post]` |
| `match` | `account/activate` | `account#activate` |  | `:get` |
| `get` | `account/activation_email` | `account#activation_email` | `activation_email` |  |
| `match` | `/news/preview` | `previews#news` | `preview_news` | `[:get, :post, :put, :patch]` |
| `match` | `/issues/preview` | `previews#issue` | `preview_issue` | `[:get, :post, :put, :patch]` |
| `match` | `/preview/text` | `previews#text` | `preview_text` | `[:get, :post, :put, :patch]` |
| `match` | `projects/:id/wiki/destroy` | `wikis#destroy` |  | `[:get, :post]` |
| `match` | `boards/:board_id/topics/new` | `messages#new` | `new_board_message` | `[:get, :post]` |
| `get` | `boards/:board_id/topics/:id` | `messages#show` | `board_message` |  |
| `match` | `boards/:board_id/topics/quote/:id` | `messages#quote` |  | `[:get, :post]` |
| `get` | `boards/:board_id/topics/:id/edit` | `messages#edit` |  |  |
| `post` | `boards/:board_id/topics/preview` | `messages#preview` | `preview_board_message` |  |
| `post` | `boards/:board_id/topics/:id/replies` | `messages#reply` |  |  |
| `post` | `boards/:board_id/topics/:id/edit` | `messages#edit` |  |  |
| `post` | `boards/:board_id/topics/:id/destroy` | `messages#destroy` |  |  |
| `match` | `/issues/auto_complete` | `auto_completes#issues` | `auto_complete_issues` | `:get` |
| `match` | `/wiki_pages/auto_complete` | `auto_completes#wiki_pages` | `auto_complete_wiki_pages` | `:get` |
| `match` | `/issues/context_menu` | `context_menus#issues` | `issues_context_menu` | `[:get, :post]` |
| `match` | `/issues/changes` | `journals#index` | `issue_changes` | `:get` |
| `match` | `/issues/:id/quoted` | `journals#new` | `quoted_issue` | `:post` |
| `get` | `diff` |  |  |  |
| `get` | `/projects/:project_id/issues/gantt` | `gantts#show` | `project_gantt` |  |
| `get` | `/issues/gantt` | `gantts#show` |  |  |
| `get` | `/projects/:project_id/issues/calendar` | `calendars#show` | `project_calendar` |  |
| `get` | `/issues/calendar` | `calendars#show` |  |  |
| `get` | `projects/:id/issues/report` | `reports#issue_report` | `project_issues_report` |  |
| `get` | `projects/:id/issues/report/:detail` | `reports#issue_report_details` | `project_issues_report_details` |  |
| `get` | `/issues/imports/new` | `imports#new` |  |  |
| `get` | `/time_entries/imports/new` | `imports#new` |  |  |
| `get` | `/users/imports/new` | `imports#new` |  |  |
| `post` | `/imports` | `imports#create` | `imports` |  |
| `get` | `/imports/:id` | `imports#show` | `import` |  |
| `match` | `/imports/:id/settings` | `imports#settings` | `import_settings` | `[:get, :post]` |
| `match` | `/imports/:id/mapping` | `imports#mapping` | `import_mapping` | `[:get, :post]` |
| `match` | `/imports/:id/run` | `imports#run` | `import_run` | `[:get, :post]` |
| `match` | `my/account` | `my#account` |  | `[:get, :put]` |
| `match` | `my/account/destroy` | `my#destroy` | `delete_my_account` | `[:get, :post]` |
| `match` | `my/page` | `my#page` |  | `:get` |
| `post` | `my/page` | `my#update_page` |  |  |
| `match` | `my` | `my#index` |  | `:get` |
| `get` | `my/api_key` | `my#show_api_key` | `my_api_key` |  |
| `post` | `my/api_key` | `my#reset_api_key` |  |  |
| `post` | `my/atom_key` | `my#reset_atom_key` | `my_atom_key` |  |
| `match` | `my/password` | `my#password` |  | `[:get, :post]` |
| `match` | `my/add_block` | `my#add_block` |  | `:post` |
| `match` | `my/remove_block` | `my#remove_block` |  | `:post` |
| `match` | `my/order_blocks` | `my#order_blocks` |  | `:post` |
| `match` | `my/twofa/activate/init` | `twofa#activate_init` |  | `:post` |
| `match` | `my/twofa/:scheme/activate/init` | `twofa#activate_init` |  | `:post` |
| `match` | `my/twofa/:scheme/activate/confirm` | `twofa#activate_confirm` |  | `:get` |
| `match` | `my/twofa/:scheme/activate` | `twofa#activate` |  | `[:get, :post]` |
| `match` | `my/twofa/:scheme/deactivate/init` | `twofa#deactivate_init` |  | `:post` |
| `match` | `my/twofa/:scheme/deactivate/confirm` | `twofa#deactivate_confirm` |  | `:get` |
| `match` | `my/twofa/:scheme/deactivate` | `twofa#deactivate` |  | `[:get, :post]` |
| `match` | `my/twofa/select_scheme` | `twofa#select_scheme` |  | `:get` |
| `match` | `my/twofa/backup_codes/init` | `twofa_backup_codes#init` |  | `:post` |
| `match` | `my/twofa/backup_codes/confirm` | `twofa_backup_codes#confirm` |  | `:get` |
| `match` | `my/twofa/backup_codes/create` | `twofa_backup_codes#create` |  | `[:get, :post]` |
| `match` | `my/twofa/backup_codes` | `twofa_backup_codes#show` |  | `[:get]` |
| `match` | `users/:user_id/twofa/deactivate` | `twofa#admin_deactivate` |  | `:post` |
| `match` | `/users/context_menu` | `context_menus#users` | `users_context_menu` | `[:get, :post]` |
| `delete` | `bulk_destroy` |  |  |  |
| `post` | `watchers/watch` | `watchers#watch` | `watch` |  |
| `delete` | `watchers/watch` | `watchers#unwatch` |  |  |
| `get` | `watchers/new` | `watchers#new` | `new_watchers` |  |
| `post` | `watchers` | `watchers#create` |  |  |
| `post` | `watchers/append` | `watchers#append` |  |  |
| `delete` | `watchers` | `watchers#destroy` |  |  |
| `get` | `watchers/autocomplete_for_mention` | `watchers#autocomplete_for_mention` |  | `[:get]` |
| `get` | `watchers/autocomplete_for_user` | `watchers#autocomplete_for_user` |  |  |
| `post` | `issues/:object_id/watchers` | `watchers#create` |  |  |
| `delete` | `issues/:object_id/watchers/:user_id` |  |  |  |
| `get` | `autocomplete` |  |  |  |
| `delete` | `bulk_destroy` |  |  |  |
| `get` | `settings(/:tab)` |  | `settings` |  |
| `match` | `archive` |  |  | `[:post, :put]` |
| `match` | `unarchive` |  |  | `[:post, :put]` |
| `match` | `close` |  |  | `[:post, :put]` |
| `match` | `reopen` |  |  | `[:post, :put]` |
| `match` | `copy` |  |  | `[:get, :post]` |
| `match` | `bookmark` |  |  | `[:delete, :post]` |
| `get` | `autocomplete` |  |  |  |
| `get` | `issues/:copy_from/copy` | `issues#new` | `copy_issue` |  |
| `post` | `issues/new` | `issues#new` |  |  |
| `put` | `close_completed` |  |  |  |
| `get` | `versions.:format` | `versions#index` |  |  |
| `get` | `roadmap` | `versions#index` |  |  |
| `get` | `versions` | `versions#index` |  |  |
| `get` | `report` |  |  |  |
| `match` | `committers` |  |  | `[:get, :post]` |
| `match` | `wiki/index` | `wiki#index` |  | `:get` |
| `get` | `rename` |  |  |  |
| `post` | `rename` |  |  |  |
| `get` | `history` |  |  |  |
| `get` | `diff` |  |  |  |
| `match` | `preview` |  |  | `[:post, :put, :patch]` |
| `post` | `protect` |  |  |  |
| `post` | `add_attachment` |  |  |  |
| `get` | `export` |  |  |  |
| `get` | `date_index` |  |  |  |
| `post` | `new` |  |  |  |
| `match` | `wiki` | `wiki#show` |  | `:get` |
| `get` | `wiki/:id/:version` | `wiki#show` |  |  |
| `delete` | `wiki/:id/:version` | `wiki#destroy_version` |  |  |
| `get` | `wiki/:id/:version/annotate` | `wiki#annotate` |  |  |
| `get` | `wiki/:id/:version/diff` | `wiki#diff` |  |  |
| `patch` | `edit` | `issues#edit` |  |  |
| `get` | `tab/:name` |  | `tab` |  |
| `match` | `bulk_edit` |  |  | `[:get, :post]` |
| `match` | `bulk_update` |  |  | `[:post, :patch]` |
| `post` | `/issues/new` | `issues#new` |  |  |
| `match` | `/issues` | `issues#destroy` |  | `:delete` |
| `get` | `/queries/filter` | `queries#filter` | `queries_filter` |  |
| `match` | `/news/:id/comments` | `comments#create` |  | `:post` |
| `match` | `/news/:id/comments/:comment_id` | `comments#destroy` |  | `:delete` |
| `post` | `status_by` |  |  |  |
| `post` | `add_attachment` |  |  |  |
| `match` | `/time_entries/context_menu` | `context_menus#time_entries` | `time_entries_context_menu` | `[:get, :post]` |
| `patch` | `edit` | `timelog#edit` |  |  |
| `get` | `report` |  |  |  |
| `get` | `bulk_edit` |  |  |  |
| `post` | `bulk_update` |  |  |  |
| `match` | `/time_entries/:id` | `timelog#destroy` |  | `:delete` |
| `match` | `/time_entries/destroy` | `timelog#destroy` |  | `:delete` |
| `post` | `/time_entries/new` | `timelog#new` |  |  |
| `post` | `/time_entries/bulk_edit` | `timelog#bulk_edit` |  |  |
| `get` | `projects/:id/activity` | `activities#index` | `project_activity` |  |
| `get` | `activity` | `activities#index` |  |  |
| `get` | `projects/:id/repository/:repository_id/statistics` | `repositories#stats` |  |  |
| `get` | `projects/:id/repository/:repository_id/graph` | `repositories#graph` |  |  |
| `post` | `projects/:id/repository/:repository_id/fetch_changesets` | `repositories#fetch_changesets` |  |  |
| `get` | `projects/:id/repository/:repository_id/revisions/:rev` | `repositories#revision` |  |  |
| `get` | `projects/:id/repository/:repository_id/revision` | `repositories#revision` |  |  |
| `post` | `projects/:id/repository/:repository_id/revisions/:rev/issues` | `repositories#add_related_issue` |  |  |
| `delete` | `projects/:id/repository/:repository_id/revisions/:rev/issues/:issue_id` | `repositories#remove_related_issue` |  |  |
| `get` | `projects/:id/repository/:repository_id/revisions` | `repositories#revisions` |  |  |
| `get` | `projects/:id/repository/:repository_id/revisions/:rev/#{action}(/*path)` |  |  |  |
| `get` | `projects/:id/repository/:repository_id/#{action}(/*path)` |  |  |  |
| `get` | `projects/:id/repository/:repository_id/revisions/:rev/diff(/*path)` |  |  |  |
| `get` | `projects/:id/repository/:repository_id/diff(/*path)` |  |  |  |
| `get` | `projects/:id/repository/:repository_id/show/*path` | `repositories#show` |  |  |
| `get` | `projects/:id/repository/:repository_id` | `repositories#show` |  |  |
| `get` | `projects/:id/repository` | `repositories#show` |  |  |
| `get` | `attachments/:id/:filename` | `attachments#show` | `named_attachment` |  |
| `get` | `attachments/download/:id/:filename` | `attachments#download` | `download_named_attachment` |  |
| `get` | `attachments/download/:id` | `attachments#download` |  |  |
| `get` | `attachments/thumbnail/:id(/:size)` | `attachments#thumbnail` | `thumbnail` |  |
| `get` | `attachments/:object_type/:object_id/edit` | `attachments#edit_all` | `object_attachments_edit` |  |
| `patch` | `attachments/:object_type/:object_id` | `attachments#update_all` | `object_attachments` |  |
| `get` | `attachments/:object_type/:object_id/download` | `attachments#download_all` | `object_attachments_download` |  |
| `get` | `autocomplete_for_user` |  |  |  |
| `get` | `groups/:id/users/new` | `groups#new_users` | `new_group_users` |  |
| `post` | `groups/:id/users` | `groups#add_users` | `group_users` |  |
| `delete` | `groups/:id/users/:user_id` | `groups#remove_user` | `group_user` |  |
| `match` | `fields` |  |  | `[:get, :post]` |
| `post` | `update_issue_done_ratio` |  |  |  |
| `put` | `enumerations` | `custom_field_enumerations#update_each` |  |  |
| `get` | `permissions` |  |  |  |
| `post` | `permissions` | `roles#update_permissions` |  |  |
| `match` | `enumerations/:type` | `enumerations#index` |  | `:get` |
| `get` | `(projects/:id)/search` | `search#index` | `search` |  |
| `get` | `mail_handler` | `mail_handler#new` |  |  |
| `post` | `mail_handler` | `mail_handler#index` |  |  |
| `get` | `admin` | `admin#index` |  |  |
| `get` | `admin/projects` | `admin#projects` |  |  |
| `get` | `admin/plugins` | `admin#plugins` |  |  |
| `get` | `admin/info` | `admin#info` |  |  |
| `post` | `admin/test_email` | `admin#test_email` | `test_email` |  |
| `post` | `admin/default_configuration` | `admin#default_configuration` |  |  |
| `match` | `/admin/projects_context_menu` | `context_menus#projects` | `projects_context_menu` | `[:get, :post]` |
| `get` | `test_connection` |  | `try_connection` |  |
| `get` | `autocomplete_for_new_user` |  |  |  |
| `get` | `edit` |  |  |  |
| `patch` | `update` |  |  |  |
| `get` | `permissions` |  |  |  |
| `patch` | `update_permissions` |  |  |  |
| `get` | `copy` |  |  |  |
| `post` | `duplicate` |  |  |  |
| `match` | `settings` | `settings#index` |  | `:get` |
| `match` | `settings/edit` | `settings#edit` |  | `[:get, :post]` |
| `match` | `settings/plugin/:id` | `settings#plugin` | `plugin_settings` | `[:get, :post]` |
| `match` | `sys/projects` | `sys#projects` |  | `:get` |
| `match` | `sys/projects/:id/repository` | `sys#create_project_repository` |  | `:post` |
| `match` | `sys/fetch_changesets` | `sys#fetch_changesets` |  | `[:get, :post]` |
| `match` | `uploads` | `attachments#upload` |  | `:post` |
| `get` | `robots.:format` | `welcome#robots` |  |  |

## resources/resource declarations

- Note: REST routes generated from `resources` are NOT expanded here.

- `resources :journals, :only => [:edit, :update] do`
- `resources :users do`
- `resources :memberships, :controller => 'principal_memberships'`
- `resources :email_addresses, :only => [:index, :create, :update, :destroy]`
- `resources :projects do`
- `resources :memberships, :controller => 'members' do`
- `resource :enumerations, :controller => 'project_enumerations', :only => [:update, :destroy]`
- `resources :issues, :only => [:index, :new, :create]`
- `resources :files, :only => [:index, :new, :create]`
- `resources :versions, :except => [:index, :show, :edit, :update, :destroy] do`
- `resources :news, :except => [:show, :edit, :update, :destroy]`
- `resources :time_entries, :controller => 'timelog', :except => [:show, :edit, :update, :destroy] do`
- `resources :queries, :only => [:new, :create]`
- `resources :issue_categories`
- `resources :documents, :except => [:show, :edit, :update, :destroy]`
- `resources :boards`
- `resources :repositories, :except => [:index, :show] do`
- `resources :wiki, :except => [:index, :create], :as => 'wiki_page' do`
- `resources :issues do`
- `resources :time_entries, :controller => 'timelog', :only => [:new, :create]`
- `resources :relations, :controller => 'issue_relations', :only => [:index, :show, :create, :destroy]`
- `resources :queries, :except => [:show]`
- `resources :news, :only => [:index, :show, :edit, :update, :destroy, :create, :new]`
- `resources :versions, :only => [:show, :edit, :update, :destroy] do`
- `resources :documents, :only => [:show, :edit, :update, :destroy] do`
- `resources :time_entries, :controller => 'timelog', :except => :destroy do`
- `resources :attachments, :only => [:show, :update, :destroy]`
- `resources :groups do`
- `resources :memberships, :controller => 'principal_memberships'`
- `resources :trackers, :except => :show do`
- `resources :issue_statuses, :except => :show do`
- `resources :custom_fields, :except => :show do`
- `resources :enumerations, :controller => 'custom_field_enumerations', :except => [:show, :new, :edit]`
- `resources :roles do`
- `resources :enumerations, :except => :show`
- `resources :auth_sources do`
- `resources :workflows, only: [:index] do`
