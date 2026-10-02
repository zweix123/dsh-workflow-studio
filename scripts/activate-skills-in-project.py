#!/usr/bin/env python3
"""Sync skills from <root>/skills (source of truth) to <root>/.agents/skills and <root>/.claude/skills via symlinks.

Usage: python sync_skill.py <root>
"""

import argparse
import os
import sys
from pathlib import Path
from typing import Iterable

TARGET_SUBDIRS = (".agents/skills", ".claude/skills")
SKILL_MARKER = "SKILL.md"


def log(action: str, rel: str, name: str) -> None:
    print(f"{action:>8}: {rel}/{name}")


def warn(message: str) -> None:
    print(f"    warn: {message}", file=sys.stderr)


def clean_stale_symlinks(
    targets: Iterable[tuple[str, Path]],
    valid_targets: set[Path],
    source_dir: Path,
) -> None:
    for rel, target_dir in targets:
        if not target_dir.is_dir():
            continue
        for link in target_dir.iterdir():
            if not link.is_symlink():
                continue
            if not link.exists():
                link.unlink()
                log("removed", rel, link.name)
                continue
            try:
                resolved = link.resolve()
            except OSError:
                continue
            if source_dir in resolved.parents and resolved not in valid_targets:
                link.unlink()
                log("removed", rel, link.name)


def sync_skills(root: Path) -> None:
    source_dir = root / "skills"
    if not source_dir.is_dir():
        raise FileNotFoundError(f"Source directory not found: {source_dir}")
    source_dir = source_dir.resolve()

    skill_dirs: list[Path] = []
    for entry in sorted(source_dir.iterdir()):
        if not entry.is_dir():
            continue
        if (entry / SKILL_MARKER).is_file():
            skill_dirs.append(entry.resolve())
        else:
            warn(f"skills/{entry.name}: missing {SKILL_MARKER}, skipping")

    targets = [(rel, root / rel) for rel in TARGET_SUBDIRS]
    valid_targets = set(skill_dirs)

    clean_stale_symlinks(targets, valid_targets, source_dir)

    if not skill_dirs:
        print(f"No skill directories (containing {SKILL_MARKER}) found in {source_dir}")
        return

    for rel, target_dir in targets:
        target_dir.mkdir(parents=True, exist_ok=True)
        for skill in skill_dirs:
            link = target_dir / skill.name
            desired = Path(os.path.relpath(skill, target_dir))

            if link.is_symlink():
                current = Path(os.readlink(link))
                if current == desired:
                    log("skip", rel, skill.name)
                    continue
                link.unlink()
                link.symlink_to(desired)
                log("relinked", rel, skill.name)
                continue

            if link.exists():
                warn(
                    f"{rel}/{skill.name}: exists and is not a symlink, leaving untouched"
                )
                continue

            link.symlink_to(desired)
            log("linked", rel, skill.name)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "root", type=Path, help="project root that contains the skills/ directory"
    )
    args = parser.parse_args()

    project_root = args.root.expanduser().resolve()
    if not project_root.is_dir():
        print(f"Not a directory: {project_root}", file=sys.stderr)
        sys.exit(1)

    try:
        sync_skills(project_root)
    except FileNotFoundError as e:
        print(e, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()