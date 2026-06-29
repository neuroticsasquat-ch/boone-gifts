## [0.3.0] - 2026-06-29

### 🚀 Features

- *(register)* Support family invite links and auto-login on registration (NEU-346) (#100)
- *(api)* Add families API client and types (NEU-347) (#103)
- *(families)* Add family detail page with invite UI (NEU-349)
- *(families)* Restore reverted frontend family UI (NEU-346, NEU-347) (#113)
- *(families)* Implement Families management page (NEU-348) (#114)
- *(families)* Add invite send/revoke UI to FamilyDetail (NEU-349) (#116)
- *(families)* Add Family Lists view (NEU-351) (#118)
- *(families)* Add pending family invite acceptance UI and badge (NEU-350) (#117)
- Nav branching + account-settings toggle (NEU-354) (#119)

### 🐛 Bug Fixes

- Show server error message when list deletion is blocked (#78)
- Prevent iOS Safari auto-zoom on input focus
- Disable autocorrect, autocapitalize, and spellcheck globally
- Apply autocorrect/autocapitalize/spellcheck directly on inputs
- Stack name and email vertically in connection search dropdown
- *(ci)* Merge main into dependency branch via PR instead of force-push
- Align Sentry browser SDK config and stop source-map leak (NEU-426)
- *(families)* Remove dead back-link, fix per-invite revoke pending state (NEU-349)
- *(families)* Address review findings — tsc errors, query key, onMutate (NEU-349)

### 📚 Documentation

- *(claude-md)* Document family-groups + simple-mode UI (NEU-357) (#120)

### 🧪 Testing

- *(families)* Add FamilyDetail invite UI tests (NEU-349)

### ⚙️ Miscellaneous Tasks

- Set specs_dir to docs so loop/implementit find specs+plans (NEU-348) (#115)

### ◀️ Revert

- Restore tree to last known good state before bad commits
## [0.2.1] - 2026-05-25

### 🚀 Features

- Registration form, typeahead connections, loading states, user delete

### 🐛 Bug Fixes

- Move setState out of effect body to satisfy eslint rule
## [0.2.0] - 2026-05-25

### 🚀 Features

- Add AdminRoute guard and /admin route prefix (NEU-231) (#60)
- Add admin invites management page (NEU-233) (#61)
- Add admin users management page (NEU-235) (#62)
- Add toast notifications, empty states, and loading spinners (NEU-227, NEU-226, NEU-228) (#63)
- Add archive UI for lists and collections (NEU-244) (#65)
- Add notification badges for connection requests and new shared lists (NEU-237, NEU-238) (#66)
- Friendlier claim language, unclaim confirmation, claim progress, collections explainer (NEU-241) (#67)
- Add connection profile page with clickable names (NEU-245) (#68)
- Sort/filter controls and add-to-collection (NEU-246, NEU-247) (#69)
- Refactor list detail into tabbed layout with file decomposition (NEU-248) (#70)
- Edit display name on Account page + shopping list on collection detail (NEU-252, NEU-254) (#72)

### 🐛 Bug Fixes

- Mobile responsiveness — compact cards, stack forms, add nav links (NEU-225) (#64)
- Distinct visual states for gift claim status (#71)
## [0.1.0] - 2026-05-23

### 🚀 Features

- *(auth)* Forgot/reset password pages (NEU-215) (#48)
- *(auth)* Account settings page with change-password form (NEU-214) (#49)
- Sentry React integration (NEU-230) (#52)

### ⚙️ Miscellaneous Tasks

- Migrate deployment off Azure to Cloudflare Pages (#45)
