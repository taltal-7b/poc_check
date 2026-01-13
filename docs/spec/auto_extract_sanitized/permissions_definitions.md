# Permission definitions (AccessControl.map / static extract)

- Source: `lib\(omitted)\preparation.rb`

## Summary

| permission | project_module | public | require | read | actions |
|---|---|---:|---|---:|---:|
| `add_documents` | `documents` | false | `loggedin` | false | 4 |
| `add_issue_notes` | `issue_tracking` | false |  | false | 4 |
| `add_issue_watchers` | `issue_tracking` | false |  | false | 5 |
| `add_issues` | `issue_tracking` | false |  | false | 3 |
| `add_message_watchers` | `boards` | false |  | false | 4 |
| `add_messages` | `boards` | false |  | false | 4 |
| `add_project` |  | false | `loggedin` | false | 2 |
| `add_subprojects` |  | false | `member` | false | 2 |
| `add_wiki_page_watchers` | `wiki` | false |  | false | 4 |
| `browse_repository` | `repository` | false |  | true | 9 |
| `close_project` |  | false | `member` | true | 2 |
| `comment_news` | `news` | false |  | false | 1 |
| `commit_access` | `repository` | false |  | false | 0 |
| `copy_issues` | `issue_tracking` | false |  | false | 5 |
| `delete_documents` | `documents` | false | `loggedin` | false | 1 |
| `delete_issue_watchers` | `issue_tracking` | false |  | false | 1 |
| `delete_issues` | `issue_tracking` | false | `member` | false | 1 |
| `delete_message_watchers` | `boards` | false |  | false | 1 |
| `delete_messages` | `boards` | false | `member` | false | 1 |
| `delete_own_messages` | `boards` | false | `loggedin` | false | 1 |
| `delete_project` |  | false | `member` | true | 1 |
| `delete_wiki_page_watchers` | `wiki` | false |  | false | 1 |
| `delete_wiki_pages` | `wiki` | false | `member` | false | 2 |
| `delete_wiki_pages_attachments` | `wiki` | false |  | false | 0 |
| `edit_documents` | `documents` | false | `loggedin` | false | 4 |
| `edit_issue_notes` | `issue_tracking` | false | `loggedin` | false | 2 |
| `edit_issues` | `issue_tracking` | false |  | false | 6 |
| `edit_messages` | `boards` | false | `member` | false | 2 |
| `edit_own_issue_notes` | `issue_tracking` | false | `loggedin` | false | 2 |
| `edit_own_issues` | `issue_tracking` | false |  | false | 6 |
| `edit_own_messages` | `boards` | false | `loggedin` | false | 2 |
| `edit_own_time_entries` | `time_tracking` | false |  | false | 0 |
| `edit_project` |  | false | `member` | false | 3 |
| `edit_time_entries` | `time_tracking` | false |  | false | 0 |
| `edit_wiki_pages` | `wiki` | false |  | false | 0 |
| `export_wiki_pages` | `wiki` | false |  | true | 1 |
| `import_issues` | `issue_tracking` | false |  | false | 0 |
| `import_time_entries` | `time_tracking` | false |  | false | 0 |
| `log_time` | `time_tracking` | false | `loggedin` | false | 2 |
| `log_time_for_other_users` | `time_tracking` | false | `member` | false | 0 |
| `manage_boards` | `boards` | false | `member` | false | 6 |
| `manage_categories` | `issue_tracking` | false | `member` | false | 8 |
| `manage_files` | `files` | false | `loggedin` | false | 3 |
| `manage_issue_relations` | `issue_tracking` | false |  | false | 4 |
| `manage_members` |  | false | `member` | false | 9 |
| `manage_news` | `news` | false | `member` | false | 7 |
| `manage_project_activities` | `time_tracking` | false |  | false | 0 |
| `manage_public_queries` |  | false | `member` | false | 5 |
| `manage_related_issues` | `repository` | false |  | false | 2 |
| `manage_repository` | `repository` | false | `member` | false | 8 |
| `manage_subtasks` | `issue_tracking` | false |  | false | 0 |
| `manage_versions` |  | false | `member` | false | 7 |
| `manage_wiki` | `wiki` | false | `member` | false | 2 |
| `protect_wiki_pages` | `wiki` | false | `member` | false | 1 |
| `rename_wiki_pages` | `wiki` | false | `member` | false | 1 |
| `save_queries` |  | false | `loggedin` | false | 5 |
| `search_project` |  | true |  | true | 1 |
| `select_project_modules` |  | false | `member` | false | 1 |
| `select_project_publicity` |  | false | `member` | false | 0 |
| `set_issues_private` | `issue_tracking` | false |  | false | 0 |
| `set_notes_private` | `issue_tracking` | false | `member` | false | 0 |
| `set_own_issues_private` | `issue_tracking` | false | `loggedin` | false | 0 |
| `view_calendar` | `calendar` | false |  | true | 2 |
| `view_changesets` | `repository` | false |  | true | 3 |
| `view_documents` | `documents` | false |  | true | 3 |
| `view_files` | `files` | false |  | true | 2 |
| `view_gantt` | `gantt` | false |  | true | 2 |
| `view_issue_watchers` | `issue_tracking` | false |  | true | 0 |
| `view_issues` | `issue_tracking` | false |  | false | 13 |
| `view_members` |  | true |  | true | 2 |
| `view_message_watchers` | `boards` | false |  | true | 0 |
| `view_messages` | `boards` | false |  | true | 3 |
| `view_news` | `news` | false |  | true | 2 |
| `view_private_notes` | `issue_tracking` | false | `member` | true | 0 |
| `view_project` |  | true |  | true | 3 |
| `view_time_entries` | `time_tracking` | false |  | true | 3 |
| `view_wiki_edits` | `wiki` | false |  | true | 3 |
| `view_wiki_page_watchers` | `wiki` | false |  | true | 0 |
| `view_wiki_pages` | `wiki` | false |  | true | 5 |

## controller/action list

### `add_documents`

- project_module: `documents`
- public: `False`
- require: `loggedin`
- read: `False`

- `attachments/upload`
- `documents/add_attachment`
- `documents/create`
- `documents/new`

### `add_issue_notes`

- project_module: `issue_tracking`
- public: `False`
- require: (none)
- read: `False`

- `attachments/upload`
- `issues/edit`
- `issues/update`
- `journals/new`

### `add_issue_watchers`

- project_module: `issue_tracking`
- public: `False`
- require: (none)
- read: `False`

- `watchers/append`
- `watchers/autocomplete_for_mention`
- `watchers/autocomplete_for_user`
- `watchers/create`
- `watchers/new`

### `add_issues`

- project_module: `issue_tracking`
- public: `False`
- require: (none)
- read: `False`

- `attachments/upload`
- `issues/create`
- `issues/new`

### `add_message_watchers`

- project_module: `boards`
- public: `False`
- require: (none)
- read: `False`

- `watchers/autocomplete_for_mention`
- `watchers/autocomplete_for_user`
- `watchers/create`
- `watchers/new`

### `add_messages`

- project_module: `boards`
- public: `False`
- require: (none)
- read: `False`

- `attachments/upload`
- `messages/new`
- `messages/quote`
- `messages/reply`

### `add_project`

- project_module: (none)
- public: `False`
- require: `loggedin`
- read: `False`

- `projects/create`
- `projects/new`

### `add_subprojects`

- project_module: (none)
- public: `False`
- require: `member`
- read: `False`

- `projects/create`
- `projects/new`

### `add_wiki_page_watchers`

- project_module: `wiki`
- public: `False`
- require: (none)
- read: `False`

- `watchers/autocomplete_for_mention`
- `watchers/autocomplete_for_user`
- `watchers/create`
- `watchers/new`

### `browse_repository`

- project_module: `repository`
- public: `False`
- require: (none)
- read: `True`

- `repositories/annotate`
- `repositories/browse`
- `repositories/changes`
- `repositories/diff`
- `repositories/entry`
- `repositories/graph`
- `repositories/raw`
- `repositories/show`
- `repositories/stats`

### `close_project`

- project_module: (none)
- public: `False`
- require: `member`
- read: `True`

- `projects/close`
- `projects/reopen`

### `comment_news`

- project_module: `news`
- public: `False`
- require: (none)
- read: `False`

- `comments/create`

### `commit_access`

- project_module: `repository`
- public: `False`
- require: (none)
- read: `False`

- actions: (none)

### `copy_issues`

- project_module: `issue_tracking`
- public: `False`
- require: (none)
- read: `False`

- `attachments/upload`
- `issues/bulk_edit`
- `issues/bulk_update`
- `issues/create`
- `issues/new`

### `delete_documents`

- project_module: `documents`
- public: `False`
- require: `loggedin`
- read: `False`

- `documents/destroy`

### `delete_issue_watchers`

- project_module: `issue_tracking`
- public: `False`
- require: (none)
- read: `False`

- `watchers/destroy`

### `delete_issues`

- project_module: `issue_tracking`
- public: `False`
- require: `member`
- read: `False`

- `issues/destroy`

### `delete_message_watchers`

- project_module: `boards`
- public: `False`
- require: (none)
- read: `False`

- `watchers/destroy`

### `delete_messages`

- project_module: `boards`
- public: `False`
- require: `member`
- read: `False`

- `messages/destroy`

### `delete_own_messages`

- project_module: `boards`
- public: `False`
- require: `loggedin`
- read: `False`

- `messages/destroy`

### `delete_project`

- project_module: (none)
- public: `False`
- require: `member`
- read: `True`

- `projects/destroy`

### `delete_wiki_page_watchers`

- project_module: `wiki`
- public: `False`
- require: (none)
- read: `False`

- `watchers/destroy`

### `delete_wiki_pages`

- project_module: `wiki`
- public: `False`
- require: `member`
- read: `False`

- `wiki/destroy`
- `wiki/destroy_version`

### `delete_wiki_pages_attachments`

- project_module: `wiki`
- public: `False`
- require: (none)
- read: `False`

- actions: (none)

### `edit_documents`

- project_module: `documents`
- public: `False`
- require: `loggedin`
- read: `False`

- `attachments/upload`
- `documents/add_attachment`
- `documents/edit`
- `documents/update`

### `edit_issue_notes`

- project_module: `issue_tracking`
- public: `False`
- require: `loggedin`
- read: `False`

- `journals/edit`
- `journals/update`

### `edit_issues`

- project_module: `issue_tracking`
- public: `False`
- require: (none)
- read: `False`

- `attachments/upload`
- `issues/bulk_edit`
- `issues/bulk_update`
- `issues/edit`
- `issues/update`
- `journals/new`

### `edit_messages`

- project_module: `boards`
- public: `False`
- require: `member`
- read: `False`

- `attachments/upload`
- `messages/edit`

### `edit_own_issue_notes`

- project_module: `issue_tracking`
- public: `False`
- require: `loggedin`
- read: `False`

- `journals/edit`
- `journals/update`

### `edit_own_issues`

- project_module: `issue_tracking`
- public: `False`
- require: (none)
- read: `False`

- `attachments/upload`
- `issues/bulk_edit`
- `issues/bulk_update`
- `issues/edit`
- `issues/update`
- `journals/new`

### `edit_own_messages`

- project_module: `boards`
- public: `False`
- require: `loggedin`
- read: `False`

- `attachments/upload`
- `messages/edit`

### `edit_own_time_entries`

- project_module: `time_tracking`
- public: `False`
- require: (none)
- read: `False`

- actions: (none)

### `edit_project`

- project_module: (none)
- public: `False`
- require: `member`
- read: `False`

- `projects/edit`
- `projects/settings`
- `projects/update`

### `edit_time_entries`

- project_module: `time_tracking`
- public: `False`
- require: (none)
- read: `False`

- actions: (none)

### `edit_wiki_pages`

- project_module: `wiki`
- public: `False`
- require: (none)
- read: `False`

- actions: (none)

### `export_wiki_pages`

- project_module: `wiki`
- public: `False`
- require: (none)
- read: `True`

- `wiki/export`

### `import_issues`

- project_module: `issue_tracking`
- public: `False`
- require: (none)
- read: `False`

- actions: (none)

### `import_time_entries`

- project_module: `time_tracking`
- public: `False`
- require: (none)
- read: `False`

- actions: (none)

### `log_time`

- project_module: `time_tracking`
- public: `False`
- require: `loggedin`
- read: `False`

- `timelog/create`
- `timelog/new`

### `log_time_for_other_users`

- project_module: `time_tracking`
- public: `False`
- require: `member`
- read: `False`

- actions: (none)

### `manage_boards`

- project_module: `boards`
- public: `False`
- require: `member`
- read: `False`

- `boards/create`
- `boards/destroy`
- `boards/edit`
- `boards/new`
- `boards/update`
- `projects/settings`

### `manage_categories`

- project_module: `issue_tracking`
- public: `False`
- require: `member`
- read: `False`

- `issue_categories/create`
- `issue_categories/destroy`
- `issue_categories/edit`
- `issue_categories/index`
- `issue_categories/new`
- `issue_categories/show`
- `issue_categories/update`
- `projects/settings`

### `manage_files`

- project_module: `files`
- public: `False`
- require: `loggedin`
- read: `False`

- `attachments/upload`
- `files/create`
- `files/new`

### `manage_issue_relations`

- project_module: `issue_tracking`
- public: `False`
- require: (none)
- read: `False`

- `issue_relations/create`
- `issue_relations/destroy`
- `issue_relations/index`
- `issue_relations/show`

### `manage_members`

- project_module: (none)
- public: `False`
- require: `member`
- read: `False`

- `members/autocomplete`
- `members/create`
- `members/destroy`
- `members/edit`
- `members/index`
- `members/new`
- `members/show`
- `members/update`
- `projects/settings`

### `manage_news`

- project_module: `news`
- public: `False`
- require: `member`
- read: `False`

- `attachments/upload`
- `comments/destroy`
- `news/create`
- `news/destroy`
- `news/edit`
- `news/new`
- `news/update`

### `manage_project_activities`

- project_module: `time_tracking`
- public: `False`
- require: (none)
- read: `False`

- actions: (none)

### `manage_public_queries`

- project_module: (none)
- public: `False`
- require: `member`
- read: `False`

- `queries/create`
- `queries/destroy`
- `queries/edit`
- `queries/new`
- `queries/update`

### `manage_related_issues`

- project_module: `repository`
- public: `False`
- require: (none)
- read: `False`

- `repositories/add_related_issue`
- `repositories/remove_related_issue`

### `manage_repository`

- project_module: `repository`
- public: `False`
- require: `member`
- read: `False`

- `projects/settings`
- `repositories/committers`
- `repositories/create`
- `repositories/destroy`
- `repositories/edit`
- `repositories/fetch_changesets`
- `repositories/new`
- `repositories/update`

### `manage_subtasks`

- project_module: `issue_tracking`
- public: `False`
- require: (none)
- read: `False`

- actions: (none)

### `manage_versions`

- project_module: (none)
- public: `False`
- require: `member`
- read: `False`

- `projects/settings`
- `versions/close_completed`
- `versions/create`
- `versions/destroy`
- `versions/edit`
- `versions/new`
- `versions/update`

### `manage_wiki`

- project_module: `wiki`
- public: `False`
- require: `member`
- read: `False`

- `wiki/rename`
- `wikis/destroy`

### `protect_wiki_pages`

- project_module: `wiki`
- public: `False`
- require: `member`
- read: `False`

- `wiki/protect`

### `rename_wiki_pages`

- project_module: `wiki`
- public: `False`
- require: `member`
- read: `False`

- `wiki/rename`

### `save_queries`

- project_module: (none)
- public: `False`
- require: `loggedin`
- read: `False`

- `queries/create`
- `queries/destroy`
- `queries/edit`
- `queries/new`
- `queries/update`

### `search_project`

- project_module: (none)
- public: `True`
- require: (none)
- read: `True`

- `search/index`

### `select_project_modules`

- project_module: (none)
- public: `False`
- require: `member`
- read: `False`

- `projects/modules`

### `select_project_publicity`

- project_module: (none)
- public: `False`
- require: `member`
- read: `False`

- actions: (none)

### `set_issues_private`

- project_module: `issue_tracking`
- public: `False`
- require: (none)
- read: `False`

- actions: (none)

### `set_notes_private`

- project_module: `issue_tracking`
- public: `False`
- require: `member`
- read: `False`

- actions: (none)

### `set_own_issues_private`

- project_module: `issue_tracking`
- public: `False`
- require: `loggedin`
- read: `False`

- actions: (none)

### `view_calendar`

- project_module: `calendar`
- public: `False`
- require: (none)
- read: `True`

- `calendars/show`
- `calendars/update`

### `view_changesets`

- project_module: `repository`
- public: `False`
- require: (none)
- read: `True`

- `repositories/revision`
- `repositories/revisions`
- `repositories/show`

### `view_documents`

- project_module: `documents`
- public: `False`
- require: (none)
- read: `True`

- `documents/download`
- `documents/index`
- `documents/show`

### `view_files`

- project_module: `files`
- public: `False`
- require: (none)
- read: `True`

- `files/index`
- `versions/download`

### `view_gantt`

- project_module: `gantt`
- public: `False`
- require: (none)
- read: `True`

- `gantts/show`
- `gantts/update`

### `view_issue_watchers`

- project_module: `issue_tracking`
- public: `False`
- require: (none)
- read: `True`

- actions: (none)

### `view_issues`

- project_module: `issue_tracking`
- public: `False`
- require: (none)
- read: `False`

- `auto_complete/issues`
- `context_menus/issues`
- `issues/index`
- `issues/issue_tab`
- `issues/show`
- `journals/diff`
- `journals/index`
- `queries/index`
- `reports/issue_report`
- `reports/issue_report_details`
- `versions/index`
- `versions/show`
- `versions/status_by`

### `view_members`

- project_module: (none)
- public: `True`
- require: (none)
- read: `True`

- `members/index`
- `members/show`

### `view_message_watchers`

- project_module: `boards`
- public: `False`
- require: (none)
- read: `True`

- actions: (none)

### `view_messages`

- project_module: `boards`
- public: `False`
- require: (none)
- read: `True`

- `boards/index`
- `boards/show`
- `messages/show`

### `view_news`

- project_module: `news`
- public: `False`
- require: (none)
- read: `True`

- `news/index`
- `news/show`

### `view_private_notes`

- project_module: `issue_tracking`
- public: `False`
- require: `member`
- read: `True`

- actions: (none)

### `view_project`

- project_module: (none)
- public: `True`
- require: (none)
- read: `True`

- `activities/index`
- `projects/bookmark`
- `projects/show`

### `view_time_entries`

- project_module: `time_tracking`
- public: `False`
- require: (none)
- read: `True`

- `timelog/index`
- `timelog/report`
- `timelog/show`

### `view_wiki_edits`

- project_module: `wiki`
- public: `False`
- require: (none)
- read: `True`

- `wiki/annotate`
- `wiki/diff`
- `wiki/history`

### `view_wiki_page_watchers`

- project_module: `wiki`
- public: `False`
- require: (none)
- read: `True`

- actions: (none)

### `view_wiki_pages`

- project_module: `wiki`
- public: `False`
- require: (none)
- read: `True`

- `auto_complete/wiki_pages`
- `wiki/date_index`
- `wiki/index`
- `wiki/show`
- `wiki/special`
