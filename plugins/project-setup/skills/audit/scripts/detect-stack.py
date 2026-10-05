#!/usr/bin/env python3
"""
Deterministic stack detection for project-setup:audit.

Scans a project directory for manifest/config files that indicate what
languages, frameworks, databases, and infra tooling the project uses, and
prints a JSON report. This is a plain manifest scan, not a build — it doesn't
run any package manager or parse full dependency graphs. It exists so every
audit run gets the same answer instead of a subagent hand-rolling its own
(and inconsistent) glob logic each time.

Usage:
    python detect-stack.py <project-root>

Output: JSON object, one key per detected signal category, each a list of
{"file": <relative path>, "signal": <short label>} entries. Empty categories
are included with an empty list so callers can tell "checked, found nothing"
apart from "didn't check."
"""

import json
import os
import sys

# Directories never worth descending into for manifest detection.
SKIP_DIRS = {
    ".git", "node_modules", "dist", "build", "out", "bin", "obj",
    ".venv", "venv", "__pycache__", ".next", ".nx", "coverage",
    ".claude", "vendor", "target",
}

MAX_DEPTH = 6

# Each rule: category -> list of (matcher, signal_label)
# matcher is a function(filename) -> bool, checked against the bare filename.
RULES = {
    "javascript_typescript": [
        (lambda f: f == "package.json", "package.json"),
        (lambda f: f == "tsconfig.json", "tsconfig.json"),
        (lambda f: f in ("pnpm-lock.yaml", "pnpm-workspace.yaml"), "pnpm workspace"),
        (lambda f: f == "yarn.lock", "yarn"),
    ],
    "python": [
        (lambda f: f == "requirements.txt", "requirements.txt"),
        (lambda f: f == "pyproject.toml", "pyproject.toml"),
        (lambda f: f == "Pipfile", "Pipfile"),
        (lambda f: f == "setup.py", "setup.py"),
    ],
    "dotnet_csharp": [
        (lambda f: f.endswith(".csproj"), "*.csproj"),
        (lambda f: f.endswith(".sln"), "*.sln"),
    ],
    "java": [
        (lambda f: f == "pom.xml", "pom.xml"),
        (lambda f: f in ("build.gradle", "build.gradle.kts"), "gradle build file"),
    ],
    "go": [
        (lambda f: f in ("go.mod", "go.sum"), "go.mod/go.sum"),
    ],
    "rust": [
        (lambda f: f in ("Cargo.toml", "Cargo.lock"), "Cargo.toml/Cargo.lock"),
    ],
    "kotlin": [
        # Excludes build.gradle.kts/settings.gradle.kts — those are Gradle's
        # Kotlin-DSL build scripts, not evidence of Kotlin application code.
        (lambda f: f.endswith(".kt") or (f.endswith(".kts") and f not in ("build.gradle.kts", "settings.gradle.kts")), "*.kt/*.kts"),
    ],
    "c_cpp": [
        (lambda f: f == "CMakeLists.txt", "CMakeLists.txt"),
    ],
    "lua": [
        (lambda f: f.endswith(".lua"), "*.lua"),
    ],
    "php": [
        (lambda f: f == "composer.json", "composer.json"),
    ],
    "ruby": [
        (lambda f: f == "Gemfile" or f.endswith(".gemspec"), "Gemfile/*.gemspec"),
    ],
    "swift": [
        (lambda f: f == "Package.swift", "Package.swift"),
    ],
    "database_orm": [
        (lambda f: f == "prisma.schema" or f == "schema.prisma", "Prisma schema"),
        (lambda f: f.lower().startswith("typeorm") and f.endswith((".ts", ".js", ".json")), "TypeORM config"),
        (lambda f: f == "alembic.ini", "Alembic (SQLAlchemy migrations)"),
        (lambda f: f == "knexfile.js", "Knex config"),
    ],
    "supabase": [
        (lambda f: f == "config.toml", "Supabase config.toml (check parent dir is 'supabase/')"),
    ],
    "infra_as_code": [
        (lambda f: f.endswith(".tf"), "*.tf (Terraform)"),
        (lambda f: f.endswith(".bicep"), "*.bicep (Azure Bicep)"),
        (lambda f: f in ("Pulumi.yaml",), "Pulumi"),
        (lambda f: f == "serverless.yml", "Serverless Framework"),
    ],
    "containers": [
        (lambda f: f == "Dockerfile" or f.startswith("Dockerfile."), "Dockerfile"),
        (lambda f: f in ("docker-compose.yml", "docker-compose.yaml"), "docker-compose"),
    ],
    "ci_cd": [
        (lambda f: f == "Jenkinsfile", "Jenkins"),
        (lambda f: f in ("bitbucket-pipelines.yml",), "Bitbucket Pipelines"),
        (lambda f: f == "azure-pipelines.yml", "Azure Pipelines"),
    ],
    "frameworks": [
        (lambda f: f == "angular.json", "Angular"),
        (lambda f: f == "next.config.js" or f == "next.config.mjs" or f == "next.config.ts", "Next.js"),
        (lambda f: f == "nest-cli.json", "NestJS"),
        (lambda f: f == "nx.json", "Nx monorepo"),
    ],
}


# Dependency-name signals: filenames alone miss the common case where a
# stack element (an ORM, a DB driver, Supabase) shows up only as an entry in
# a dependency manifest, not as its own config file. category -> {package
# name substring (lowercased) -> signal label}.
DEPENDENCY_SIGNALS = {
    "database_orm": {
        "typeorm": "TypeORM (npm dependency)",
        "mssql": "MSSQL driver (npm dependency)",
        "tedious": "MSSQL driver via tedious (npm dependency)",
        "sequelize": "Sequelize (npm dependency)",
        "mongoose": "Mongoose/MongoDB (npm dependency)",
        "prisma": "Prisma (npm dependency)",
        "knex": "Knex (npm dependency)",
        "sqlalchemy": "SQLAlchemy (Python dependency)",
        "psycopg2": "psycopg2/Postgres (Python dependency)",
        "pymongo": "PyMongo/MongoDB (Python dependency)",
    },
    "supabase": {
        "@supabase/supabase-js": "Supabase JS client (npm dependency)",
    },
}

DEPENDENCY_MANIFEST_FILES = {"package.json", "requirements.txt", "pyproject.toml"}


def scan_dependency_manifest(path, rel_path, findings):
    filename = os.path.basename(path)
    text = ""
    names = []

    if filename == "package.json":
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (json.JSONDecodeError, OSError):
            return
        for section in ("dependencies", "devDependencies"):
            names.extend((data.get(section) or {}).keys())
    else:
        # requirements.txt / pyproject.toml: line-based substring match is
        # good enough here — this is a signal scan, not a resolver.
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                text = fh.read()
        except OSError:
            return
        names = [line.strip() for line in text.splitlines() if line.strip()]

    haystack = " ".join(n.lower() for n in names) + " " + text.lower()

    for category, signals in DEPENDENCY_SIGNALS.items():
        for needle, label in signals.items():
            if needle.lower() in haystack:
                findings[category].append({"file": rel_path, "signal": label})


def scan(root):
    findings = {category: [] for category in RULES}
    findings.setdefault("database_orm", [])
    findings.setdefault("supabase", [])
    root = os.path.abspath(root)

    for dirpath, dirnames, filenames in os.walk(root):
        rel_depth = os.path.relpath(dirpath, root).count(os.sep) if dirpath != root else 0
        if rel_depth >= MAX_DEPTH:
            dirnames[:] = []
            continue

        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]

        for filename in filenames:
            rel_path = os.path.relpath(os.path.join(dirpath, filename), root)

            for category, rules in RULES.items():
                for matcher, label in rules:
                    if matcher(filename):
                        findings[category].append({"file": rel_path, "signal": label})

            if filename in DEPENDENCY_MANIFEST_FILES:
                scan_dependency_manifest(os.path.join(dirpath, filename), rel_path, findings)

    return findings


def main():
    if len(sys.argv) != 2:
        print("Usage: python detect-stack.py <project-root>", file=sys.stderr)
        sys.exit(1)

    root = sys.argv[1]
    if not os.path.isdir(root):
        print(f"Not a directory: {root}", file=sys.stderr)
        sys.exit(1)

    result = scan(root)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
