# Security Policy

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

This application handles personal financial data. If you discover a security
vulnerability, please report it responsibly by emailing:

**amitkaura@gmail.com**

Include as much of the following as possible:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You should receive an acknowledgment within **48 hours**. A fix will be
prioritized and you will be credited in the release notes (unless you prefer
to remain anonymous).

## Supported Versions

Only the latest release on `main` is supported with security updates.

## Scope

The following are in scope:

- Authentication and session handling
- Encryption of stored credentials (Plaid tokens, API keys)
- API authorization and access control
- SQL injection, XSS, CSRF
- Sensitive data exposure

The following are out of scope:

- Vulnerabilities in third-party services (Plaid, Google OAuth, Resend)
- Denial-of-service attacks
- Issues requiring physical access to the server
