"""Runtime game additions, statistics, and an atomic local shortlist."""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import tempfile
from uuid import uuid4

from ingest import chunks, clean_description


def add_game(collection, tokenizer, title, description, source="", genres="", platforms=None):
    title = title.strip()
    description = clean_description(description)
    if not title or not description:
        raise ValueError("A title and a nonempty description are required.")
    if len(title) > 200 or len(description) > 20_000:
        raise ValueError("Use a title under 201 characters and a description up to 20,000 characters.")
    passages = list(chunks(description, tokenizer))
    game_id = f"user:{uuid4()}"
    metadata = {"app_id": game_id, "title": title, "source": source.strip() or "User-provided",
                "origin": "user", "created_at": datetime.now(timezone.utc).isoformat()}
    if genres.strip():
        metadata["genres"] = genres.strip()
    for name, value in (platforms or {}).items():
        if name not in {"windows", "mac", "linux"} or type(value) is not bool:
            raise ValueError("Platform values must be known Windows/macOS/Linux booleans; omit unknowns.")
        metadata[name] = value
    ids = [f"{game_id}:{index}" for index in range(len(passages))]
    metadatas = [{**metadata, "chunk_index": index} for index in range(len(passages))]
    try:
        for start in range(0, len(passages), 50):
            collection.add(ids=ids[start:start + 50], documents=passages[start:start + 50],
                           metadatas=metadatas[start:start + 50])
        if set(collection.get(ids=ids, include=[])["ids"]) != set(ids):
            raise ValueError("The added passages could not be verified.")
    except (Exception, KeyboardInterrupt):
        # These IDs belong only to this attempt; never remove an imported/user game.
        collection.delete(ids=ids)
        raise
    return game_id, len(passages)


def statistics(collection):
    stored = collection.get(include=["metadatas"])
    groups = {"imported": set(), "user": set()}
    counts = {"imported": 0, "user": 0}
    for id, meta in zip(stored["ids"], stored["metadatas"]):
        group = "user" if id.startswith("user:") else "imported"
        groups[group].add(meta["app_id"])
        counts[group] += 1
    return {"games": sum(len(g) for g in groups.values()), "passages": len(stored["ids"]),
            "imported_games": len(groups["imported"]), "user_games": len(groups["user"]),
            "imported_passages": counts["imported"], "user_passages": counts["user"]}


def load_shortlist(path):
    path = Path(path)
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict) or payload.get("version") != 1:
            raise ValueError
        entries = payload["entries"]
        if not isinstance(entries, list):
            raise ValueError
        required = {"app_id", "title", "query", "mode", "source", "passage", "note", "saved_at"}
        seen = set()
        for entry in entries:
            if not isinstance(entry, dict) or not required <= entry.keys():
                raise ValueError
            if any(not isinstance(entry[key], str) for key in required):
                raise ValueError
            if not entry["app_id"] or entry["app_id"] in seen:
                raise ValueError
            if 'search_evidence' in entry:
                details = entry['search_evidence']
                if not isinstance(details, dict) or not isinstance(details.get('requirements'), list):
                    raise ValueError
                for item in details['requirements']:
                    if (not isinstance(item, dict) or not isinstance(item.get('label'), str) or
                            type(item.get('wanted')) is not bool or
                            item.get('state') not in {'supported', 'contradicted', 'unknown'} or
                            not isinstance(item.get('reason'), str) or not isinstance(item.get('evidence'), list)):
                        raise ValueError
                    if any(not isinstance(e, dict) or not isinstance(e.get('text'), str) for e in item['evidence']):
                        raise ValueError
            seen.add(entry["app_id"])
        return entries
    except (ValueError, KeyError, TypeError) as error:
        raise ValueError(f"Cannot read shortlist {path}; it has been left untouched.") from error


def save_candidate(path, candidate, query, mode, note=""):
    """Save the matching source passage and user context; preserve existing notes."""
    path = Path(path)
    entries = load_shortlist(path)
    meta, passage, distance = candidate
    if any(entry["app_id"] == meta["app_id"] for entry in entries):
        return False
    entry = {key: value for key, value in meta.items()
             if key in {"app_id", "title", "genres", "tags", "windows", "mac", "linux"}}
    entry.update({"query": query, "mode": mode, "source": meta.get("source") or "Unknown",
                  "passage": passage, "distance": float(distance), "note": note,
                  "saved_at": datetime.now(timezone.utc).isoformat()})
    if meta.get('_search'):
        entry['search_evidence'] = meta['_search']
    entries.append(entry)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         suffix=".tmp", delete=False) as output:
            temporary = Path(output.name)
            json.dump({"version": 1, "entries": entries}, output, indent=2, ensure_ascii=False)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return True
