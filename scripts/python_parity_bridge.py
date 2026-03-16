from __future__ import annotations

import json
import os
import sys
from dataclasses import asdict, is_dataclass
from pathlib import Path


def _bootstrap_reference_root() -> None:
    reference_root = os.environ.get("DISCOVERY_PYTHON_REFERENCE_ROOT")
    if not reference_root:
        return

    path = Path(reference_root).resolve()
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))


_bootstrap_reference_root()

from crawler.analysis.job_enrichment import normalize_salary
from crawler.detection.ats_detector import detect_ats
from crawler.linkedin.job_detail import parse_job_detail
from crawler.linkedin.search import parse_search_results


def _main() -> None:
    payload = json.loads(sys.stdin.read())
    result = _execute_case(payload)
    json.dump(result, sys.stdout)


def _execute_case(payload: dict[str, object]) -> object:
    kind = str(payload["kind"])
    raw_input = payload["input"]
    if not isinstance(raw_input, dict):
        raise ValueError("Parity input payload must be an object.")

    if kind == "linkedin_search_results":
        return [_normalize_output(job) for job in parse_search_results(str(raw_input["html"]))]

    if kind == "linkedin_job_detail":
        return _normalize_output(
            parse_job_detail(
                str(raw_input["html"]),
                job_id=str(raw_input["jobId"]),
                job_url=str(raw_input.get("jobUrl", "")),
            )
        )

    if kind == "ats_detection":
        return _normalize_output(
            detect_ats(
                raw_input.get("applyUrl"),
                easy_apply=bool(raw_input.get("easyApply", False)),
            )
        )

    if kind == "salary_normalization":
        return _normalize_output(normalize_salary(str(raw_input["text"])))

    raise ValueError(f"Unsupported parity case kind: {kind}")


def _normalize_output(value: object) -> object:
    if is_dataclass(value):
        return _normalize_keys(asdict(value))
    if isinstance(value, list):
        return [_normalize_output(item) for item in value]
    if isinstance(value, dict):
        return {key: _normalize_output(item) for key, item in value.items()}
    return value


def _normalize_keys(payload: dict[str, object]) -> dict[str, object]:
    key_map = {
        "job_id": "jobId",
        "job_url": "jobUrl",
        "posted_at": "postedAt",
        "apply_url": "applyUrl",
        "is_easy_apply": "isEasyApply",
        "applicant_count": "applicantCount",
        "ats_type": "atsType",
        "company_identifier": "companyIdentifier",
    }
    normalized: dict[str, object] = {}
    for key, value in payload.items():
        mapped_key = key_map.get(key, key)
        if is_dataclass(value):
            normalized[mapped_key] = _normalize_output(value)
        elif isinstance(value, list):
            normalized[mapped_key] = [_normalize_output(item) for item in value]
        elif isinstance(value, dict):
            normalized[mapped_key] = {
                nested_key: _normalize_output(nested_value)
                for nested_key, nested_value in value.items()
            }
        else:
            normalized[mapped_key] = value
    return normalized


if __name__ == "__main__":
    _main()
