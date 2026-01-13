# Permission checks (static extract)

- Targets: `app/controllers/**/*.rb`, `app/models/**/*.rb`, `lib/**/*.rb`
- Patterns: `allowed_to?`, `authorize`, `require_admin`, `deny_access`, `render_403`, `allows_to?`

## Summary

| pattern | files | hits |
|---|---:|---:|
| `allowed_to?` | 37 | 118 |
| `authorize` | 24 | 29 |
| `require_admin` | 17 | 17 |
| `deny_access` | 5 | 11 |
| `render_403` | 10 | 24 |
| `allows_to?` | 4 | 7 |

## `allowed_to?`

### `app\controllers\application_controller.rb` (2)

- `313`: `allowed = User.current.allowed_to?({:controller => ctrl, :action => action}, @project || @projects, :global => global)`
- `468`: `if @project && @project.id && User.current.logged? && User.current.allowed_to?(:view_project, @project)`

### `app\controllers\auto_completes_controller.rb` (1)

- `48`: `if wiki.nil? || !User.current.allowed_to?(:view_wiki_pages, @project)`

### `app\controllers\context_menus_controller.rb` (4)

- `36`: `:log_time => (@project && User.current.allowed_to?(:log_time, @project)),`
- `37`: `:copy => User.current.allowed_to?(:copy_issues, @projects) && Issue.allowed_target_projects.any?,`
- `38`: `:add_watchers => User.current.allowed_to?(:add_issue_watchers, @projects),`
- `40`: `:add_subtask => @issue && !@issue.closed? && User.current.allowed_to?(:manage_subtasks, @project)`

### `app\controllers\issues_controller.rb` (12)

- `64`: `if User.current.allowed_to?(:view_time_entries, nil, :global => true)`
- `105`: `if User.current.allowed_to?(:view_time_entries, @project)`
- `146`: `unless User.current.allowed_to?(:add_issues, @issue.project, :global => true)`
- `213`: `unless User.current.allowed_to?(:view_private_notes, @issue.project)`
- `263`: `unless User.current.allowed_to?(:copy_issues, @projects)`
- `332`: `@watchers_present = User.current.allowed_to?(:add_issue_watchers, @projects) &&`
- `353`: `unless User.current.allowed_to?(:copy_issues, @projects)`
- `361`: `unless User.current.allowed_to?(:add_issues, target_projects)`
- `365`: `unless User.current.allowed_to?(:add_issue_watchers, @projects)`
- `589`: `unless User.current.allowed_to?(:copy_issues, @copy_from.project)`
- `596`: `@copy_watchers = User.current.allowed_to?(:add_issue_watchers, @project)`
- `655`: `User.current.allowed_to?(:log_time, @issue.project)`

### `app\controllers\news_controller.rb` (1)

- `75`: `raise ::Unauthorized unless User.current.allowed_to?(:manage_news, @project, :global => true)`

### `app\controllers\queries_controller.rb` (2)

- `99`: `unless User.current.allowed_to?(q.class.view_permission, q.project, :global => true)`
- `138`: `if User.current.allowed_to?(:manage_public_queries, @query.project) || User.current.admin?`

### `app\controllers\search_controller.rb` (1)

- `65`: `@object_types = @object_types.select {|o| User.current.allowed_to?("view_#{o}".to_sym, projects_to_search)}`

### `app\controllers\timelog_controller.rb` (1)

- `111`: `if @time_entry.project && !User.current.allowed_to?(:log_time, @time_entry.project)`

### `app\controllers\watchers_controller.rb` (1)

- `239`: `if @watchables.any?{|watchable| !User.current.allowed_to?(:"#{action}_#{watchable.class.name.underscore}_watchers", watchable.project)}`

### `app\controllers\wiki_controller.rb` (5)

- `67`: `unless User.current.allowed_to?(:edit_wiki_pages, @project)`
- `86`: `if params[:version] && !User.current.allowed_to?(:view_wiki_edits, @project)`
- `92`: `if params[:version].blank? && User.current.allowed_to?(:edit_wiki_pages, @project) && editable? && !api_request?`
- `103`: `if User.current.allowed_to?(:export_wiki_pages, @project)`
- `117`: `@sections_editable = @editable && User.current.allowed_to?(:edit_wiki_pages, @page.project) &&`

### `app\models\board.rb` (1)

- `42`: `!user.nil? && user.allowed_to?(:view_messages, project)`

### `app\models\document.rb` (1)

- `56`: `!user.nil? && user.allowed_to?(:view_documents, project)`

### `app\models\issue.rb` (8)

- `169`: `(usr || User.current).allowed_to?(:view_issues, self.project) do |role, user|`
- `513`: `:if => lambda {|issue, user| !issue.new_record? && user.allowed_to?(:set_notes_private, issue.project)})`
- `516`: `:if => lambda {|issue, user| issue.new_record? && user.allowed_to?(:add_issue_watchers, issue.project)})`
- `520`: `user.allowed_to?(:set_issues_private, issue.project) ||`
- `521`: `(issue.author_id == user.id && user.allowed_to?(:set_own_issues_private, issue.project))`
- `527`: `user.allowed_to?(:manage_subtasks, issue.project)`
- `919`: `unless user.allowed_to?(:view_private_notes, project)`
- `2055`: `author&.allowed_to?(:add_issue_watchers, project) &&`

### `app\models\issue_import.rb` (3)

- `53`: `user.allowed_to?(:import_issues, nil, :global => true) && user.allowed_to?(:add_issues, nil, :global => true)`
- `88`: `user.allowed_to?(:manage_categories, project) &&`
- `94`: `user.allowed_to?(:manage_versions, project) &&`

### `app\models\issue_query.rb` (6)

- `210`: `if User.current.allowed_to?(:view_time_entries, project, :global => true)`
- `216`: `if User.current.allowed_to?(:set_issues_private, nil, :global => true) ||`
- `217`: `User.current.allowed_to?(:set_own_issues_private, nil, :global => true)`
- `288`: `if User.current.allowed_to?(:view_time_entries, project, :global => true)`
- `321`: `if User.current.allowed_to?(:set_issues_private, nil, :global => true) ||`
- `322`: `User.current.allowed_to?(:set_own_issues_private, nil, :global => true)`

### `app\models\issue_relation.rb` (2)

- `109`: `((issue_from.nil? || user.allowed_to?(:manage_issue_relations, issue_from.project)) ||`
- `110`: `(issue_to.nil? || user.allowed_to?(:manage_issue_relations, issue_to.project)))`

### `app\models\journal.rb` (5)

- `81`: `:if => lambda {|journal, user| user.allowed_to?(:set_notes_private, journal.project)})`
- `137`: `usr && usr.logged? && (usr.allowed_to?(:edit_issue_notes, project) || (self.user == usr && usr.allowed_to?(:edit_own_issue_notes, project)))`
- `173`: `notified = notified.select {|user| user.allowed_to?(:view_private_notes, journalized.project)}`
- `340`: `user&.allowed_to?(:add_issue_watchers, project) &&`
- `363`: `notified = notified.select {|user| user.allowed_to?(:view_private_notes, journalized.project)}`

### `app\models\mail_handler.rb` (3)

- `198`: `raise InsufficientPermissions, "not allowed to add issues to project [#{project.name}]" unless user.allowed_to?(:add_issues, project)`
- `293`: `raise InsufficientPermissions, "not allowed to add messages to project [#{message.project.name}]" unless user.allowed_to?(:add_messages, message.project)`
- `379`: `if handler_options[:no_permission_check] || user.allowed_to?("add_#{obj.class.name.underscore}_watchers".to_sym, obj.project)`

### `app\models\mailer.rb` (1)

- `199`: `users = container.project.notified_users.select {|user| user.allowed_to?(:view_files, container.project)}`

### `app\models\message.rb` (4)

- `73`: `user.allowed_to?(:edit_messages, message.project)`
- `77`: `!user.nil? && user.allowed_to?(:view_messages, project)`
- `113`: `usr && usr.logged? && (usr.allowed_to?(:edit_messages, project) || (self.author == usr && usr.allowed_to?(:edit_own_messages, project)))`
- `117`: `usr && usr.logged? && (usr.allowed_to?(:delete_messages, project) || (self.author == usr && usr.allowed_to?(:delete_own_messages, project)))`

### `app\models\news.rb` (3)

- `50`: `!user.nil? && user.allowed_to?(:view_news, project)`
- `55`: `user.allowed_to?(:comment_news, project)`
- `59`: `project.users.select {|user| user.notify_about?(self) && user.allowed_to?(:view_news, project)}`

### `app\models\project.rb` (7)

- `162`: `user.allowed_to?(:view_project, self)`
- `208`: `if role.allowed_to?(permission)`
- `222`: `if role.allowed_to?(permission) && project_ids.any?`
- `452`: `if user.allowed_to?(:add_project, nil, :global => true) || (!new_record? && parent.nil?)`
- `773`: `user.allowed_to?(:delete_project, self) && leaf?`
- `852`: `user.allowed_to?(:select_project_publicity, project)`
- `868`: `user.allowed_to?(:select_project_modules, project)`

### `app\models\query.rb` (3)

- `405`: `return false unless project.nil? || user.allowed_to?(self.class.view_permission, project)`
- `535`: `is_public? && !is_global? && user.allowed_to?(:manage_public_queries, project)`
- `661`: `if User.current.allowed_to?(:view_issue_watchers, self.project, global: true)`

### `app\models\role.rb` (1)

- `201`: `def allowed_to?(action)`

### `app\models\time_entry.rb` (6)

- `96`: `(user || User.current).allowed_to?(:view_time_entries, self.project) do |role, user|`
- `119`: `if issue.visible?(user) && user.allowed_to?(:log_time, issue.project)`
- `124`: `elsif user.allowed_to?(:log_time, issue.project) && issue.assigned_to_id_changed? && issue.previous_assignee == User.current`
- `135`: `if user_id_changed? && user_id != author_id && !user.allowed_to?(:log_time_for_other_users, project)`
- `212`: `(usr == user && usr.allowed_to?(:edit_own_time_entries, project)) || usr.allowed_to?(:edit_time_entries, project)`
- `237`: `users = users.map(&:user).select{|u| u.allowed_to?(:log_time, project)}`

### `app\models\time_entry_import.rb` (3)

- `35`: `user.allowed_to?(:import_time_entries, nil, :global => true) && user.allowed_to?(:log_time, nil, :global => true)`
- `59`: `users = users.map(&:user).select{|u| u.allowed_to?(:log_time, project)}`
- `97`: `if user.allowed_to?(:log_time_for_other_users, project)`

### `app\models\user.rb` (7)

- `740`: `def allowed_to?(action, context, options={}, &block)`
- `751`: `role.allowed_to?(action) &&`
- `759`: `context.map {|project| allowed_to?(action, project, options, &block)}.reduce(:&)`
- `762`: `raise ArgumentError.new("#allowed_to? context argument must be a Project, an Array of projects or nil")`
- `770`: `role.allowed_to?(action) &&`
- `785`: `allowed_to?(action, nil, options.reverse_merge(:global => true), &block)`
- `789`: `allowed_to?(:view_time_entries, context) do |role, user|`

### `app\models\version.rb` (2)

- `190`: `user.allowed_to?(:view_issues, self.project)`
- `378`: `project.nil? || user.allowed_to?(:manage_versions, project.root)`

### `app\models\wiki.rb` (1)

- `37`: `!user.nil? && user.allowed_to?(:view_wiki_pages, project)`

### `app\models\wiki_page.rb` (5)

- `72`: `:if => lambda {|page, user| page.new_record? || user.allowed_to?(:rename_wiki_pages, page.project)}`
- `75`: `:if => lambda {|page, user| user.allowed_to?(:manage_wiki, page.project)}`
- `88`: `!user.nil? && user.allowed_to?(:view_wiki_pages, project)`
- `106`: `if (w = Wiki.find_by_id(w_id)) && w.project && user.allowed_to?(:rename_wiki_pages, w.project)`
- `209`: `!protected? || usr.allowed_to?(:protect_wiki_pages, wiki.project)`

### `lib\plugins\acts_as_attachable\lib\acts_as_attachable.rb` (3)

- `75`: `user.allowed_to?(self.class.attachable_options[:view_permission], self.project)`
- `80`: `user.allowed_to?(self.class.attachable_options[:edit_permission], self.project)`
- `85`: `user.allowed_to?(self.class.attachable_options[:delete_permission], self.project)`

### `lib\plugins\acts_as_watchable\lib\acts_as_watchable.rb` (1)

- `48`: `if user.allowed_to?(:"view_#{self.class.name.underscore}_watchers", project)`

### `lib\(omitted)\activity\fetcher.rb` (1)

- `51`: `keep |= projects.any? {|p| @user.allowed_to?(permission, p)}`

### `lib\(omitted)\export\pdf\issues_pdf_helper.rb` (2)

- `61`: `right << [l(:label_spent_time), l_hours(issue.total_spent_hours)] if User.current.allowed_to?(:view_time_entries, issue.project)`
- `190`: `User.current.allowed_to?(:view_changesets, issue.project)`

### `lib\(omitted)\menu_manager.rb` (2)

- `498`: `unless user.allowed_to?(permission, project)`
- `502`: `unless user.allowed_to?(url, project)`

### `lib\(omitted)\preparation.rb` (5)

- `195`: `User.current.allowed_to?(:view_issues, nil, :global => true) &&`
- `205`: `User.current.allowed_to?(:view_time_entries, nil, :global => true) &&`
- `216`: `User.current.allowed_to?(:view_gantt, nil, :global => true) &&`
- `226`: `User.current.allowed_to?(:view_calendar, nil, :global => true) &&`
- `235`: `User.current.allowed_to?(:view_news, nil, :global => true) &&`

### `lib\(omitted)\wiki_formatting\macros.rb` (2)

- `210`: `raise t(:error_page_not_found) if page.nil? || !User.current.allowed_to?(:view_wiki_pages, page.wiki.project)`
- `221`: `raise t(:error_page_not_found) if page.nil? || !User.current.allowed_to?(:view_wiki_pages, page.wiki.project)`

## `authorize`

### `app\controllers\activities_controller.rb` (1)

- `22`: `before_action :find_optional_project_by_id, :authorize_global`

### `app\controllers\application_controller.rb` (4)

- `312`: `def authorize(ctrl = params[:controller], action = params[:action], global = false)`
- `330`: `def authorize_global(ctrl = params[:controller], action = params[:action], global = true)`
- `331`: `authorize(ctrl, action, global)`
- `359`: `authorize_global`

### `app\controllers\attachments_controller.rb` (1)

- `30`: `before_action :authorize_global, :only => :upload`

### `app\controllers\boards_controller.rb` (1)

- `22`: `before_action :find_project_by_project_id, :find_board_if_available, :authorize`

### `app\controllers\comments_controller.rb` (1)

- `25`: `before_action :authorize`

### `app\controllers\documents_controller.rb` (1)

- `26`: `before_action :authorize`

### `app\controllers\files_controller.rb` (1)

- `24`: `before_action :authorize`

### `app\controllers\issue_categories_controller.rb` (1)

- `26`: `before_action :authorize`

### `app\controllers\issue_relations_controller.rb` (1)

- `23`: `before_action :find_issue, :authorize, :only => [:index, :create]`

### `app\controllers\issues_controller.rb` (1)

- `25`: `before_action :authorize, :except => [:index, :new, :create]`

### `app\controllers\journals_controller.rb` (1)

- `24`: `before_action :authorize, :only => [:new, :edit, :update, :diff]`

### `app\controllers\members_controller.rb` (1)

- `25`: `before_action :authorize`

### `app\controllers\messages_controller.rb` (1)

- `26`: `before_action :authorize, :except => [:preview, :edit, :destroy]`

### `app\controllers\news_controller.rb` (1)

- `26`: `before_action :authorize, :except => [:index, :new]`

### `app\controllers\project_enumerations_controller.rb` (1)

- `22`: `before_action :authorize`

### `app\controllers\projects_controller.rb` (2)

- `27`: `before_action :authorize,`
- `31`: `before_action :authorize_global, :only => [:new, :create]`

### `app\controllers\reports_controller.rb` (1)

- `22`: `before_action :find_project, :authorize, :find_issue_statuses`

### `app\controllers\repositories_controller.rb` (1)

- `36`: `before_action :authorize`

### `app\controllers\search_controller.rb` (1)

- `21`: `before_action :find_optional_project_by_id, :authorize_global`

### `app\controllers\timelog_controller.rb` (2)

- `26`: `before_action :authorize, :only => [:show, :edit, :update, :bulk_edit, :bulk_update, :destroy]`
- `294`: `authorize`

### `app\controllers\versions_controller.rb` (1)

- `26`: `before_action :authorize`

### `app\controllers\watchers_controller.rb` (1)

- `31`: `before_action :find_project, :authorize, :only => [:new, :create, :append, :destroy, :autocomplete_for_user, :autocomplete_for_mention]`

### `app\controllers\wiki_controller.rb` (1)

- `36`: `before_action :find_wiki, :authorize`

### `app\controllers\wikis_controller.rb` (1)

- `22`: `before_action :find_project, :authorize`

## `require_admin`

### `app\controllers\admin_controller.rb` (1)

- `27`: `before_action :require_admin`

### `app\controllers\application_controller.rb` (1)

- `297`: `def require_admin`

### `app\controllers\auth_sources_controller.rb` (1)

- `25`: `before_action :require_admin`

### `app\controllers\custom_field_enumerations_controller.rb` (1)

- `24`: `before_action :require_admin`

### `app\controllers\custom_fields_controller.rb` (1)

- `24`: `before_action :require_admin`

### `app\controllers\email_addresses_controller.rb` (1)

- `103`: `require_admin`

### `app\controllers\enumerations_controller.rb` (1)

- `24`: `before_action :require_admin, :except => :index`

### `app\controllers\groups_controller.rb` (1)

- `24`: `before_action :require_admin, :except => [:show]`

### `app\controllers\issue_statuses_controller.rb` (1)

- `24`: `before_action :require_admin, :except => :index`

### `app\controllers\principal_memberships_controller.rb` (1)

- `26`: `before_action :require_admin`

### `app\controllers\projects_controller.rb` (1)

- `32`: `before_action :require_admin, :only => [:copy, :archive, :unarchive, :bulk_destroy]`

### `app\controllers\roles_controller.rb` (1)

- `24`: `before_action :require_admin, :except => [:index, :show]`

### `app\controllers\settings_controller.rb` (1)

- `27`: `before_action :require_admin`

### `app\controllers\trackers_controller.rb` (1)

- `24`: `before_action :require_admin, :except => :index`

### `app\controllers\twofa_controller.rb` (1)

- `26`: `before_action :require_admin, only: :admin_deactivate`

### `app\controllers\users_controller.rb` (1)

- `24`: `before_action :require_admin, :except => :show`

### `app\controllers\workflows_controller.rb` (1)

- `25`: `before_action :require_admin`

## `deny_access`

### `app\controllers\account_controller.rb` (1)

- `275`: `Setting.twofa? ? true : deny_access`

### `app\controllers\application_controller.rb` (5)

- `65`: `rescue_from ::Unauthorized, :with => :deny_access`
- `307`: `def deny_access`
- `324`: `deny_access`
- `458`: `deny_access`
- `610`: `deny_access`

### `app\controllers\attachments_controller.rb` (3)

- `275`: `@attachment.visible? ? true : deny_access`
- `279`: `@attachment.editable? ? true : deny_access`
- `283`: `@attachment.deletable? ? true : deny_access`

### `app\controllers\projects_controller.rb` (1)

- `297`: `deny_access`

### `app\controllers\wiki_controller.rb` (1)

- `87`: `deny_access`

## `render_403`

### `app\controllers\application_controller.rb` (5)

- `301`: `render_403`
- `308`: `User.current.logged? ? render_403 : require_login`
- `319`: `render_403 :message => :notice_not_authorized_archived_project`
- `322`: `render_403`
- `566`: `def render_403(options={})`

### `app\controllers\attachments_controller.rb` (1)

- `226`: `render_403`

### `app\controllers\imports_controller.rb` (1)

- `153`: `return render_403 unless import_type.authorized?(User.current)`

### `app\controllers\journals_controller.rb` (2)

- `85`: `(render_403; return false) unless @journal.editable_by?(User.current)`
- `93`: `(render_403; return false) unless @journal.editable_by?(User.current)`

### `app\controllers\messages_controller.rb` (2)

- `92`: `(render_403; return false) unless @message.editable_by?(User.current)`
- `107`: `(render_403; return false) unless @message.destroyable_by?(User.current)`

### `app\controllers\queries_controller.rb` (1)

- `127`: `render_403 unless @query.editable_by?(User.current)`

### `app\controllers\timelog_controller.rb` (2)

- `112`: `render_403`
- `271`: `render_403`

### `app\controllers\twofa_controller.rb` (1)

- `92`: `render_403`

### `app\controllers\watchers_controller.rb` (1)

- `240`: `render_403`

### `app\controllers\wiki_controller.rb` (8)

- `68`: `render_403`
- `129`: `return render_403 unless editable?`
- `157`: `return render_403 unless editable?`
- `219`: `return render_403 unless editable?`
- `265`: `return render_403 unless editable?`
- `300`: `return render_403 unless editable?`
- `329`: `return render_403 unless page.nil? || editable?(page)`
- `340`: `return render_403 unless editable?`

## `allows_to?`

### `app\controllers\application_controller.rb` (1)

- `320`: `elsif @project && !@project.allows_to?(:controller => ctrl, :action => action)`

### `app\models\mail_handler.rb` (4)

- `194`: `raise NotAllowedInProject, "not possible to add issues to project [#{project.name}]" unless project.allows_to?(:add_issues)`
- `238`: `raise NotAllowedInProject, "not possible to add notes to project [#{project.name}]" unless project.allows_to?(:add_issue_notes)`
- `290`: `raise NotAllowedInProject, "not possible to add messages to project [#{project.name}]" unless project.allows_to?(:add_messages)`
- `318`: `raise NotAllowedInProject, "not possible to add news comments to project [#{project.name}]" unless project.allows_to?(:comment_news)`

### `app\models\project.rb` (1)

- `751`: `def allows_to?(action)`

### `app\models\user.rb` (1)

- `742`: `return false unless context.allows_to?(action)`
