## AI acknowledgment

OpenAI Codex assisted with implementation, testing, and this README. The development prompts are in [prompt_log.md](prompt_log.md).

# Game Finder

A command-line app for finding games by title, remembered details, or an experience you want to play. It searches **800 games** in ChromaDB and shows up to five results with source excerpts and explanations for different parts of your query.

Games are a useful choice for this demo because people often remember a mechanic or describe a mood without knowing a title or a store's exact wording.

The games come from the public [FronkonGames Steam dataset](https://huggingface.co/datasets/FronkonGames/steam-games-dataset). The app imports 800 of its 125,855 entries as **6,076 description passages**. Descriptions are split at sentence boundaries, combining short fragments toward 100 model tokens and splitting longer sentences as needed; every passage stays within 240 tokens. One database item is a passage; its metadata includes the game's ID, title, source link, genres, tags, platforms, source revision, and passage index. Search results group passages into distinct games. The [catalog manifest](catalog_manifest.json) records the selection.

**ChromaDB** stores the vectors locally, using cosine distance. The embedding model is **all-MiniLM-L6-v2**, run locally through Chroma's ONNX implementation.

## Install and run

**You need Python 3.11 or newer. Python 3.11 is the tested version.** These instructions are for macOS/Linux; the app was tested on macOS with Chroma 1.5.9.

First, check that Python is installed:

```sh
python3.11 --version
```

If that command is missing, macOS users with Homebrew can install it with [`brew install python@3.11`](https://formulae.brew.sh/formula/python@3.11). If you need Homebrew, follow the instructions at [brew.sh](https://brew.sh/).

From the repository's main folder, run:

```sh
cd game-finder
python3.11 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python ingest.py --download
bash run
```

If you're already inside `game-finder/`, skip `cd game-finder`. If your Python command is `python3`, check `python3 --version`; you can use it in the environment-creation command if it reports 3.11 or newer. The remaining commands use the environment's own Python.

The raw dataset is not committed to this repository. `ingest.py --download` downloads the pinned CSV into `data/games.csv`, verifies its checksum, selects the games in the manifest, and loads their passages into ChromaDB. First setup downloads a roughly 401 MB CSV and an 83 MB model; later runs reuse the local files. No API key is needed.

**To open the app again, run `bash run` from `game-finder/`.** Your database, added games, and saved notes stay in `chroma_store/`. Keep `data/`, `.venv/`, and both catalog manifests in place.

If downloading reports `CERTIFICATE_VERIFY_FAILED`, retry with the installed certificate bundle:

```sh
SSL_CERT_FILE="$(.venv/bin/python -m certifi)" .venv/bin/python ingest.py --download
```

## Example session

Choose **1. Search games**:

```text
1. Search games
2. Add a game
3. View shortlist
4. Database statistics
5. Quit
Choose: 1
Game title, remembered details, or experience you want: stealth and puzzle solving
```

One result is **Batman: Arkham Knight**. Its explanation includes these source excerpts (shortened output):

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

The app distinguishes description matches, tag-only matches, and unknowns. It quotes each sentence once. A related excerpt or tag does not prove every part of your request.

After a search, use **`c`** to compare 2–3 games, **`r`** to refine your query, **`s`** to save a result with a note, or **`b`** to return. Choose **5** or press **Ctrl+C** to quit. `/cancel` cancels an input task.

## Add your own game

Choose **2. Add a game**, enter its title and description, then enter a blank line to finish. Source, genres, and platform details are optional.

For a synthetic demo, try:

```text
Title: Algae Lantern (demo fixture)
Description: Pilot glass submarines through glowing caverns to harvest bioluminescent algae.

Source: Synthetic demo fixture
```

Search `pilot glass submarines to harvest bioluminescent algae` immediately afterward. The new game is searchable without restarting and remains stored next time. **3. View shortlist** reopens saved results and notes; **4. Database statistics** shows imported and added counts.

## Two example queries

These are the default enhanced-search results. Additions or updates can change their order. Add `--compare` to either command to also show the simple keyword baseline, which counts distinct shared words in each description passage and keeps each game's best score.

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

**Keyword comparison:** The baseline's first five are Beacon Pines, AdVenture Capitalist, Terraria, Ori and the Will of the Wisps, and Kind Words (lo fi chill beats to write to). It misses all five enhanced results at this cutoff: it counts words such as `adventure` and even `something`, rather than assessing the combination of cooking and adventure. Relevant details can also occur in separate passages or source tags, which this baseline does not combine.

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

**Keyword comparison:** The baseline's first five are World of Tanks, Scarlet Hollow, Counter-Strike, Call of Duty: World at War, and Call of Duty®: Modern Warfare® 2 (2009). It again misses all five enhanced results at this cutoff. A passage containing `action` earns the same one-word score as a passage containing `romance`; matching both aspects across a game's description and tags is not rewarded. Ties use app ID order, rather than semantic relevance.

These comparisons show a limitation of the app's simple description-only keyword baseline, **not that every keyword search would miss these games**. Both queries share words with some descriptions or tags; a stronger keyword search that includes metadata could retrieve them. Enhanced search combines these clues with semantic similarity. Lower vector distance means closer embedding similarity; the default ranking also considers query-aspect coverage, so distances alone do not determine order.

## Things to try

- Search for a game by title, then describe its story or gameplay instead.
- Ask for `a horror game without jump scares` and inspect whether the source establishes that exclusion.
- Compare candidates, save a note, quit, and reopen the shortlist.
- Add a game you know and search for it immediately.
- Try an unrelated query. The app can still return misleading matches.

Descriptions can omit details, tags can mislead, and complex requests can produce poor results. The explanations help you inspect the evidence; they do not verify game features.

Start with [app.py](app.py): its comments explain the menu and demo steps. To run the automated checks:

```sh
.venv/bin/python -m unittest discover -s tests -v
```
