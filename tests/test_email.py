"""Email service unit tests."""

from unittest.mock import patch, MagicMock

from app.email import send_invitation_email, _smtp_configured


@patch("app.email.get_settings")
def test_smtp_not_configured_when_host_empty(mock_settings):
    settings = MagicMock()
    settings.smtp_host = ""
    settings.smtp_from_email = ""
    mock_settings.return_value = settings
    assert _smtp_configured() is False


@patch("app.email.get_settings")
def test_send_invitation_skips_when_unconfigured(mock_settings):
    settings = MagicMock()
    settings.smtp_host = ""
    settings.smtp_from_email = ""
    mock_settings.return_value = settings
    result = send_invitation_email(
        to_email="partner@test.com",
        inviter_name="Alice",
        inviter_email="alice@test.com",
        household_name="Our Home",
    )
    assert result is False


@patch("app.email.get_settings")
@patch("app.email.smtplib.SMTP")
def test_send_invitation_success(mock_smtp_cls, mock_settings):
    settings = MagicMock()
    settings.smtp_host = "smtp.test.com"
    settings.smtp_port = 587
    settings.smtp_user = "user"
    settings.smtp_password = "pass"
    settings.smtp_from_email = "noreply@test.com"
    settings.smtp_from_name = "TestApp"
    settings.smtp_use_tls = True
    settings.app_url = "http://localhost:3000"
    mock_settings.return_value = settings

    mock_server = MagicMock()
    mock_smtp_cls.return_value = mock_server

    result = send_invitation_email(
        to_email="partner@test.com",
        inviter_name="Alice",
        inviter_email="alice@test.com",
        household_name="Our Home",
    )
    assert result is True
    mock_server.starttls.assert_called_once()
    mock_server.login.assert_called_once_with("user", "pass")
    mock_server.sendmail.assert_called_once()
    mock_server.quit.assert_called_once()

    sent_to = mock_server.sendmail.call_args[0][1]
    assert sent_to == "partner@test.com"


@patch("app.email.get_settings")
@patch("app.email.smtplib.SMTP")
def test_send_invitation_smtp_failure(mock_smtp_cls, mock_settings):
    settings = MagicMock()
    settings.smtp_host = "smtp.test.com"
    settings.smtp_port = 587
    settings.smtp_user = ""
    settings.smtp_from_email = "noreply@test.com"
    settings.smtp_from_name = "TestApp"
    settings.smtp_use_tls = True
    settings.app_url = "http://localhost:3000"
    mock_settings.return_value = settings

    mock_smtp_cls.side_effect = ConnectionRefusedError("SMTP down")

    result = send_invitation_email(
        to_email="partner@test.com",
        inviter_name="Alice",
        inviter_email="alice@test.com",
        household_name="Our Home",
    )
    assert result is False


@patch("app.email.get_settings")
@patch("app.email.smtplib.SMTP")
def test_invitation_email_contains_inviter_info(mock_smtp_cls, mock_settings):
    settings = MagicMock()
    settings.smtp_host = "smtp.test.com"
    settings.smtp_port = 587
    settings.smtp_user = ""
    settings.smtp_from_email = "noreply@test.com"
    settings.smtp_from_name = "TestApp"
    settings.smtp_use_tls = True
    settings.app_url = "http://localhost:3000"
    mock_settings.return_value = settings

    mock_server = MagicMock()
    mock_smtp_cls.return_value = mock_server

    send_invitation_email(
        to_email="bob@test.com",
        inviter_name="Alice Johnson",
        inviter_email="alice@test.com",
        household_name="The Johnsons",
    )

    sent_raw = mock_server.sendmail.call_args[0][2]
    assert "Alice Johnson invited you to join The Johnsons" in sent_raw

    import base64, re
    b64_match = re.search(r"\n\n([A-Za-z0-9+/=\n]+)\n\n--", sent_raw)
    html = base64.b64decode(b64_match.group(1)).decode()
    assert "Alice Johnson" in html
    assert "The Johnsons" in html
    assert "http://localhost:3000" in html


@patch("app.email.get_settings")
@patch("app.email.smtplib.SMTP_SSL")
def test_send_invitation_uses_smtp_ssl_on_port_465(mock_smtp_ssl_cls, mock_settings):
    settings = MagicMock()
    settings.smtp_host = "smtp.resend.com"
    settings.smtp_port = 465
    settings.smtp_user = "resend"
    settings.smtp_password = "re_test_key"
    settings.smtp_from_email = "noreply@example.com"
    settings.smtp_from_name = "Fino"
    settings.smtp_use_tls = True
    settings.app_url = "http://localhost:3000"
    mock_settings.return_value = settings

    mock_server = MagicMock()
    mock_smtp_ssl_cls.return_value = mock_server

    result = send_invitation_email(
        to_email="partner@test.com",
        inviter_name="Alice",
        inviter_email="alice@test.com",
        household_name="Our Home",
    )
    assert result is True
    mock_smtp_ssl_cls.assert_called_once_with("smtp.resend.com", 465, timeout=10)
    mock_server.login.assert_called_once_with("resend", "re_test_key")
    mock_server.sendmail.assert_called_once()
    mock_server.quit.assert_called_once()
