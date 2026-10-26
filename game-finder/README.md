## AI acknowledgment

OpenAI Codex assisted with planning, implementation, testing, evaluation, and this README. The app's purpose and experience examples came from my descriptions. The development prompts are recorded separately in [prompt_log.md](prompt_log.md).

# Game Finder: Semantic Game Search

A command-line vector database app for finding games from remembered details or describing something you want to play. It searches **800 games**, stored as **6,076 description passages** in ChromaDB, and returns up to five candidates with source excerpts.

**Search games** accepts a title, remembered details, or an experience you want to play in one place.

You can inspect which parts of your request match the stored descriptions or tags, compare games, refine your search, save a shortlist, and **add new games while the app is running**.

## Install and run

Tested on macOS with Python 3.11 and `chromadb==1.5.9`. From the repository's `game-finder/` folder:

```sh
python3.11 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python ingest.py --download
bash run
```

Setup downloads a roughly 401 MB dataset and an 83 MB embedding model, then builds the database. The measured import took about nine minutes, excluding downloads. No API key or Steam login is needed; searches run locally.

For later sessions, run `bash run`. The database, additions, and shortlist persist under `game-finder/chroma_store/`. The first enhanced search also caches source-label vectors using the existing model.

If macOS reports `CERTIFICATE_VERIFY_FAILED` during the CSV download, retry with the installed certificate bundle:

```sh
SSL_CERT_FILE="$(.venv/bin/python -m certifi)" .venv/bin/python ingest.py --download
```

## Example search and query explanations

Choose **1. Search games** and enter a title or description:

```text
1. Search games
2. Add a game
3. View shortlist
4. Database statistics
5. Quit
Choose: 1
Game title, remembered details, or experience you want: stealth and puzzle solving
```

The default search considers the whole request and separate aspects such as **stealth** and **puzzle solving**. Here is an explanation excerpt for [Batman™: Arkham Knight](https://store.steampowered.com/app/208650/) from a recorded run:

```text
Request aspect: stealth — description wording and source labels match
  Matching source labels: Stealth
  Players will become The World’s Greatest Detective like never before with the introduction
  of the Batmobile and enhancements to signature features such as FreeFlow Combat, stealth,
  forensics and navigation.
Request aspect: puzzle solving — mentioned in description
  This iconic vehicle also augments Batman’s abilities in every respect, from navigation and
  forensics to combat and puzzle solving creating a genuine and seamless sense of the union
  of man and machine.
```

The explanations show **which query aspects match source wording or tags**. Each description sentence is quoted once; repeated evidence points back to the excerpt above. Tag-only matches are labelled separately. Other aspects may show **“no direct source match; semantic suggestion only,”** conflicting wording, or an unverified exclusion. A romance tag does not establish a tragic ending. Missing evidence stays unknown.

Results include source links and vector distances. Lower distance means closer embedding similarity, not confidence. Default ranking also considers source coverage and relevance across aspects, so distance alone does not determine order.

After searching, choose:

- **`c`** to compare 2–3 results using their platforms, genres, tags, and excerpts.
- **`r`** to revise your description and search again.
- **`s`** to save a candidate, its search evidence, and your own note.
- **`b`** to return to the menu.

## Add a game and search it immediately

1. Choose **2. Add a game**. Enter a title and description; a blank line finishes the description.
2. Optionally enter a source, genres, and Windows/macOS/Linux support. Leave unknown details blank.
3. Return to **Search games** and describe the game. It is searchable immediately, without restarting, and remains available next session.

For a clearly labelled **synthetic demo**, try:

```text
Title: Algae Lantern (demo fixture)
Description: Pilot glass submarines through glowing caverns to harvest
bioluminescent algae. Cultivate underwater gardens and trade luminous
seeds with traveling botanists.

Source: Synthetic demo fixture
```

Then search `pilot glass submarines to harvest bioluminescent algae`. **4. Database statistics** shows imported and user-added counts separately.

To quit, enter `5`, `q`, `quit`, or `exit` at the main menu, or press **Ctrl+C**. Completed additions and shortlist saves remain stored. `/cancel` returns from an input task.

## Two example queries

These exact queries were tested using the default **enhanced** search on the 800-game catalog. The results below were recorded on October 26, 2026. Enhanced search combines description vectors with keywords and source metadata; rankings can change after additions or updates.

### 1. `something with cooking and adventure`

```sh
bash test "something with cooking and adventure"
```

| Rank | Game | Vector distance |
| --- | --- | --- |
| 1 | [Black Desert](https://store.steampowered.com/app/582660/) | 0.582 |
| 2 | [Core Keeper](https://store.steampowered.com/app/1621690/) | 0.534 |
| 3 | [The Supper](https://store.steampowered.com/app/1171370/) | 0.591 |
| 4 | [The Hungry Lamb: Traveling in the Late Ming Dynasty](https://store.steampowered.com/app/2593370/) | 0.736 |
| 5 | [Fields of Mistria](https://store.steampowered.com/app/2142790/) | 0.585 |

Black Desert's description lists cooking among its life-skill activities and describes an open-world adventure. Core Keeper's retrieved passage mentions recipes and an underground adventure, while its **Cooking** tag supplies the direct cooking match. The explanations distinguish description wording from tag-only matches so you can inspect how each result relates to the request.

### 2. `something about action and romance`

```sh
bash test "something about action and romance"
```

| Rank | Game | Vector distance |
| --- | --- | --- |
| 1 | [Mass Effect™ Legendary Edition](https://store.steampowered.com/app/1328670/) | 0.542 |
| 2 | [Tales of Arise](https://store.steampowered.com/app/740130/) | 0.708 |
| 3 | [9-nine-:Episode 2](https://store.steampowered.com/app/1033420/) | 0.720 |
| 4 | [Dragon Age™: The Veilguard](https://store.steampowered.com/app/1845910/) | 0.740 |
| 5 | [Pathfinder: Wrath of the Righteous - Enhanced Edition](https://store.steampowered.com/app/1184370/) | 0.777 |

Mass Effect's description mentions action and interactive storytelling, while its **Romance** source tag supplies the romance match. The explanation identifies that distinction and quotes the description once. Other candidates also rely on tags for some aspects; inspect their evidence to judge whether their kind of action or romance fits your request.

Both queries share words with some descriptions or tags. These examples demonstrate the combined search and its explanations.

## Things to try

- Ask for an exclusion, such as `a horror game without jump scares`. Check which descriptions actually establish the absence and which remain uncertain.
- Compare two candidates, refine the request, and save a result with a personal note. Reopen the app and view the shortlist.
- Add a game you know, search it immediately, then reopen the app and search again.
- Try an unrelated or nonsense query. The app can still show misleading neighbors; its weak-match cutoff does not reliably reject every bad request.

For a single search without the full menu, use `bash test "your description"`. Run `bash test` for repeated searches and enter `/quit` to leave.

## Data and how the search works

The public [FronkonGames Steam dataset](https://huggingface.co/datasets/FronkonGames/steam-games-dataset) contains **125,855 entries** in the pinned snapshot. The app selects 800 games using review volume/reception and disclosed demo inclusions. The [selection manifest](catalog_manifest.json) lists the games and records the source revision, checksum, and selection rules.

**One database item is a passage from a game's description.** Longer descriptions are split to fit the embedding model. Metadata retains the game ID, title, source link, genres, tags, platform support, and passage number. Multiple passages can belong to one game.

[ingest.py](ingest.py) prepares the data and embeddings. The app uses Chroma's persistent local storage and **all-MiniLM-L6-v2**. Default search combines description vectors with keyword retrieval over titles, metadata, and descriptions, then ranks candidates using query aspects and source clues. [app.py](app.py) provides the menu; [database.py](database.py) handles additions and shortlist storage.

Keep both catalog manifests alongside the code: the default uses `catalog_manifest.json`, and `catalog_manifest_750.json` supports the optional 750-game catalog. Runtime data lives in `data/` (CSV, embedding model, and label cache) and `chroma_store/` (database and saved shortlist). These folders and `.venv/` are ignored by Git.

## Current limits and further details

Descriptions omit details, tags can mislead, and backstory wording can be mistaken for gameplay. Explanations are source clues, not verified features. Complex requests, narrative relationships, and exclusions still produce poor matches. Added games can change rankings.

Use `bash test --method vector "your description"` to inspect description-only vector search. Add `--compare` to include the keyword baseline. The `tests/` folder checks search behavior, additions, shortlist persistence, and catalog imports using temporary stores.

To run the automated checks:

```sh
.venv/bin/python -m unittest discover -s tests -v
```
