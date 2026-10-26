"""Build CLite's original linked detective trail and hashed answer manifest.

Authoring source is public for maintainers. This is a practice story, not a
secret-backed competitive scoreboard. No existing story text is reproduced.
"""
import base64
import codecs
import hashlib
import json
from pathlib import Path
import random
import sys
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]
SCENES = """
padma-dispatch meghna-envelope jamuna-crossing buriganga-lantern karnaphuli-wharf teesta-compass surma-notebook kushiyara-postcard dhaleshwari-ferry shitalakshya-signal
dhaka-bookshop chattogram-dock sylhet-teacup rajshahi-manuscript khulna-warehouse barishal-launch rangpur-radio mymensingh-courtyard coxsbazar-footprint sundarbans-watch
feluda-magnifier byomkesh-ledger holmes-violin poirot-timetable kakababu-map masud-rana-passport tintin-snowy miss-marple-garden blanc-glass bond-cufflink
ekushey-alphabet bangla-typewriter boishakh-mask nakshi-kantha jamdani-thread rickshaw-painting shapla-reflection hilsa-receipt pitha-wrapper cha-stall
tahmid-terminal clite-green-cursor browser-footprint bash-history python-postmark bun-clockwork tmux-window git-margin cipher-workbench debugger-lamp
lalbagh-gate ahsan-manzil-window sonargaon-key paharpur-sketch mahasthangarh-seal kantajew-pattern shat-gombuj-echo ratargul-ripple jaflong-pebble kuakata-horizon
sherlock-rooftop watson-fieldnote irene-melody moriarty-chessboard lestrade-telegram topshe-camera jatayu-suitcase bakshi-spectacles ajit-column hestings-letter
monsoon-umbrella kalbaishakhi-static winter-fog mango-orchard jackfruit-crate bamboo-flute jute-fiber clay-bank river-delta firefly-code
dhaka-midnight old-town-bakery nilkhet-page shahbagh-bookmark dhanmondi-lake hatirjheel-light kamalapur-ticket sadarghat-rope curzon-hall-chalk ramna-shadow
competition-dawn shared-workspace missing-packet friendly-rival last-teacup final-crossing detective-assembly tahmid-signature clite-homecoming bengal-casebook
""".split()
REFERENCES = ["feluda_follows_the_margin", "byomkesh_reads_between_bytes", "holmes_checks_the_evidence", "poirot_orders_the_packets", "kakababu_keeps_the_map", "tahmid_finds_the_green_cursor", "clite_brings_the_case_home", "dhaka_hides_another_story", "bangla_letters_leave_tracks", "masud_rana_keeps_his_cool", "schrodingers_packet_is_open", "newton_follows_the_byte", "stark_checks_the_circuit", "strange_reads_the_time_loop", "wakanda_guards_the_archive", "behula_follows_the_river", "the_red_herring_was_a_packet", "a_needle_in_the_jute_stack", "inception_unwraps_another_layer", "the_wormhole_leads_to_bengal"]
TECHNIQUES = ["base64", "base32", "hex", "rot13", "layers", "url", "json", "logs", "strings", "reverse", "caesar", "xor", "ascii", "frames", "hash", "json-layers"]
ACTS = [
    ("The missing dispatch", "Rain closes over Dhaka. Tahmid's competition notebook contains a dispatch nobody remembers writing."),
    ("The borrowed detectives", "A bookshop keeper has labelled the evidence with famous fictional detectives. The notes are original; their methods are the clue."),
    ("The green cursor", "The trail returns to CLite. Someone has hidden a route inside ordinary tools and overlooked details."),
    ("The monsoon archive", "The witness changes places, but the evidence keeps its order. Cross-check every recovered fragment."),
    ("The homecoming", "The final route points back toward the shared workspace. Tahmid's missing packet is almost within reach."),
]


def caesar(text, shift):
    return "".join(chr((ord(c) - ord("A" if c.isupper() else "a") + shift) % 26 + ord("A" if c.isupper() else "a")) if c.isascii() and c.isalpha() else c for c in text)


def build():
    entries, artifacts, headers = [], {}, {}
    offline = 0
    web = 0
    for index, scene in enumerate(SCENES):
        act, setup = ACTS[index // 20]
        suffix = hashlib.sha256(("clite-casebook:" + scene).encode()).hexdigest()[:6]
        phrase = REFERENCES[index % len(REFERENCES)]
        flag = f"CLITE{{{phrase}_{scene.replace('-', '_')}_{suffix}}}"
        data = flag.encode()
        is_web = index % 5 == 4
        entry = {"id": scene, "title": scene.replace("-", " ").title(), "act": act,
                 "sha256": hashlib.sha256(data).hexdigest(), "next": SCENES[index + 1] if index + 1 < len(SCENES) else None}
        if not is_web:
            kind = TECHNIQUES[offline % len(TECHNIQUES)]
            offline += 1
            folder = f"templates/demo/casebook/{scene}"
            payload = "evidence.txt"
            clue = ""
            if kind in {"base64", "base32", "hex", "rot13", "layers", "url", "reverse", "ascii"}:
                encoded = {"base64": base64.b64encode(data).decode(), "base32": base64.b32encode(data).decode(),
                           "hex": data.hex(), "rot13": codecs.encode(flag, "rot13"),
                           "layers": base64.b64encode(base64.b64encode(data)).decode(),
                           "url": "".join(f"%{b:02X}" for b in data), "reverse": flag[::-1],
                           "ascii": " ".join(str(b) for b in data)}[kind]
                artifacts[f"{folder}/{payload}"] = (encoded + "\n").encode()
                clue = {"base64": "A courier counts in sixty-four symbols. Try base64 -d.", "base32": "The label mentions a thirty-two-symbol alphabet. Try base32 -d.",
                        "hex": "Two hexadecimal digits travel together. Try hex -d.", "rot13": "The alphabet's two halves traded places. Try rot13.",
                        "layers": "One envelope is tucked inside another. Decode Base64 twice.", "url": "The address escaped its punctuation. Try url -d.",
                        "reverse": "The witness read the mirror instead of the page. Try rev.", "ascii": "The numbers are decimal byte values. Try ascii -d."}[kind]
            elif kind == "json":
                payload = "receipt.json"
                artifacts[f"{folder}/{payload}"] = json.dumps({"city": scene, "evidence": {"verified": {"message": flag}}, "decoy": "follow the evidence"}).encode()
                clue = "The verified message is nested inside the receipt. jq supports dotted object paths."
            elif kind == "logs":
                payload = "dispatch.txt"
                artifacts[f"{folder}/{payload}"] = f"courier=A status=cancelled evidence=decoy\ncourier=B status=verified evidence={flag}\ncourier=C status=pending evidence=wrong_turn\n".encode()
                clue = "Only a verified courier is a witness. Search the dispatch log with grep."
            elif kind == "strings":
                payload = "fragment.bin"
                artifacts[f"{folder}/{payload}"] = b"\x00\x01\x02" + data + b"\x00\x03\x04"
                clue = "The packet is damaged, but printable evidence remains. Try strings."
            elif kind == "caesar":
                shift = index % 24 + 1
                artifacts[f"{folder}/{payload}"] = (caesar(flag, shift) + "\n").encode()
                clue = f"A Caesar wheel advanced {shift} places. Reverse it with caesar {26 - shift}."
            elif kind == "xor":
                key = (index * 7 + 33) % 256
                artifacts[f"{folder}/{payload}"] = (bytes(b ^ key for b in data).hex() + "\n").encode()
                clue = f"Each byte was XORed with hex key {key:02x}, then hex-encoded. Try xor {key:02x}."
            elif kind == "frames":
                chunks = [flag[i:i+12] for i in range(0, len(flag), 12)]
                frames = [f"{i:02}:{chunk}" for i, chunk in enumerate(chunks)]
                random.Random(scene).shuffle(frames)
                artifacts[f"{folder}/{payload}"] = ("\n".join(frames) + "\n").encode()
                clue = "A camera shuffled the numbered frames. sort, cut -d ':' -f 2, then tr -d '\\n' restores the message."
            elif kind == "hash":
                payload = "fingerprint.txt"
                artifacts[f"{folder}/{payload}"] = (hashlib.sha256(data).hexdigest() + "\n").encode()
                for witness in range(4):
                    candidate = flag if witness == index % 4 else f"CLITE{{unverified_witness_{scene}_{witness}}}"
                    # No newline: the fingerprint is over the exact flag bytes.
                    artifacts[f"{folder}/witness-{witness}.txt"] = candidate.encode()
                clue = "Only one witness matches the SHA-256 fingerprint. Hash the witness files and recover that exact statement."
            else:
                payload = "parcel.json"
                artifacts[f"{folder}/{payload}"] = json.dumps({"parcel": {"encoding": "base64 twice", "message": base64.b64encode(base64.b64encode(data)).decode()}}).encode()
                clue = "Find parcel.message with jq, remove its JSON quotes using tr -d '\"', then unwrap both Base64 layers."
            entry.update(category=kind, location=f"casebook/{scene}/{payload}", hint=clue, surface="workspace")
            artifacts[f"{folder}/README.md"] = f"# {entry['title']}\n\n{act}\n\n{setup}\n\nAt {scene.replace('-', ' ')}, a folded note reads:\n{clue}\n\nInspect {payload}. Submit evidence with:\ncheck {scene} 'CLITE{{your_recovered_evidence}}'\n\nA correct statement reveals the next scene.\n".encode()
        else:
            kind = ["source", "stylesheet", "svg", "robots", "headers"][web % 5]
            web += 1
            encoded = base64.b64encode(data).decode()
            note = f"case:{scene} | base64:{encoded} | return to the practice terminal: check {scene} FLAG"
            if kind == "source":
                target = ["public/index.html", "public/terminal.html", "public/hunt/archive.html", "public/hunt/timeline.html"][(web - 1) // 5]
                entry["location"] = "/" if target.endswith("index.html") else "/demo" if target.endswith("terminal.html") else target.removeprefix("public/")
                entry["location"] = "/" + entry["location"].lstrip("/")
                entry["injection"] = target
                entry["note"] = note
                clue = "The visible page says less than its HTML source. Inspect the comment, then decode its Base64 evidence."
            elif kind == "stylesheet":
                entry.update(location="/style.css", injection="public/style.css", note=note)
                clue = "A stylesheet can carry a margin note without changing the design. Read its comments."
            elif kind == "svg":
                entry.update(location="/hunt/bengal.svg", injection="public/hunt/bengal.svg", note=note)
                clue = "The river drawing has metadata that its pixels cannot tell you. Inspect the SVG source."
            elif kind == "robots":
                entry["location"] = f"/hunt/{scene}.txt"
                artifacts[f"public/hunt/{scene}.txt"] = (note + "\n").encode()
                clue = "A crawler's instructions point to a forgotten note. Inspect /robots.txt and follow the matching path."
            else:
                target = ["/", "/demo", "/api/capabilities", "/healthz"][(web - 1) // 5]
                header = "X-Clite-" + scene
                entry.update(location=target, header=header)
                headers.setdefault(target, {})[header] = "base64:" + encoded
                clue = f"Inspect the response header {header} on {target}. Browser DevTools Network shows it; the value uses Base64."
            entry.update(category=kind, hint=clue, surface="website")
        entries.append(entry)
    return entries, artifacts, headers


def main(check=False):
    entries, artifacts, headers = build()
    public_entries = [{k: v for k, v in entry.items() if k not in {"injection", "note"}} for entry in entries]
    artifacts["data/story.json"] = (json.dumps(public_entries, indent=2) + "\n").encode()
    artifacts["data/story-headers.json"] = (json.dumps(headers, indent=2) + "\n").encode()
    artifacts["templates/demo/CASEFILE.md"] = ("# The green cursor case\n\nA fictional dispatch has vanished from Tahmid's CTF workspace on a rainy Dhaka evening. Bookshop margins, river crossings and borrowed detective names trace its route.\n\nStart with case. Inspect each scene, recover its CLITE{...} evidence, then use check CASE-ID FLAG. Every accepted statement reveals the next lead. Some leads cross into this website: use your browser's source view and Network tools, then return here.\n\nThe familiar detectives are cultural references in an original practice story; no knowledge of their books or films is required to solve the evidence.\n\nOpening lead: casebook/padma-dispatch/README.md\n").encode()
    artifacts["public/hunt/archive.html"] = b'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>The monsoon archive</title><link rel="stylesheet" href="/style.css"></head><body class="plain"><main class="message"><h1>The archive</h1><p>The archivist trusts margins more than headlines. Return to your case file when the evidence is clear.</p><a href="/demo">Return to the terminal</a></main></body></html>\n'
    artifacts["public/hunt/timeline.html"] = b'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>The night train</title><link rel="stylesheet" href="/style.css"></head><body class="plain"><main class="message"><h1>The night train</h1><p>Every crossing leaves a trace. The conductor keeps the final note behind the timetable.</p><a href="/demo">Return to the terminal</a></main></body></html>\n'
    svg_notes = "\n".join(entry["note"] for entry in entries if entry.get("injection", "").endswith("bengal.svg"))
    artifacts["public/hunt/bengal.svg"] = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200"><title>River dispatch</title><metadata>{svg_notes}</metadata><rect width="600" height="200" fill="#050805"/><path d="M0 100 Q150 0 300 100 T600 100" fill="none" stroke="#40ff7a" stroke-width="4"/><text x="20" y="175" fill="#d7ffd7">The river remembers the route.</text></svg>\n'.encode()
    robots = "User-agent: *\n# The bookshop keeper left a crawler's route through the case.\n" + "".join(f"Disallow: {entry['location']}\n" for entry in entries if entry["category"] == "robots")
    artifacts["public/robots.txt"] = robots.encode()
    artifacts["public/.well-known/security.txt"] = b"Contact: mailto:admin@tahmidkhan.com.bd\nCanonical: https://clite.tahmidkhan.com.bd/.well-known/security.txt\n# For the fictional case, consult the crawler's route at /robots.txt\n"
    for entry in entries:
        target = entry.get("injection")
        if not target or target.endswith("bengal.svg"):
            continue
        content = artifacts.get(target, (ROOT / target).read_bytes() if (ROOT / target).exists() else b"").decode()
        # Replace only the authored trail block, preserving all application/UI code.
        import re
        if target.endswith(".css"):
            content = re.sub(r"/\* CLITE_CASE_TRAIL.*?END_CLITE_CASE_TRAIL \*/\n?", "", content, flags=re.S)
        else:
            content = re.sub(r"<!-- CLITE_CASE_TRAIL.*?END_CLITE_CASE_TRAIL -->\n?", "", content, flags=re.S)
        notes = "\n".join(e["note"] for e in entries if e.get("injection") == target)
        block = f"/* CLITE_CASE_TRAIL\n{notes}\nEND_CLITE_CASE_TRAIL */\n" if target.endswith(".css") else f"<!-- CLITE_CASE_TRAIL\n{notes}\nEND_CLITE_CASE_TRAIL -->\n"
        artifacts[target] = (content.rstrip() + "\n" + block).encode()
    failures = []
    for name, data in artifacts.items():
        dest = ROOT / name
        if check:
            if not dest.exists() or dest.read_bytes().replace(b"\r\n", b"\n") != data.replace(b"\r\n", b"\n"):
                failures.append(name)
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
    if failures:
        raise SystemExit("Story artifacts need regeneration: " + ", ".join(failures))


if __name__ == "__main__":
    main("--check" in sys.argv)
