---
tags: [skill-creator]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

I need a page for managing API keys in our React + Vite dashboard. Backend is already there: GET /api/keys returns [{id, name, prefix, createdAt, lastUsedAt}], POST /api/keys with {name} returns the key including a one-time `secret` field, DELETE /api/keys/:id revokes it. Users need to see their keys, make a new one (and copy the secret, it's only shown once), and revoke old ones. Put everything in src/keys-page/ so I can drop it into the app.
