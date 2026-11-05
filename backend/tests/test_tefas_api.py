"""TEFAS JSON API client: look-back choice, parsing, pause after failures."""

from datetime import date
from decimal import Decimal as D

import httpx
import pytest

from app.services import tefas_api

TODAY = date(2026, 11, 5)


@pytest.fixture(autouse=True)
def unpaused(monkeypatch):
    monkeypatch.setattr(tefas_api, "_paused_until", 0.0)


def respond(monkeypatch, handler):
    calls = []

    def fake_post(url, json, headers, timeout):
        calls.append(json)
        return handler(httpx.Request("POST", url))

    monkeypatch.setattr(tefas_api.httpx, "post", fake_post)
    return calls


def test_shortest_lookback_reaching_the_start_is_asked():
    assert tefas_api._lookback(date(2026, 10, 30), TODAY) == 1
    assert tefas_api._lookback(date(2026, 8, 20), TODAY) == 3
    assert tefas_api._lookback(date(2024, 10, 28), TODAY) == 36
    assert tefas_api._lookback(date(2019, 1, 1), TODAY) == 60


def test_prices_are_parsed(monkeypatch):
    rows = [
        {"fonKodu": "IPB", "tarih": "2026-11-04", "fiyat": 0.701234},
        {"fonKodu": "IPB", "tarih": "2026-11-05", "fiyat": 0.705},
        {"fonKodu": "IPB", "tarih": "2026-11-01", "fiyat": 0},
        {"fonKodu": "XYZ", "tarih": "2026-11-05", "fiyat": 9.0},
    ]
    calls = respond(monkeypatch, lambda req: httpx.Response(
        200, json={"errorCode": None, "resultList": rows}, request=req
    ))
    prices = tefas_api.fetch_prices("IPB", date(2026, 11, 1), TODAY)
    assert prices == {date(2026, 11, 4): D("0.701234"), date(2026, 11, 5): D("0.705")}
    assert calls == [{"fonKodu": "IPB", "dil": "TR", "periyod": 1}]


def test_failure_pauses_further_requests(monkeypatch):
    calls = respond(monkeypatch, lambda req: httpx.Response(429, request=req))
    assert tefas_api.fetch_prices("IPB", date(2026, 11, 1), TODAY) is None
    assert tefas_api.fetch_prices("KPC", date(2026, 11, 1), TODAY) is None
    assert len(calls) == 1


def test_api_error_counts_as_failure(monkeypatch):
    respond(monkeypatch, lambda req: httpx.Response(
        200, json={"errorCode": "E1", "errorMessage": "boom", "resultList": None}, request=req
    ))
    assert tefas_api.fetch_prices("IPB", date(2026, 11, 1), TODAY) is None
