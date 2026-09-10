# Continuous integration template

`github-actions.yml` contains the Windows and Ubuntu verification workflow for Node.js 24. It runs dependency installation, module boundaries, TypeScript checks, backend tests, builds and Chromium browser tests. It uploads browser artifacts only on failure.

The framework was verified locally on Windows. This template is not an active GitHub Actions workflow. The first push was rejected because the existing OAuth credential lacks the `workflow` scope; moving the configuration here lets the software and documentation synchronize without changing account permissions.

A repository maintainer can activate it by copying `github-actions.yml` to `.github/workflows/ci.yml` using a credential permitted to manage workflows, or GitHub's authorized web editor. Review the first remote run before relying on it as a merge gate. Until then, run `npm run check` and `npm run test:e2e` locally and record the results with each pull request.
