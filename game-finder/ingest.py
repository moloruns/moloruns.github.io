"""Download, validate, and import the reproducible Steam sample into Chroma."""

import argparse
import hashlib
import html
import json
import os
from contextlib import contextmanager
import fcntl
from pathlib import Path
import re
import sys
import tempfile
import time
import urllib.request

import chromadb
from chromadb.config import Settings
from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2
from tokenizers import Tokenizer

ROOT = Path(__file__).resolve().parent
REVISION = "6a31fcb42082345acc817e176b28849b7c05f248"
CSV_SHA256 = "1b48008b01a799d82385d6e66ba0cb65dd477b6aa4b6c2ec8c443025ab6880ad"
CSV_URL = f"https://huggingface.co/datasets/FronkonGames/steam-games-dataset/resolve/{REVISION}/games.csv"
LEGACY_COLLECTION = "game_search_sentences_v1"
COLLECTION_NAME = "game_catalog_v2"  # Actual names include target and manifest identity.
TARGET_TOKENS = 100
SENTENCE_MIN_TOKENS = 40
GENRES = {"Action", "Adventure", "Casual", "Indie", "Massively Multiplayer",
          "Racing", "RPG", "Simulation", "Sports", "Strategy"}


def verify_csv(path):
    with path.open("rb") as source:
        if hashlib.file_digest(source, "sha256").hexdigest() != CSV_SHA256:
            raise ValueError("CSV checksum differs from the pinned dataset; see catalog_manifest.json for the expected source and checksum.")


def download_csv(path=None):
    """Publish a download only after verification; leave existing files untouched."""
    path = Path(path) if path is not None else ROOT / "data" / "games.csv"
    if path.exists():
        verify_csv(path)
        print("Existing CSV verified; no download needed.")
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, suffix=".part", delete=False) as output:
            temporary = Path(output.name)
            with urllib.request.urlopen(CSV_URL, timeout=60) as response:
                total = 0
                while block := response.read(8 * 1024 * 1024):
                    output.write(block)
                    total += len(block)
                    print(f"Downloaded {total / 1_000_000:.1f} MB", flush=True)
        verify_csv(temporary)
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    print("CSV download complete; checksum verified.")
    return path


def clean_description(text):
    """Shared cleaning rule for imported descriptions and future user additions."""
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", text)).split())


def embedding_tools():
    embedding = ONNXMiniLM_L6_V2(preferred_providers=["CPUExecutionProvider"])
    # Keep downloads inside the project rather than a global home-directory cache.
    embedding.DOWNLOAD_PATH = ROOT / "data" / "embedding_model"
    tokenizer_path = embedding.DOWNLOAD_PATH / "onnx" / "tokenizer.json"
    model_files = ("tokenizer.json", "model.onnx", "config.json", "vocab.txt",
                   "special_tokens_map.json", "tokenizer_config.json")
    if not all((tokenizer_path.parent / name).exists() for name in model_files):
        print("Downloading the local embedding model (first run only)...", flush=True)
        embedding(["Initialize the local model."])
    tokenizer = Tokenizer.from_file(str(tokenizer_path))
    # A separate tokenizer measures full text without the model's truncation/padding.
    tokenizer.no_truncation()
    tokenizer.no_padding()
    return embedding, tokenizer


def selected_games(path=None, target=800):
    from catalog import selected_games as select_catalog
    return select_catalog(path, target)


def chunks(text, tokenizer, target_tokens=TARGET_TOKENS, sentence_min_tokens=SENTENCE_MIN_TOKENS):
    """Pack sentences toward a budget; every passage stays within 240 tokens.

    Keep substantial sentences separate; combine fragments shorter than 40
    tokens, aiming for at most 100. A single unbroken source token may exceed the
    target. Keep it intact in its own passage if it still fits the hard limit.
    """
    def size(value):
        return len(tokenizer.encode(value).ids)  # Includes special tokens.

    current = ""
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        if current and sentence_min_tokens is not None and size(current) >= sentence_min_tokens:
            yield current
            current = ""
        units = [sentence] if size(sentence) <= target_tokens else sentence.split()
        for unit in units:
            if size(unit) > 240:
                raise ValueError("A single word exceeds the embedding limit.")
            if size(unit) > target_tokens:
                if current:
                    yield current
                    current = ""
                yield unit
                continue
            combined = f"{current} {unit}".strip()
            if current and size(combined) > target_tokens:
                yield current
                current = unit
            else:
                current = combined
    if current:
        yield current


def store_path(store=None):
    return Path(store).resolve() if store is not None else ROOT / "chroma_store"


def client_for(store=None):
    return chromadb.PersistentClient(path=str(store_path(store)),
                                    settings=Settings(anonymized_telemetry=False))


@contextmanager
def store_lock(store=None, lock_name=".catalog.lock"):
    """Prevent additions racing with activation/reconciliation (macOS/Linux CLI)."""
    path = store_path(store)
    path.mkdir(parents=True, exist_ok=True)
    with (path / lock_name).open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ValueError("This store is in use. Close its other Game Finder session and retry.") from error
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def candidate_name(target=800):
    from catalog import identity, load_manifest
    return f"{COLLECTION_NAME}_{target}_{identity(load_manifest(target))[:12]}"


def active_name(store=None):
    path = store_path(store) / "active_catalog.json"
    if path.exists():
        try:
            value = json.loads(path.read_text())
            if value.get("version") != 1 or not isinstance(value.get("collection"), str):
                raise ValueError
            collection = client_for(store).get_collection(value["collection"])
            if value.get("catalog_identity") != collection.metadata.get("catalog_identity", "legacy-v1"):
                raise ValueError
            return value["collection"]
        except (ValueError, KeyError, chromadb.errors.ChromaError) as error:
            raise ValueError("Invalid active catalog pointer; restore it before changing catalogs.") from error
    if LEGACY_COLLECTION in {c.name for c in client_for(store).list_collections()}:
        return LEGACY_COLLECTION
    return candidate_name()


def validate_policy(collection, target=800):
    meta = collection.metadata or {}
    if meta.get("revision") != REVISION:
        raise ValueError("Collection uses another dataset revision.")
    if (meta.get("target_tokens") != TARGET_TOKENS or
            meta.get("sentence_min_tokens") != SENTENCE_MIN_TOKENS):
        raise ValueError("Collection uses another chunking policy.")
    if collection.name != LEGACY_COLLECTION:
        from catalog import identity, load_manifest, MODEL
        if meta.get("model") != json.dumps(MODEL, sort_keys=True):
            raise ValueError("Collection uses another embedding model configuration.")
        if meta.get("catalog_identity") != identity(load_manifest(target)):
            raise ValueError("Collection identity does not match the selected catalog manifest.")


def open_collection(embedding, store=None, collection_name=None, target=800):
    from catalog import identity, load_manifest, MODEL
    name = collection_name or candidate_name(target)
    metadata = {"ready": False, "revision": REVISION,
                "target_tokens": TARGET_TOKENS, "sentence_min_tokens": SENTENCE_MIN_TOKENS}
    if name != LEGACY_COLLECTION:
        metadata.update(catalog_identity=identity(load_manifest(target)), target_games=target,
                        model=json.dumps(MODEL, sort_keys=True))
    collection = client_for(store).get_or_create_collection(
        name, embedding_function=embedding, configuration={"hnsw": {"space": "cosine"}}, metadata=metadata)
    validate_policy(collection, target)
    return collection


def validate_ready(collection, target=800):
    validate_policy(collection, target)
    if not collection.metadata.get("ready"):
        raise ValueError("Catalog build is incomplete; rerun ingestion before activation.")
    ids = {id for id in collection.get(include=[])["ids"] if id.startswith("steam:")}
    if len(ids) != collection.metadata.get("chunks"):
        raise ValueError("Imported chunk count is inconsistent. Run ingest.py to repair.")
    if collection.name != LEGACY_COLLECTION:
        from catalog import load_manifest
        expected_games = {g["app_id"] for g in load_manifest(target)["games"]}
        stored = collection.get(include=["metadatas"])
        actual_games = {m["app_id"] for id, m in zip(stored["ids"], stored["metadatas"]) if id.startswith("steam:")}
        if actual_games != expected_games or collection.metadata.get("games") != target:
            raise ValueError("Imported games do not match the catalog manifest.")
        expected_hash = hashlib.sha256("\n".join(sorted(ids)).encode()).hexdigest()
        if collection.metadata.get("imported_ids_sha256") != expected_hash:
            raise ValueError("Imported passage IDs differ from the verified build.")


def migrate_users(source, destination):
    """Union user additions in either direction; reject conflicting UUIDs."""
    if source.name == destination.name:
        return 0
    stored = source.get(include=["documents", "metadatas"])
    users = [(id, doc, meta) for id, doc, meta in zip(stored["ids"], stored["documents"], stored["metadatas"])
             if id.startswith("user:")]
    existing = destination.get(include=["documents", "metadatas"])
    saved = {id: (doc, meta) for id, doc, meta in zip(existing["ids"], existing["documents"], existing["metadatas"])}
    if any(id in saved and saved[id] != (doc, meta) for id, doc, meta in users):
        raise ValueError("Conflicting user record IDs; both collections have been retained.")
    pending = [(id, doc, meta) for id, doc, meta in users if id not in saved]
    # Re-embed to avoid assuming undocumented model compatibility in legacy data.
    for start in range(0, len(pending), 50):
        batch = pending[start:start + 50]
        destination.upsert(ids=[r[0] for r in batch], documents=[r[1] for r in batch], metadatas=[r[2] for r in batch])
    verified = destination.get(ids=[r[0] for r in users], include=["documents", "metadatas"]) if users else None
    if verified:
        actual = {id: (doc, meta) for id, doc, meta in zip(verified["ids"], verified["documents"], verified["metadatas"])}
        if any(actual.get(id) != (doc, meta) for id, doc, meta in users):
            raise ValueError("User-record migration verification failed.")
    return len(pending)


def activate_collection(embedding, name, store=None, target=800):
    """Call while holding store_lock; preserve notes and additions on rollback too."""
    destination = client_for(store).get_collection(name, embedding_function=embedding)
    validate_ready(destination, target)
    old_name = active_name(store)
    if old_name != name and old_name in {c.name for c in client_for(store).list_collections()}:
        source = client_for(store).get_collection(old_name, embedding_function=embedding)
        print(f"Preserved {migrate_users(source, destination)} additional user passages.", flush=True)
    from database import load_shortlist
    load_shortlist(store_path(store) / "shortlist.json")  # Validate; never rewrite snapshots/notes.
    pointer = {"version": 1, "collection": name,
               "catalog_identity": destination.metadata.get("catalog_identity", "legacy-v1")}
    path = store_path(store) / "active_catalog.json"
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, suffix=".tmp", delete=False) as output:
            temporary = Path(output.name)
            json.dump(pointer, output, indent=2)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    print(f"Active catalog: {name}", flush=True)
    return destination


def build_records(games, tokenizer, target_tokens=TARGET_TOKENS, sentence_min_tokens=SENTENCE_MIN_TOKENS):
    records = []
    for row in games:
        for index, passage in enumerate(chunks(row["description"], tokenizer, target_tokens, sentence_min_tokens)):
            metadata = {"app_id": row["AppID"], "title": row["Name"],
                        "source": f"https://store.steampowered.com/app/{row['AppID']}/",
                        "revision": REVISION, "chunk_index": index,
                        "genres": row["Genres"], "tags": row["Tags"]}
            for platform in ["Windows", "Mac", "Linux"]:
                if row[platform] not in {"True", "False"}:
                    raise ValueError(f"Invalid platform value for {row['AppID']}")
                metadata[platform.lower()] = row[platform] == "True"
            records.append((f"steam:{row['AppID']}:{index}", passage, metadata))
    return records


def import_records(collection, records):
    """Repair missing/changed imported records without touching user:* entries."""
    expected = {r[0] for r in records}
    if not records or len(expected) != len(records) or any(not id.startswith("steam:") for id in expected):
        raise ValueError("Import records must have unique steam: IDs and must not be empty.")
    existing = collection.get(include=["documents", "metadatas"])
    saved = {id: (document, metadata) for id, document, metadata in
             zip(existing["ids"], existing["documents"], existing["metadatas"])}
    unexpected = {id for id in saved if id.startswith("steam:")} - expected
    if unexpected:
        raise ValueError("Store contains a different Steam subset; use a separate store.")
    pending = [r for r in records if saved.get(r[0]) != (r[1], r[2])]
    print(f"Import: {len(records)} passages; {len(records) - len(pending)} unchanged; "
          f"{len(pending)} to embed/store.", flush=True)
    collection.modify(metadata={**collection.metadata, "ready": False})
    started = time.perf_counter()
    for start in range(0, len(pending), 50):
        batch = pending[start:start + 50]
        collection.upsert(ids=[r[0] for r in batch], documents=[r[1] for r in batch],
                          metadatas=[r[2] for r in batch])
        done = start + len(batch)
        elapsed = time.perf_counter() - started
        print(f"Stored {done}/{len(pending)} passages ({elapsed:.1f}s elapsed)", flush=True)
        if start == 0:
            print(f"Estimated total embedding time: {elapsed * len(pending) / done:.1f}s", flush=True)
    imported_ids = {id for id in collection.get(include=[])["ids"] if id.startswith("steam:")}
    if imported_ids != expected:
        raise ValueError("Imported record IDs failed verification.")
    game_count = len({r[2]["app_id"] for r in records})
    collection.modify(metadata={**collection.metadata, "ready": True, "revision": REVISION,
                                "games": game_count, "chunks": len(records),
                                "imported_ids_sha256": hashlib.sha256("\n".join(sorted(expected)).encode()).hexdigest()})
    print(f"Verified {game_count} source games / {len(records)} imported passages; "
          f"{collection.count()} total records.", flush=True)
    return len(pending)


def prepare_collection(embedding, tokenizer, store=None, collection_name=None, target=None):
    name = collection_name or (candidate_name(target) if target is not None else active_name(store))
    actual_target = target or (750 if name.startswith(f"{COLLECTION_NAME}_750_") else 800)
    collection = open_collection(embedding, store, name, actual_target)
    if collection.metadata.get("ready"):
        validate_ready(collection, actual_target)
        return collection
    if name == LEGACY_COLLECTION:
        raise ValueError("Legacy catalog is incomplete; use the versioned catalog importer.")
    print(f"Preparing the {actual_target}-game catalog; subsequent launches reuse it.", flush=True)
    import_records(collection, build_records(selected_games(target=actual_target), tokenizer))
    validate_ready(collection, actual_target)
    return collection


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true", help="Download the pinned CSV if missing.")
    parser.add_argument("--store", type=Path, help="Optional separate database directory.")
    parser.add_argument("--target", type=int, choices=[750, 800], default=800)
    parser.add_argument("--collection", help="Existing collection to activate, including legacy rollback.")
    parser.add_argument("--activate", action="store_true", help="Reconcile user additions and atomically switch the default.")
    args = parser.parse_args()
    if args.collection and not args.activate:
        parser.error("--collection is only for activating an existing verified collection.")
    if args.download:
        download_csv()
    embedding, tokenizer = embedding_tools()
    with store_lock(args.store, f".build-{candidate_name(args.target)}.lock"):
        if args.collection:
            target = 750 if args.collection.startswith(f"{COLLECTION_NAME}_750_") else args.target
            with store_lock(args.store):
                activate_collection(embedding, args.collection, args.store, target)
            return
        games = selected_games(target=args.target)
        records = build_records(games, tokenizer)
        print(f"Verified source revision {REVISION}; selected {len(games)} games / {len(records)} passages.", flush=True)
        collection = open_collection(embedding, args.store, target=args.target)
        print(f"Candidate catalog: {collection.name}", flush=True)
        import_records(collection, records)
        validate_ready(collection, args.target)
        with store_lock(args.store):
            old_name = active_name(args.store)
            if old_name != collection.name and old_name in {c.name for c in client_for(args.store).list_collections()}:
                print(f"Preserved {migrate_users(client_for(args.store).get_collection(old_name, embedding_function=embedding), collection)} user passages.")
            if args.activate:
                activate_collection(embedding, collection.name, args.store, args.target)



if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped; rerun the import to resume.")
        sys.exit(130)
    except (ValueError, OSError) as error:
        print(f"Ingestion: {error}", file=sys.stderr)
        sys.exit(1)

