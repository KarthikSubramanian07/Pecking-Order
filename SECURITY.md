# Security policy

Pecking Order is a static, client-side web app. There are no accounts and no server that stores user data, but bugs can still matter: a cross-site scripting hole, a way to smuggle script past the Content Security Policy, a malicious pack or image that breaks out of the sandbox, or a dependency with a known vulnerability.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report it privately through GitHub Security Advisories instead:
[github.com/KarthikSubramanian07/Pecking-Order/security/advisories/new](https://github.com/KarthikSubramanian07/Pecking-Order/security/advisories/new)

Helpful details:

- what an attacker could do, and what they would need (a crafted pack, a pasted link, a shared file…);
- steps to reproduce, ideally with a minimal example;
- the browser and version you tested with.

## What to expect

- An acknowledgement within a few days. This is a spare-time project, so please allow a little slack.
- A fix in the open-source repository, released by redeploying the site. Because there is no installed software, everyone gets the fix on their next visit.
- Credit in the advisory, if you would like it.

## Supported versions

Only the version currently deployed at [pecking-order.pages.dev](https://pecking-order.pages.dev) and the `main` branch are supported.
