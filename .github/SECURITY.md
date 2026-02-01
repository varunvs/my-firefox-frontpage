# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in this extension, please report it by:

1. **Do not** open a public GitHub issue
2. Email the maintainer directly or use GitHub's private vulnerability reporting feature
3. Include a detailed description of the vulnerability and steps to reproduce

We will acknowledge receipt within 48 hours and provide a detailed response within 7 days.

## Security Measures

This extension follows security best practices:

- Uses Content Security Policy headers
- No use of `eval()` or `innerHTML` with untrusted content
- Minimal permissions requested
- Regular dependency updates via Dependabot
- Automated security scanning in CI pipeline
