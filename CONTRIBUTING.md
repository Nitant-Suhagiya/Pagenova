# Contributing to Pagenova

Thanks for contributing. Bug fixes, documentation corrections, tests, provider
support, and accessibility improvements are all welcome.

## Before you start

- Search existing issues before opening a new one.
- Open an issue first for a substantial feature or behaviour change, so the
  scope can be agreed before implementation.
- Do not include API keys, private documents, sensitive screenshots, or other
  credentials in issues, commits, or pull requests.

## Set up the project

```bash
git clone https://github.com/Nitant-Suhagiya/pagenova.git
cd pagenova
npm ci
```

Use Node 20.19+ or 22.12+.

## Make and check your change

1. Fork the repository and create a focused branch.
2. Make the smallest change that solves the issue. Add or update tests when
   behaviour changes, and update documentation when user-facing behaviour
   changes.
3. Run the required checks:

   ```bash
   npm run lint
   npm test
   npm run build
   ```

## Open a pull request

Describe the user-visible effect, the checks you ran, and any follow-up work.
Keep each pull request focused on one concern.
