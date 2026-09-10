# Continuous Integration Template

`github-actions.yml` is an inactive template for the Windows desktop repository. Ubuntu runs `npm run check` for boundaries, TypeScript, API/desktop-protocol tests and all builds. Windows runs the same checks, native Electron integration through `npm run test:desktop`, and `npm run package:win`; a successful installer build is retained as a workflow artifact. Browser-only tests remain an optional developer aid.

The template is not an active GitHub Actions workflow. The available OAuth credential has repository access but lacks the `workflow` scope required to upload active workflow files. No remote CI result is implied by including this file in the repository.

A maintainer with workflow-management permission can copy the template to `.github/workflows/ci.yml`. Review the first remote run before making it a required merge check. Until activation, run the checks locally, including desktop/language/restart verification on Windows, and record results in the pull request. Packaging on CI does not replace installation and launch verification of the delivered installer.

`npm ci` installs Electron 44.3.0 and downloads its runtime through the repository postinstall script. Initial installation/build therefore requires network access; installed users receive the bundled runtime and do not need npm. Code-signing credentials are not part of this template. Installer publishing remains a separate release action.
