# Spec: CLI entrypoint

`git-summary [--days N] [--author <email>]`

- Default window: last 14 days.
- Output: one line per author, `<count> commits  <email>`, sorted desc.
- Exit 0 on success, 1 if not inside a git repo.
