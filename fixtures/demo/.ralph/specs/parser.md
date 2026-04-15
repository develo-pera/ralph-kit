# Spec: git log parser

Invoke `git log --since=<N>.days --pretty=%ae` and aggregate by email.

- Must tolerate zero commits (print nothing, exit 0).
- Must ignore merge commits (`--no-merges`).
