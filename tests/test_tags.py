"""Tag CRUD and transaction tagging tests."""

from app.main import app
from app.auth import get_current_user
from tests.conftest import make_tag, make_transaction, make_user


# -- Tag CRUD --------------------------------------------------------------

def test_list_tags_empty(auth_client):
    client, _ = auth_client
    resp = client.get("/api/v1/tags")
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_tag(auth_client):
    client, _ = auth_client
    resp = client.post("/api/v1/tags", json={"name": "travel", "color": "#00ff00"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "travel"
    assert data["color"] == "#00ff00"


def test_create_duplicate_tag(auth_client, session):
    client, user = auth_client
    make_tag(session, user, name="dup")
    resp = client.post("/api/v1/tags", json={"name": "dup"})
    assert resp.status_code == 409


def test_list_tags(auth_client, session):
    client, user = auth_client
    make_tag(session, user, name="alpha")
    make_tag(session, user, name="beta")
    resp = client.get("/api/v1/tags")
    assert len(resp.json()) == 2


def test_update_tag(auth_client, session):
    client, user = auth_client
    tag = make_tag(session, user, name="old")
    resp = client.patch(f"/api/v1/tags/{tag.id}", json={"name": "new", "color": "#0000ff"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "new"
    assert resp.json()["color"] == "#0000ff"


def test_update_tag_not_found(auth_client):
    client, _ = auth_client
    resp = client.patch("/api/v1/tags/99999", json={"name": "x"})
    assert resp.status_code == 404


def test_delete_tag(auth_client, session):
    client, user = auth_client
    tag = make_tag(session, user, name="byebye")
    resp = client.delete(f"/api/v1/tags/{tag.id}")
    assert resp.status_code == 204


def test_delete_tag_not_found(auth_client):
    client, _ = auth_client
    resp = client.delete("/api/v1/tags/99999")
    assert resp.status_code == 404


# -- Transaction tagging ---------------------------------------------------

def test_add_tag_to_transaction(auth_client, session):
    client, user = auth_client
    tag = make_tag(session, user, name="lunch")
    txn = make_transaction(session, user)

    resp = client.post(f"/api/v1/tags/transactions/{txn.id}/tags/{tag.id}")
    assert resp.status_code == 201
    assert resp.json()["status"] == "tagged"


def test_add_tag_idempotent(auth_client, session):
    client, user = auth_client
    tag = make_tag(session, user, name="lunch")
    txn = make_transaction(session, user)

    client.post(f"/api/v1/tags/transactions/{txn.id}/tags/{tag.id}")
    resp = client.post(f"/api/v1/tags/transactions/{txn.id}/tags/{tag.id}")
    assert resp.json()["status"] == "already_tagged"


def test_remove_tag_from_transaction(auth_client, session):
    client, user = auth_client
    tag = make_tag(session, user, name="temp")
    txn = make_transaction(session, user)
    client.post(f"/api/v1/tags/transactions/{txn.id}/tags/{tag.id}")

    resp = client.delete(f"/api/v1/tags/transactions/{txn.id}/tags/{tag.id}")
    assert resp.status_code == 204


def test_get_transaction_tags(auth_client, session):
    client, user = auth_client
    tag1 = make_tag(session, user, name="a")
    tag2 = make_tag(session, user, name="b")
    txn = make_transaction(session, user)
    client.post(f"/api/v1/tags/transactions/{txn.id}/tags/{tag1.id}")
    client.post(f"/api/v1/tags/transactions/{txn.id}/tags/{tag2.id}")

    resp = client.get(f"/api/v1/tags/transactions/{txn.id}")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_delete_tag_cascades_links(auth_client, session):
    client, user = auth_client
    tag = make_tag(session, user, name="cascade")
    txn = make_transaction(session, user)
    client.post(f"/api/v1/tags/transactions/{txn.id}/tags/{tag.id}")

    client.delete(f"/api/v1/tags/{tag.id}")

    resp = client.get(f"/api/v1/tags/transactions/{txn.id}")
    assert resp.json() == []
