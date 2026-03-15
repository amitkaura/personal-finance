"""Email service unit tests (Resend HTTP API)."""

from unittest.mock import patch, MagicMock

from app.email import (
    send_invitation_email,
    send_statement_reminder_email,
    _email_configured,
)


@patch("app.email.get_settings")
def test_email_not_configured_when_api_key_empty(mock_settings):
    settings = MagicMock()
    settings.resend_api_key = ""
    settings.email_from_address = ""
    mock_settings.return_value = settings
    assert _email_configured() is False


@patch("app.email.get_settings")
def test_email_not_configured_when_from_address_empty(mock_settings):
    settings = MagicMock()
    settings.resend_api_key = "re_test_key"
    settings.email_from_address = ""
    mock_settings.return_value = settings
    assert _email_configured() is False


@patch("app.email.get_settings")
def test_email_configured_when_both_set(mock_settings):
    settings = MagicMock()
    settings.resend_api_key = "re_test_key"
    settings.email_from_address = "noreply@test.com"
    mock_settings.return_value = settings
    assert _email_configured() is True


@patch("app.email.get_settings")
def test_send_invitation_skips_when_unconfigured(mock_settings):
    settings = MagicMock()
    settings.resend_api_key = ""
    settings.email_from_address = ""
    mock_settings.return_value = settings
    result = send_invitation_email(
        to_email="partner@test.com",
        inviter_name="Alice",
        inviter_email="alice@test.com",
        household_name="Our Home",
    )
    assert result is False


@patch("app.email.get_settings")
@patch("app.email.httpx.post")
def test_send_invitation_success(mock_post, mock_settings):
    settings = MagicMock()
    settings.resend_api_key = "re_test_key"
    settings.email_from_address = "noreply@test.com"
    settings.email_from_name = "TestApp"
    settings.app_url = "https://app.example.com"
    mock_settings.return_value = settings

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"id": "msg_123"}
    mock_post.return_value = mock_response

    result = send_invitation_email(
        to_email="partner@test.com",
        inviter_name="Alice",
        inviter_email="alice@test.com",
        household_name="Our Home",
    )
    assert result is True
    mock_post.assert_called_once()

    call_kwargs = mock_post.call_args
    assert call_kwargs[0][0] == "https://api.resend.com/emails"
    payload = call_kwargs[1]["json"]
    assert payload["to"] == ["partner@test.com"]
    assert payload["from"] == "TestApp <noreply@test.com>"
    assert "Alice" in payload["subject"]
    assert "Our Home" in payload["subject"]
    assert "https://app.example.com" in payload["html"]


@patch("app.email.get_settings")
@patch("app.email.httpx.post")
def test_send_invitation_api_failure(mock_post, mock_settings):
    settings = MagicMock()
    settings.resend_api_key = "re_test_key"
    settings.email_from_address = "noreply@test.com"
    settings.email_from_name = "TestApp"
    settings.app_url = "https://app.example.com"
    mock_settings.return_value = settings

    mock_response = MagicMock()
    mock_response.status_code = 422
    mock_response.text = "Validation error"
    mock_post.return_value = mock_response

    result = send_invitation_email(
        to_email="partner@test.com",
        inviter_name="Alice",
        inviter_email="alice@test.com",
        household_name="Our Home",
    )
    assert result is False


@patch("app.email.get_settings")
@patch("app.email.httpx.post")
def test_send_invitation_network_error(mock_post, mock_settings):
    settings = MagicMock()
    settings.resend_api_key = "re_test_key"
    settings.email_from_address = "noreply@test.com"
    settings.email_from_name = "TestApp"
    settings.app_url = "https://app.example.com"
    mock_settings.return_value = settings

    mock_post.side_effect = ConnectionError("Network unreachable")

    result = send_invitation_email(
        to_email="partner@test.com",
        inviter_name="Alice",
        inviter_email="alice@test.com",
        household_name="Our Home",
    )
    assert result is False


@patch("app.email.get_settings")
@patch("app.email.httpx.post")
def test_invitation_email_contains_inviter_info(mock_post, mock_settings):
    settings = MagicMock()
    settings.resend_api_key = "re_test_key"
    settings.email_from_address = "noreply@test.com"
    settings.email_from_name = "TestApp"
    settings.app_url = "https://app.example.com"
    mock_settings.return_value = settings

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"id": "msg_123"}
    mock_post.return_value = mock_response

    send_invitation_email(
        to_email="bob@test.com",
        inviter_name="Alice Johnson",
        inviter_email="alice@test.com",
        household_name="The Johnsons",
    )

    payload = mock_post.call_args[1]["json"]
    assert "Alice Johnson" in payload["html"]
    assert "The Johnsons" in payload["html"]
    assert "alice@test.com" in payload["html"]
    assert "Alice Johnson invited you to join The Johnsons" in payload["subject"]


@patch("app.email.get_settings")
@patch("app.email.httpx.post")
def test_send_invitation_passes_bearer_token(mock_post, mock_settings):
    settings = MagicMock()
    settings.resend_api_key = "re_my_secret_key"
    settings.email_from_address = "noreply@test.com"
    settings.email_from_name = "TestApp"
    settings.app_url = "https://app.example.com"
    mock_settings.return_value = settings

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"id": "msg_123"}
    mock_post.return_value = mock_response

    send_invitation_email(
        to_email="partner@test.com",
        inviter_name="Alice",
        inviter_email="alice@test.com",
        household_name="Our Home",
    )

    headers = mock_post.call_args[1]["headers"]
    assert headers["Authorization"] == "Bearer re_my_secret_key"


@patch("app.email.get_settings")
@patch("app.email.httpx.post")
def test_send_statement_reminder_success(mock_post, mock_settings):
    settings = MagicMock()
    settings.resend_api_key = "re_test_key"
    settings.email_from_address = "noreply@test.com"
    settings.email_from_name = "TestApp"
    settings.app_url = "https://app.example.com"
    mock_settings.return_value = settings

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"id": "msg_456"}
    mock_post.return_value = mock_response

    result = send_statement_reminder_email(
        to_email="user@test.com",
        account_name="Chase Checking",
    )
    assert result is True

    payload = mock_post.call_args[1]["json"]
    assert payload["to"] == ["user@test.com"]
    assert "Chase Checking" in payload["subject"]
    assert "Chase Checking" in payload["html"]
    assert "https://app.example.com" in payload["html"]


@patch("app.email.get_settings")
@patch("app.email.httpx.post")
def test_send_statement_reminder_custom_app_url(mock_post, mock_settings):
    settings = MagicMock()
    settings.resend_api_key = "re_test_key"
    settings.email_from_address = "noreply@test.com"
    settings.email_from_name = "TestApp"
    settings.app_url = "https://app.example.com"
    mock_settings.return_value = settings

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"id": "msg_456"}
    mock_post.return_value = mock_response

    result = send_statement_reminder_email(
        to_email="user@test.com",
        account_name="Chase Checking",
        app_url="https://custom.example.com",
    )
    assert result is True

    payload = mock_post.call_args[1]["json"]
    assert "https://custom.example.com" in payload["html"]
