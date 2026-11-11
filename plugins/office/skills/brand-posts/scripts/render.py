"""Render greeting cards and Outlook .eml drafts from a jobs file.

usage: python render.py <jobs.json> <out_dir> [--open]

--open: after rendering, open each .eml in the default mail app (classic
Outlook shows it as an editable draft with the card inside). Nothing is sent.

The card and email templates are NOT stored here: the run downloads them
from SharePoint (see ai-designer.md) into the scratchpad and passes their
paths in the jobs file.

jobs.json:
{
  "templates": {"card": "C:/scratch/card.html", "email": "C:/scratch/email.html"},
  "brand": {
    "company": "Embla",
    "frame": "C:/scratch/frame.png",    # optional, filled into {{frame}}
    "logo": "C:/scratch/logo.png"       # optional, filled into {{logo}}
  },
  "email": {
    "to": "all-staff@example.com",
    "from": "",                          # blank: Outlook uses the default account
    "ai_marker": "(drafted by AI Designer, review before sending)"
  },
  "cards": [
    {
      "out": "901-birthday",             # file stem
      "name": "Amaya Nethmi Dummy",      # full name on the card (holiday: "")
      "first_name": "Amaya",             # email greeting (holiday: "everyone")
      "occasion": "Happy Birthday",      # headline
      "message": "Card message, written fresh per person.",
      "email_message": "Optional email text; defaults to message.",
      "subject": "Happy Birthday, Amaya!",
      "photo": "C:/scratch/901.png",     # or null -> initials badge
      "holiday": false                   # true -> logo in the photo box, no name
    }
  ]
}

Placeholders filled
  card:  {{name}} {{occasion}} {{message}} {{photo}} {{company}} {{frame}}
         {{logo}} {{name_class}} ("long" for names over 15 characters)
         {{photo}} becomes <div class="photo">...</div> holding an <img>, or
         <span class="badge">AB</span> for the initials badge.
  email: {{first_name}} {{message}} {{card}} {{ai_marker}} {{company}}
         {{card}} becomes the card as an inline PNG when Edge or Chrome is
         available (headless screenshot), otherwise a "card attached" line.

Outputs per card: <out>.html (self-contained card) and <out>.eml
(X-Unsent: 1 draft, card PNG inline when available, card .html attached).

Also writes outlook-drafts.json in <out_dir>: one entry per card with
out, to, subject, body (Outlook-connector-safe HTML: p/b only, no image) and
attach (the file the reviewer attaches by hand). The skill adds message_id and
web_link after creating each draft; a re-run keeps those so the same drafts
are updated, not duplicated.
"""
import base64
import html
import io
import json
import mimetypes
import os
import shutil
import subprocess
import sys
import tempfile
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path

BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
]


def fill(tpl: str, values: dict) -> str:
    for k, v in values.items():
        tpl = tpl.replace("{{" + k + "}}", v)
    return tpl


def initials(name: str) -> str:
    parts = [p for p in name.replace("-", " ").split() if p[:1].isalpha()]
    if not parts:
        return "?"
    return (parts[0][0] + (parts[-1][0] if len(parts) > 1 else "")).upper()


def data_uri(path: str, max_px: int | None = None) -> str:
    p = Path(path)
    data = p.read_bytes()
    mime = mimetypes.guess_type(p.name)[0] or "image/png"
    if max_px and mime != "image/svg+xml":
        try:
            from PIL import Image  # optional

            img = Image.open(io.BytesIO(data))
            if max(img.size) > max_px:
                img.thumbnail((max_px, max_px))
                buf = io.BytesIO()
                img.save(buf, "PNG", optimize=True)
                data, mime = buf.getvalue(), "image/png"
        except ImportError:
            pass
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def find_browser() -> str | None:
    for b in BROWSERS:
        if os.path.exists(b):
            return b
    for name in ("msedge", "google-chrome", "chromium", "chrome"):
        if shutil.which(name):
            return shutil.which(name)
    return None


def screenshot(browser: str, html_path: Path, png_path: Path) -> bool:
    # Absolute path: the browser resolves a relative --screenshot path
    # against its own folder, not ours.
    png_path = png_path.resolve()
    # Remove a PNG from an earlier run so a failed screenshot is not
    # mistaken for a fresh one.
    png_path.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory() as profile:
        cmd = [browser, "--headless=new", "--disable-gpu", "--hide-scrollbars",
               f"--user-data-dir={profile}", "--window-size=1080,1080",
               "--virtual-time-budget=5000", f"--screenshot={png_path}",
               html_path.resolve().as_uri()]
        try:
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
        except (OSError, subprocess.TimeoutExpired):
            return False
    return png_path.exists() and png_path.stat().st_size > 0


def open_file(path: Path) -> bool:
    """Open a file in its default app (Windows, macOS, Linux); False if that fails."""
    try:
        if hasattr(os, "startfile"):
            os.startfile(str(path))  # Windows: the app registered for .eml
        else:
            opener = "open" if sys.platform == "darwin" else "xdg-open"
            subprocess.Popen([opener, str(path)], stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL)
        return True
    except OSError:
        return False


def main() -> int:
    args = [a for a in sys.argv[1:] if a != "--open"]
    open_after = "--open" in sys.argv[1:]
    if len(args) != 2:
        print(__doc__)
        return 2
    jobs = json.loads(Path(args[0]).read_text(encoding="utf-8"))
    out_dir = Path(args[1])
    eml_paths = []
    out_dir.mkdir(parents=True, exist_ok=True)

    card_tpl = Path(jobs["templates"]["card"]).read_text(encoding="utf-8")
    email_tpl = Path(jobs["templates"]["email"]).read_text(encoding="utf-8")

    b = jobs.get("brand", {})
    company = b.get("company", "")
    frame = data_uri(b["frame"]) if b.get("frame") else ""
    logo = data_uri(b["logo"]) if b.get("logo") else ""
    em = jobs.get("email", {})
    marker = em.get("ai_marker", "(drafted by AI Designer, review before sending)")
    browser = find_browser()

    # Outlook drafts list: keep message ids from an earlier run of the same day,
    # so the skill updates those drafts instead of creating duplicates.
    drafts_path = out_dir / "outlook-drafts.json"
    old_ids = {}
    if drafts_path.exists():
        try:
            for d in json.loads(drafts_path.read_text(encoding="utf-8")):
                if d.get("message_id"):
                    old_ids[d["out"]] = {k: d[k] for k in ("message_id", "web_link") if d.get(k)}
        except (ValueError, KeyError, TypeError):
            pass
    drafts = []

    for c in jobs["cards"]:
        name = "" if c.get("holiday") else c.get("name", "")
        first = c.get("first_name") or (name.split()[0] if name else "everyone")
        if c.get("holiday") and logo:
            inner, kind = f'<img src="{logo}" alt="{html.escape(company)}" style="object-fit:contain;padding:40px;box-sizing:border-box;background:#fff">', "logo"
        elif c.get("photo"):
            inner, kind = f'<img src="{data_uri(c["photo"], 760)}" alt="{html.escape(name)}">', "photo"
        else:
            inner, kind = f'<span class="badge">{html.escape(initials(name or company))}</span>', "badge"

        card = fill(card_tpl, {
            "name": html.escape(name),
            "name_class": "long" if len(name) > 15 else "",
            "occasion": html.escape(c["occasion"]),
            "message": html.escape(c["message"]),
            "photo": f'<div class="photo">{inner}</div>',
            "company": html.escape(company),
            "frame": frame,
            "logo": logo,
        })
        card_path = out_dir / f'{c["out"]}.html'
        card_path.write_text(card, encoding="utf-8")

        png_path = out_dir / f'{c["out"]}.png'
        has_png = bool(browser) and screenshot(browser, card_path, png_path)
        cid = make_msgid(domain="ai-designer.local")
        if has_png:
            card_block = (f'<p><img src="cid:{cid[1:-1]}" alt="{html.escape(c["occasion"])} card" '
                          f'width="540" style="max-width:100%;border-radius:8px"></p>')
        else:
            card_block = "<p>Your card is attached.</p>"

        email_msg = c.get("email_message") or c["message"]
        body = fill(email_tpl, {
            "first_name": html.escape(first),
            "message": html.escape(email_msg),
            "card": card_block,
            "ai_marker": html.escape(marker),
            "company": html.escape(company),
        })

        msg = EmailMessage()
        msg["X-Unsent"] = "1"
        if em.get("to"):
            msg["To"] = em["to"]
        if em.get("from"):
            msg["From"] = em["from"]
        msg["Subject"] = c.get("subject") or f'{c["occasion"]}, {first}!'
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid()
        msg.set_content(f"Hi {first},\n\n{email_msg}\n\nYour card is attached.\n\n{marker}\n")
        msg.add_alternative(body, subtype="html")
        if has_png:
            msg.get_payload()[1].add_related(png_path.read_bytes(), maintype="image",
                                             subtype="png", cid=cid,
                                             filename=png_path.name)
        msg.add_attachment(card.encode("utf-8"), maintype="text", subtype="html",
                           filename=card_path.name)
        eml_path = out_dir / f'{c["out"]}.eml'
        eml_path.write_bytes(bytes(msg))
        eml_paths.append(eml_path)

        # Outlook-draft body: allowlist tags only (p, br, b); no images,
        # styles or comments, so the card PNG is attached by hand.
        attach = png_path.name if has_png else card_path.name
        drafts.append({
            "out": c["out"],
            "to": [em["to"]] if em.get("to") else [],
            "subject": msg["Subject"],
            "body": (f"<p>Hi {html.escape(first)},</p>"
                     f"<p>{html.escape(email_msg)}</p>"
                     f"<p><b>[Attach the card before sending: {html.escape(attach)}]</b></p>"
                     f"<p>Best wishes from {html.escape(company)} Team</p>"
                     f"<p>{html.escape(marker)}</p>"),
            "attach": str((out_dir / attach).resolve()),
            **old_ids.get(c["out"], {}),
        })

        extra = (f"  + {png_path.name}" if has_png
                 else "  (no browser: no PNG)" if not browser
                 else "  (screenshot failed: no PNG)")
        print(f'{card_path.name}  {card_path.stat().st_size/1024:.0f} KB  {kind}  + {eml_path.name}{extra}')

    # Merge with entries for cards not in this run (keep them as they were).
    done = {d["out"] for d in drafts}
    if drafts_path.exists():
        try:
            drafts = [d for d in json.loads(drafts_path.read_text(encoding="utf-8"))
                      if d.get("out") not in done] + drafts
        except (ValueError, TypeError):
            pass
    drafts_path.write_text(json.dumps(drafts, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"{drafts_path.name}  {len(drafts)} draft(s) for Outlook")

    if open_after:
        for e in eml_paths:
            print(f"opened {e.name}" if open_file(e) else f"could not open {e.name}: open it by hand")
    return 0


if __name__ == "__main__":
    sys.exit(main())
