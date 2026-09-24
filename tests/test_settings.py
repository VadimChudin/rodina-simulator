"""Browser regression for the saved default cleaning route."""

import os
from pathlib import Path

from playwright.sync_api import sync_playwright


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"), args=["--no-sandbox"])
    page = browser.new_page()
    page.goto((Path(__file__).resolve().parents[1] / "frontend/index.html").as_uri())
    page.evaluate("localStorage.clear()")
    page.reload()

    page.click('[data-tab="settings"]')
    page.click('#set-route [data-o="pneumo"]')
    assert page.evaluate("PLANT.S.opt.pneumo") is False
    page.click("#set-save")
    page.reload()
    assert page.evaluate("PLANT.S.opt.pneumo") is False
    page.click('[data-tab="settings"]')
    assert "on" not in page.locator('#set-route [data-o="pneumo"]').get_attribute("class").split()

    page.evaluate("localStorage.clear()")
    browser.close()
