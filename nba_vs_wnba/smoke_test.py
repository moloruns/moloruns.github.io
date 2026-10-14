"""Run from the project folder or repository root with Python 3.13."""

from pathlib import Path

from streamlit.testing.v1 import AppTest

APP = Path(__file__).resolve().parent / "app.py"

at = AppTest.from_file(str(APP), default_timeout=180)
at.run()
assert not at.exception, [e.value for e in at.exception]

search = at.selectbox[0]
target = next(
    o for o in search.options
    if o.startswith("A'ja Wilson") and "WNBA" in o
)
search.select(target)
at.run()
assert not at.exception, [e.value for e in at.exception]
assert not at.error, [e.value for e in at.error]

labels = [b.label for b in at.button if b.label]
assert labels and "Anthony Davis" in labels[0], labels

# Exercise the ranked result's profile button and all three data tables.
profile_button = next(
    b for b in at.button if str(b.key).startswith("open_profile_button_")
)
profile_button.click().run()
assert not at.exception, [e.value for e in at.exception]
assert not at.error, [e.value for e in at.error]
assert at.title[0].value == "Anthony Davis"
assert [t.label for t in at.tabs] == [
    "Basic — per game", "Advanced", "Season totals",
]
assert len(at.dataframe) == 3
assert all(not table.value.empty for table in at.dataframe)

# Fixed season fixtures catch mixed percentage units (8.3%, not 830%).
advanced = at.dataframe[1].value.iloc[0]
assert advanced["TM_TOV_PCT"] == 8.3, advanced
assert abs(advanced["TS_PCT"] - 58.8) < 1e-9, advanced

at.button[0].click().run()
assert not at.exception, [e.value for e in at.exception]
assert not at.error, [e.value for e in at.error]
assert at.selectbox[0].format_func(at.selectbox[0].value) == target
print("OK:", labels[:3])
