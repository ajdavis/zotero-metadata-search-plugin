## Before committing

Always run `npm run lint:check` before `git commit`. CI fails on prettier
formatting violations, and a failed CI run on a release commit is a hassle to
clean up because the version, tag, and GitHub release are already published.
If lint reports issues, run `npm run lint:fix` and commit the result.
