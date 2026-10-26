"""JSON bridge for the SocksPls/hltv-api Python library."""

import json
import os
import sys

library_path = os.environ.get("HLTV_API_PATH")
if library_path:
    sys.path.insert(0, library_path)

try:
    import main as hltv
except Exception as error:
    raise SystemExit(f"Unable to import SocksPls/hltv-api: {error}") from error


def main() -> None:
    if len(sys.argv) != 4 or sys.argv[1] != "snapshot":
        raise SystemExit("Usage: hltv_client.py snapshot <start-date> <end-date>")

    start_date, end_date = sys.argv[2:]
    snapshot = {
        "topTeams": hltv.top30teams(),
        "upcoming": hltv.get_matches(),
        "results": hltv.get_results(),
    }
    try:
        snapshot["mapResults"] = hltv.get_results_by_date(start_date, end_date)
    except Exception as error:
        snapshot["mapResults"] = []
        snapshot["mapResultsError"] = str(error)
    print(json.dumps(snapshot))


if __name__ == "__main__":
    main()
