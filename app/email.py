"""Email service for sending notifications via SMTP."""

from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import get_settings

logger = logging.getLogger(__name__)


def _smtp_configured() -> bool:
    settings = get_settings()
    return bool(settings.smtp_host and settings.smtp_from_email)


def _send(to: str, subject: str, html: str) -> bool:
    """Send an email via SMTP. Returns True on success, False on failure."""
    settings = get_settings()
    if not _smtp_configured():
        logger.info("SMTP not configured — skipping email to %s", to)
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(html, "html"))

    try:
        if settings.smtp_port == 465:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10)
        elif settings.smtp_use_tls:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10)
            server.starttls()
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10)
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(settings.smtp_from_email, to, msg.as_string())
        server.quit()
        logger.info("Email sent to %s: %s", to, subject)
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False


# ---------------------------------------------------------------------------
# Email templates
# ---------------------------------------------------------------------------

_INVITATION_HTML = """\
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#18181b;border-radius:16px;border:1px solid #27272a;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6d28d9,#7c3aed);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;">
                You're Invited!
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 16px;color:#fafafa;font-size:16px;line-height:1.6;">
                Hi there,
              </p>
              <p style="margin:0 0 24px;color:#a1a1aa;font-size:15px;line-height:1.6;">
                <strong style="color:#fafafa;">{inviter_name}</strong> has invited you to join
                <strong style="color:#fafafa;">{household_name}</strong> on Fino.
              </p>
              <p style="margin:0 0 24px;color:#a1a1aa;font-size:15px;line-height:1.6;">
                By joining, you'll be able to share a
                <strong style="color:#c4b5fd;">Mine / Yours / Ours</strong>
                financial view — see combined budgets, track shared goals, and manage
                household spending together.
              </p>
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="{app_url}"
                       style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;
                              padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">
                      Open Fino
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#71717a;font-size:13px;line-height:1.5;">
                Once you log in, you'll see the invitation banner on your dashboard
                where you can accept or decline.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #27272a;">
              <p style="margin:0;color:#52525b;font-size:12px;text-align:center;">
                This email was sent by Fino because {inviter_email} invited you
                to share finances. If you don't recognize this person, you can safely
                ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


_STATEMENT_REMINDER_HTML = """\
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#18181b;border-radius:16px;border:1px solid #27272a;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#6d28d9,#7c3aed);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;">
                Statement Available
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 16px;color:#fafafa;font-size:16px;line-height:1.6;">
                Hi there,
              </p>
              <p style="margin:0 0 24px;color:#a1a1aa;font-size:15px;line-height:1.6;">
                Your <strong style="color:#fafafa;">{account_name}</strong> statement should be
                available now. Time to upload your latest transactions!
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="{app_url}"
                       style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;
                              padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">
                      Import Transactions
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#71717a;font-size:13px;line-height:1.5;">
                You can change or remove the statement reminder day in your account settings.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #27272a;">
              <p style="margin:0;color:#52525b;font-size:12px;text-align:center;">
                This reminder was sent because you configured a statement day for
                your {account_name} account in Fino.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def send_statement_reminder_email(
    to_email: str,
    account_name: str,
    app_url: str | None = None,
) -> bool:
    """Send a statement availability reminder email."""
    settings = get_settings()
    html = _STATEMENT_REMINDER_HTML.format(
        account_name=account_name,
        app_url=app_url or settings.app_url,
    )
    subject = f"Statement reminder: {account_name}"
    return _send(to_email, subject, html)


def send_invitation_email(
    to_email: str,
    inviter_name: str,
    inviter_email: str,
    household_name: str,
) -> bool:
    """Send a household invitation email."""
    settings = get_settings()
    html = _INVITATION_HTML.format(
        inviter_name=inviter_name,
        inviter_email=inviter_email,
        household_name=household_name,
        app_url=settings.app_url,
    )
    subject = f"{inviter_name} invited you to join {household_name}"
    return _send(to_email, subject, html)
