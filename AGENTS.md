## Git and commit policy

Create small, atomic commits throughout each roadmap task.

Commit rules:

- Commit after each independently reviewable change.
- Use Conventional Commit-style messages.
- Keep documentation, configuration, migrations, implementation, and tests in separate commits when they represent distinct concerns.
- A commit must leave the repository in a coherent state.
- Do not commit failing code unless the commit is explicitly marked as a temporary work-in-progress commit and will not be pushed to the main branch.
- Do not create meaningless commits solely to increase commit count.
- Do not combine an entire roadmap day into one commit when it contains several independent changes.
- Run the applicable focused checks before each commit.
- Run the complete quality suite before the final commit of a roadmap day.
- Do not amend, squash, rebase, or force-push unless explicitly requested.
- Do not start the next roadmap day automatically.
