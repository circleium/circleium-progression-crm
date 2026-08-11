CIRCLEIUM PROGRESSION CRM — TEST MODE

WHAT THIS PACKAGE IS
A real database-backed test version of the Circleium Progression CRM.
It replaces browser localStorage with Supabase Postgres + Supabase Auth.

FILES
index.html              Partner/Admin CRM
progression.html        Public member Progression Registration form
set-password.html       Partner invite password setup
config.js               Supabase public project settings
app.js                  CRM application logic
progression.js          Member submission logic
supabase-schema.sql     Database, security and workflow functions
netlify/functions/...   Secure Partner invitation function
netlify.toml            Netlify configuration

SETUP — DO THESE IN ORDER

1. CREATE A FREE SUPABASE PROJECT
   Go to Supabase and create a new project.

2. RUN THE DATABASE SCRIPT
   Supabase Dashboard > SQL Editor > New query.
   Paste the complete contents of supabase-schema.sql and Run.

3. CREATE YOUR ADMIN LOGIN
   Supabase Dashboard > Authentication > Users > Add user.
   Create your own email/password account.
   Copy the user's UUID.

   In SQL Editor run:
   insert into public.profiles(id,full_name,role)
   values ('PASTE-YOUR-USER-UUID','David Hinton','admin');

4. GET THE PUBLIC PROJECT SETTINGS
   Supabase Dashboard > Project Settings/API.
   Copy:
   - Project URL
   - Publishable key (safe for browser use)

   Open config.js and paste those two values.

   NEVER place a Supabase secret/service-role key in config.js.

5. AUTH URL SETTINGS
   Supabase > Authentication > URL Configuration.
   Set Site URL to your Netlify test site URL when known.
   Add the Netlify URL plus /set-password.html as an allowed redirect URL.

6. DEPLOY TO NETLIFY
   Deploy this whole folder as a site (Git-based deploy recommended because
   the Partner invitation function has an npm dependency).

7. ADD NETLIFY ENVIRONMENT VARIABLES
   In Netlify Project configuration > Environment variables add:
   SUPABASE_URL          = your Supabase project URL
   SUPABASE_SECRET_KEY   = your Supabase secret key
   (Legacy projects may expose a service_role key instead; if so you may set
    SUPABASE_SERVICE_ROLE_KEY. Keep either value server-side only.)

8. TEST
   /index.html          sign in as Admin
   /progression.html    submit a test member progression
   Admin > Partners     invite a test Partner
   Partner follows invite, sets password, signs in
   Confirm routing, Global Register, My Member Progressions, Partner Groups
   and Request Link-Up.

SECURITY NOTES
- Partner passwords are managed by Supabase Auth, not stored by Circleium.
- The browser uses only the publishable key.
- Secret/service-role credentials exist only in the Netlify function.
- Full progression records are restricted to the assigned Partner and Admin.
- The global register is returned by a restricted SQL function with no email
  or private/internal fields.
- Member submissions use a controlled RPC rather than direct anonymous table access.

BEFORE REAL LIVE MEMBER DATA
This package is intended for proper test mode. Before using it as the sole live
operational system, add production backups, privacy documentation, spam/rate
protection on the public submission form, a fuller audit log, and complete the
UK Circleium county/area mapping.
