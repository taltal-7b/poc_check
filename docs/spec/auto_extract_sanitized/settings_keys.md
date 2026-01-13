# Settings keys (config/settings.yml)

- Source: `config\settings.yml`
- Note: parsed by a simple parser tailored for this file; types are not strictly reconstructed.

## Summary

| key | default(snippet) | format | serialized | security_notifications |
|---|---|---|---|---|
| `activity_days_default` | `10` | `int` |  |  |
| `app_title` | `(omitted)` |  |  |  |
| `attachment_extensions_allowed` |  |  |  |  |
| `attachment_extensions_denied` |  |  |  |  |
| `attachment_max_size` | `5120` | `int` |  |  |
| `autofetch_changesets` | `1` |  |  |  |
| `autologin` | `0` | `int` |  |  |
| `bulk_download_max_size` | `102400` | `int` |  |  |
| `cache_formatted_text` | `0` |  |  |  |
| `close_duplicate_issues` | `1` |  |  |  |
| `commit_cross_project_ref` | `0` |  |  |  |
| `commit_logs_encoding` | `'UTF-8'` |  |  |  |
| `commit_logs_formatting` | `1` |  |  |  |
| `commit_logtime_activity_id` | `0` | `int` |  |  |
| `commit_logtime_enabled` | `0` |  |  |  |
| `commit_ref_keywords` | `'refs,references,IssueID'` |  |  |  |
| `commit_update_keywords` | `[]` |  | `true` |  |
| `cross_project_issue_relations` | `0` |  |  |  |
| `cross_project_subtasks` | `'tree'` |  |  |  |
| `date_format` | `''` |  |  |  |
| `default_issue_query` | `''` |  |  |  |
| `default_issue_start_date_to_creation_date` | `1` |  |  |  |
| `default_language` | `en` |  |  |  |
| `default_notification_option` | `You have received this notification because you have either subscribed to it, or are involved in it. To change your noti...(187 chars)` |  |  |  |
| `default_project_query` | `''` |  |  |  |
| `default_projects_modules` | `- issue_tracking - time_tracking - news - documents - files - wiki - repository - boards - calendar - gantt` |  | `true` |  |
| `default_projects_public` | `1` |  |  |  |
| `default_projects_tracker_ids` |  |  | `true` |  |
| `default_users_hide_mail` | `1` |  |  |  |
| `default_users_no_self_notified` | `1` |  |  |  |
| `default_users_time_zone` | `""` |  |  |  |
| `diff_max_lines_displayed` | `1500` | `int` |  |  |
| `display_subprojects_issues` | `1` |  |  |  |
| `email_domains_allowed` |  |  |  |  |
| `email_domains_denied` |  |  |  |  |
| `emails_footer` | `You have received this notification because you have either subscribed to it, or are involved in it. To change your noti...(187 chars)` |  |  |  |
| `emails_header` | `You have received this notification because you have either subscribed to it, or are involved in it. To change your noti...(187 chars)` |  |  |  |
| `enabled_scm` | `- Subversion - Mercurial - Cvs - Bazaar - Git` |  | `true` | `1` |
| `feeds_limit` | `15` | `int` |  |  |
| `file_max_size_displayed` | `512` | `int` |  |  |
| `force_default_language_for_anonymous` | `0` |  |  |  |
| `force_default_language_for_loggedin` | `0` |  |  |  |
| `gantt_items_limit` | `500` | `int` |  |  |
| `gantt_months_limit` | `24` | `int` |  |  |
| `gravatar_default` | `You have received this notification because you have either subscribed to it, or are involved in it. To change your noti...(187 chars)` |  |  |  |
| `gravatar_enabled` | `You have received this notification because you have either subscribed to it, or are involved in it. To change your noti...(187 chars)` |  |  |  |
| `host_name` | `localhost:3000` |  |  |  |
| `issue_done_ratio` | `'issue_field'` |  |  |  |
| `issue_group_assignment` | `0` |  |  |  |
| `issue_list_default_columns` | `- tracker - status - priority - subject - assigned_to - updated_on` |  | `true` |  |
| `issue_list_default_totals` | `[]` |  | `true` |  |
| `issues_export_limit` | `500` | `int` |  |  |
| `jsonp_enabled` | `You have received this notification because you have either subscribed to it, or are involved in it. To change your noti...(187 chars)` |  |  | `1` |
| `link_copied_issue` | `'ask'` |  |  |  |
| `login_required` | `0` |  |  | `1` |
| `lost_password` | `1` |  |  | `1` |
| `mail_from` | `(omitted)@example.net` |  |  |  |
| `mail_handler_api_enabled` | `0` |  |  | `1` |
| `mail_handler_api_key` |  |  |  | `1` |
| `mail_handler_body_delimiters` | `''` |  |  |  |
| `mail_handler_enable_regex_delimiters` | `0` |  |  |  |
| `mail_handler_enable_regex_excluded_filenames` | `0` |  |  |  |
| `mail_handler_excluded_filenames` | `''` |  |  |  |
| `mail_handler_preferred_body_part` | `plain` |  |  |  |
| `max_additional_emails` | `5` | `int` |  |  |
| `new_item_menu_tab` | `You have received this notification because you have either subscribed to it, or are involved in it. To change your noti...(187 chars)` |  |  |  |
| `new_project_user_role_id` | `''` | `int` |  |  |
| `non_working_week_days` | `You have received this notification because you have either subscribed to it, or are involved in it. To change your noti...(187 chars)` |  | `true` |  |
| `notified_events` | `- issue_added - issue_updated` |  | `true` |  |
| `parent_issue_dates` | `'derived'` |  |  |  |
| `parent_issue_done_ratio` | `'derived'` |  |  |  |
| `parent_issue_priority` | `'derived'` |  |  |  |
| `password_max_age` | `0` | `int` |  | `1` |
| `password_min_length` | `8` | `int` |  | `1` |
| `password_required_char_classes` | `[]` |  | `true` | `1` |
| `per_page_options` | `'25,50,100'` |  |  |  |
| `plain_text_mail` | `0` |  |  |  |
| `project_list_defaults` | `column_names: - name - identifier - short_description` |  | `true` |  |
| `project_list_display_type` | `board` |  |  |  |
| `protocol` | `http` |  |  | `1` |
| `repositories_encodings` | `''` |  |  |  |
| `repository_log_display_limit` | `100` | `int` |  |  |
| `rest_api_enabled` | `You have received this notification because you have either subscribed to it, or are involved in it. To change your noti...(187 chars)` |  |  | `1` |
| `search_results_per_page` | `10` |  |  |  |
| `self_registration` | `'2'` |  |  | `1` |
| `sequential_project_identifiers` | `0` |  |  |  |
| `session_lifetime` | `0` | `int` |  | `1` |
| `session_timeout` | `0` | `int` |  | `1` |
| `show_custom_fields_on_registration` | `1` |  |  |  |
| `show_status_changes_in_mail_subject` | `You have received this notification because you have either subscribed to it, or are involved in it. To change your noti...(187 chars)` |  |  |  |
| `start_of_week` | `You have received this notification because you have either subscribed to it, or are involved in it. To change your noti...(187 chars)` |  |  |  |
| `sys_api_enabled` | `0` |  |  | `1` |
| `sys_api_key` | `''` |  |  | `1` |
| `text_formatting` | `common_mark` |  |  |  |
| `thumbnails_enabled` | `You have received this notification because you have either subscribed to it, or are involved in it. To change your noti...(187 chars)` |  |  |  |
| `thumbnails_size` | `You have received this notification because you have either subscribed to it, or are involved in it. To change your noti...(187 chars)` | `int` |  |  |
| `time_entry_list_defaults` | `column_names: - spent_on - user - activity - issue - comments - hours totalable_names: - hours` |  | `true` |  |
| `time_format` | `''` |  |  |  |
| `timelog_accept_0_hours` | `You have received this notification because you have either subscribed to it, or are involved in it. To change your noti...(187 chars)` |  |  |  |
| `timelog_accept_future_dates` | `You have received this notification because you have either subscribed to it, or are involved in it. To change your noti...(187 chars)` |  |  |  |
| `timelog_max_hours_per_day` | `You have received this notification because you have either subscribed to it, or are involved in it. To change your noti...(187 chars)` | `int` |  |  |
| `timelog_required_fields` | `You have received this notification because you have either subscribed to it, or are involved in it. To change your noti...(187 chars)` |  | `true` |  |
| `timespan_format` | `'minutes'` |  |  |  |
| `twofa` | `1` |  |  | `1` |
| `ui_theme` | `''` |  |  |  |
| `unsubscribe` | `1` |  |  |  |
| `user_format` | `:firstname_lastname` | `symbol` |  |  |
| `welcome_text` |  |  |  |  |
| `wiki_compression` | `""` |  |  |  |

## Details (default shown as YAML-ish text)

### `activity_days_default`

- format: `int`
- serialized: (none)
- security_notifications: (none)

default:

```yaml
10
```

### `app_title`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
(omitted)
```

### `attachment_extensions_allowed`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml

```

### `attachment_extensions_denied`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml

```

### `attachment_max_size`

- format: `int`
- serialized: (none)
- security_notifications: (none)

default:

```yaml
5120
```

### `autofetch_changesets`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
1
```

### `autologin`

- format: `int`
- serialized: (none)
- security_notifications: (none)

default:

```yaml
0
```

### `bulk_download_max_size`

- format: `int`
- serialized: (none)
- security_notifications: (none)

default:

```yaml
102400
```

### `cache_formatted_text`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
0
```

### `close_duplicate_issues`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
1
```

### `commit_cross_project_ref`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
0
```

### `commit_logs_encoding`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
'UTF-8'
```

### `commit_logs_formatting`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
1
```

### `commit_logtime_activity_id`

- format: `int`
- serialized: (none)
- security_notifications: (none)

default:

```yaml
0
```

### `commit_logtime_enabled`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
0
```

### `commit_ref_keywords`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
'refs,references,IssueID'
```

### `commit_update_keywords`

- format: (none)
- serialized: `true`
- security_notifications: (none)

default:

```yaml
[]
```

### `cross_project_issue_relations`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
0
```

### `cross_project_subtasks`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
'tree'
```

### `date_format`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
''
```

### `default_issue_query`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
''
```

### `default_issue_start_date_to_creation_date`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
1
```

### `default_language`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
en
```

### `default_notification_option`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
You have received this notification because you have either subscribed to it, or are involved in it.
To change your notification preferences, please click here: http://hostname/my/account
```

### `default_project_query`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
''
```

### `default_projects_modules`

- format: (none)
- serialized: `true`
- security_notifications: (none)

default:

```yaml
- issue_tracking
- time_tracking
- news
- documents
- files
- wiki
- repository
- boards
- calendar
- gantt
```

### `default_projects_public`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
1
```

### `default_projects_tracker_ids`

- format: (none)
- serialized: `true`
- security_notifications: (none)

default:

```yaml

```

### `default_users_hide_mail`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
1
```

### `default_users_no_self_notified`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
1
```

### `default_users_time_zone`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
""
```

### `diff_max_lines_displayed`

- format: `int`
- serialized: (none)
- security_notifications: (none)

default:

```yaml
1500
```

### `display_subprojects_issues`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
1
```

### `email_domains_allowed`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml

```

### `email_domains_denied`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml

```

### `emails_footer`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
You have received this notification because you have either subscribed to it, or are involved in it.
To change your notification preferences, please click here: http://hostname/my/account
```

### `emails_header`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
You have received this notification because you have either subscribed to it, or are involved in it.
To change your notification preferences, please click here: http://hostname/my/account
```

### `enabled_scm`

- format: (none)
- serialized: `true`
- security_notifications: `1`

default:

```yaml
- Subversion
- Mercurial
- Cvs
- Bazaar
- Git
```

### `feeds_limit`

- format: `int`
- serialized: (none)
- security_notifications: (none)

default:

```yaml
15
```

### `file_max_size_displayed`

- format: `int`
- serialized: (none)
- security_notifications: (none)

default:

```yaml
512
```

### `force_default_language_for_anonymous`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
0
```

### `force_default_language_for_loggedin`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
0
```

### `gantt_items_limit`

- format: `int`
- serialized: (none)
- security_notifications: (none)

default:

```yaml
500
```

### `gantt_months_limit`

- format: `int`
- serialized: (none)
- security_notifications: (none)

default:

```yaml
24
```

### `gravatar_default`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
You have received this notification because you have either subscribed to it, or are involved in it.
To change your notification preferences, please click here: http://hostname/my/account
```

### `gravatar_enabled`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
You have received this notification because you have either subscribed to it, or are involved in it.
To change your notification preferences, please click here: http://hostname/my/account
```

### `host_name`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
localhost:3000
```

### `issue_done_ratio`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
'issue_field'
```

### `issue_group_assignment`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
0
```

### `issue_list_default_columns`

- format: (none)
- serialized: `true`
- security_notifications: (none)

default:

```yaml
- tracker
- status
- priority
- subject
- assigned_to
- updated_on
```

### `issue_list_default_totals`

- format: (none)
- serialized: `true`
- security_notifications: (none)

default:

```yaml
[]
```

### `issues_export_limit`

- format: `int`
- serialized: (none)
- security_notifications: (none)

default:

```yaml
500
```

### `jsonp_enabled`

- format: (none)
- serialized: (none)
- security_notifications: `1`

default:

```yaml
You have received this notification because you have either subscribed to it, or are involved in it.
To change your notification preferences, please click here: http://hostname/my/account
```

### `link_copied_issue`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
'ask'
```

### `login_required`

- format: (none)
- serialized: (none)
- security_notifications: `1`

default:

```yaml
0
```

### `lost_password`

- format: (none)
- serialized: (none)
- security_notifications: `1`

default:

```yaml
1
```

### `mail_from`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
(omitted)@example.net
```

### `mail_handler_api_enabled`

- format: (none)
- serialized: (none)
- security_notifications: `1`

default:

```yaml
0
```

### `mail_handler_api_key`

- format: (none)
- serialized: (none)
- security_notifications: `1`

default:

```yaml

```

### `mail_handler_body_delimiters`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
''
```

### `mail_handler_enable_regex_delimiters`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
0
```

### `mail_handler_enable_regex_excluded_filenames`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
0
```

### `mail_handler_excluded_filenames`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
''
```

### `mail_handler_preferred_body_part`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
plain
```

### `max_additional_emails`

- format: `int`
- serialized: (none)
- security_notifications: (none)

default:

```yaml
5
```

### `new_item_menu_tab`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
You have received this notification because you have either subscribed to it, or are involved in it.
To change your notification preferences, please click here: http://hostname/my/account
```

### `new_project_user_role_id`

- format: `int`
- serialized: (none)
- security_notifications: (none)

default:

```yaml
''
```

### `non_working_week_days`

- format: (none)
- serialized: `true`
- security_notifications: (none)

default:

```yaml
You have received this notification because you have either subscribed to it, or are involved in it.
To change your notification preferences, please click here: http://hostname/my/account
```

### `notified_events`

- format: (none)
- serialized: `true`
- security_notifications: (none)

default:

```yaml
- issue_added
- issue_updated
```

### `parent_issue_dates`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
'derived'
```

### `parent_issue_done_ratio`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
'derived'
```

### `parent_issue_priority`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
'derived'
```

### `password_max_age`

- format: `int`
- serialized: (none)
- security_notifications: `1`

default:

```yaml
0
```

### `password_min_length`

- format: `int`
- serialized: (none)
- security_notifications: `1`

default:

```yaml
8
```

### `password_required_char_classes`

- format: (none)
- serialized: `true`
- security_notifications: `1`

default:

```yaml
[]
```

### `per_page_options`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
'25,50,100'
```

### `plain_text_mail`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
0
```

### `project_list_defaults`

- format: (none)
- serialized: `true`
- security_notifications: (none)

default:

```yaml
column_names:
- name
- identifier
- short_description
```

### `project_list_display_type`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
board
```

### `protocol`

- format: (none)
- serialized: (none)
- security_notifications: `1`

default:

```yaml
http
```

### `repositories_encodings`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
''
```

### `repository_log_display_limit`

- format: `int`
- serialized: (none)
- security_notifications: (none)

default:

```yaml
100
```

### `rest_api_enabled`

- format: (none)
- serialized: (none)
- security_notifications: `1`

default:

```yaml
You have received this notification because you have either subscribed to it, or are involved in it.
To change your notification preferences, please click here: http://hostname/my/account
```

### `search_results_per_page`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
10
```

### `self_registration`

- format: (none)
- serialized: (none)
- security_notifications: `1`

default:

```yaml
'2'
```

### `sequential_project_identifiers`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
0
```

### `session_lifetime`

- format: `int`
- serialized: (none)
- security_notifications: `1`

default:

```yaml
0
```

### `session_timeout`

- format: `int`
- serialized: (none)
- security_notifications: `1`

default:

```yaml
0
```

### `show_custom_fields_on_registration`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
1
```

### `show_status_changes_in_mail_subject`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
You have received this notification because you have either subscribed to it, or are involved in it.
To change your notification preferences, please click here: http://hostname/my/account
```

### `start_of_week`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
You have received this notification because you have either subscribed to it, or are involved in it.
To change your notification preferences, please click here: http://hostname/my/account
```

### `sys_api_enabled`

- format: (none)
- serialized: (none)
- security_notifications: `1`

default:

```yaml
0
```

### `sys_api_key`

- format: (none)
- serialized: (none)
- security_notifications: `1`

default:

```yaml
''
```

### `text_formatting`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
common_mark
```

### `thumbnails_enabled`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
You have received this notification because you have either subscribed to it, or are involved in it.
To change your notification preferences, please click here: http://hostname/my/account
```

### `thumbnails_size`

- format: `int`
- serialized: (none)
- security_notifications: (none)

default:

```yaml
You have received this notification because you have either subscribed to it, or are involved in it.
To change your notification preferences, please click here: http://hostname/my/account
```

### `time_entry_list_defaults`

- format: (none)
- serialized: `true`
- security_notifications: (none)

default:

```yaml
column_names:
- spent_on
- user
- activity
- issue
- comments
- hours
totalable_names:
- hours
```

### `time_format`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
''
```

### `timelog_accept_0_hours`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
You have received this notification because you have either subscribed to it, or are involved in it.
To change your notification preferences, please click here: http://hostname/my/account
```

### `timelog_accept_future_dates`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
You have received this notification because you have either subscribed to it, or are involved in it.
To change your notification preferences, please click here: http://hostname/my/account
```

### `timelog_max_hours_per_day`

- format: `int`
- serialized: (none)
- security_notifications: (none)

default:

```yaml
You have received this notification because you have either subscribed to it, or are involved in it.
To change your notification preferences, please click here: http://hostname/my/account
```

### `timelog_required_fields`

- format: (none)
- serialized: `true`
- security_notifications: (none)

default:

```yaml
You have received this notification because you have either subscribed to it, or are involved in it.
To change your notification preferences, please click here: http://hostname/my/account
```

### `timespan_format`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
'minutes'
```

### `twofa`

- format: (none)
- serialized: (none)
- security_notifications: `1`

default:

```yaml
1
```

### `ui_theme`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
''
```

### `unsubscribe`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
1
```

### `user_format`

- format: `symbol`
- serialized: (none)
- security_notifications: (none)

default:

```yaml
:firstname_lastname
```

### `welcome_text`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml

```

### `wiki_compression`

- format: (none)
- serialized: (none)
- security_notifications: (none)

default:

```yaml
""
```
