XeroAI Admin — Consolidated Admin Package

Included modules:
- login.html — restricted admin sign-in
- dashboard.html — control center / overview
- users.html — user management
- payments.html — payment review
- subscriptions.html — subscription management
- activity.html — user activity
- audit.html — admin audit log

Firebase:
- Uses the existing ../js/firebase-init.js from the main XeroAI project.
- Uses the deployed admin Firestore rules and authorized admin emails already configured.

Important:
- This package contains only the admin area.
- Do NOT replace the root dashboard.html or other normal-site files with admin/dashboard.html.
- The Python trading bot is not included and is not modified.
- Upload the contents of this admin folder into the project's existing admin/ folder.

Validation performed:
- All included JavaScript files pass Node syntax validation.
- Internal navigation targets included in this package are present.
- Dashboard navigation is connected to Users, Payments, Subscriptions, User Activity, and Audit Log.
