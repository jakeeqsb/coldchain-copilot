"""Unit tests for the layer rules (design/decisions.md § 7, rules A1 and A2).

The package has four layers, and a module may import only from its own layer
or the layers below it::

    common  →  engine  →  tools  →  agent

Imports are read from the source with ``ast``, so nothing is executed and no
database is needed. A new module must be given a layer in ``LAYERS`` before
these tests pass; that is on purpose, so every new file is placed
deliberately.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

PACKAGE = "coldchain_copilot"
SRC = Path(__file__).resolve().parents[2] / "src" / PACKAGE

LAYER_ORDER = ("common", "engine", "tools", "agent")

LAYERS = {
    "config": "common",
    "db": "common",
    "errors": "common",
    "catalog": "engine",
    "detection": "engine",
    "engine": "engine",
    "ingest": "engine",
    "ontology": "engine",
    "registry": "engine",
    "rules": "engine",
    "tools": "tools",
    "agent": "agent",
}
"""Top-level module (or subpackage) → layer. ``tools.*`` modules are all in ``tools``."""


def module_name(path: Path) -> str:
    """``src/coldchain_copilot/tools/sensor.py`` → ``"tools.sensor"``."""
    return ".".join(path.relative_to(SRC).with_suffix("").parts)


def layer(module: str) -> str:
    """Returns the layer of a package module such as ``"tools.sensor"``."""
    return LAYERS[module.split(".")[0]]


def package_modules() -> list[Path]:
    """Every module of the package except the ``__init__.py`` files."""
    return sorted(p for p in SRC.rglob("*.py") if p.name != "__init__.py")


def _submodule(base: str, name: str) -> str:
    """Returns ``base.name`` when that is a module, otherwise ``base``.

    ``from coldchain_copilot import db`` imports the module ``db``, while
    ``from coldchain_copilot.config import get_settings`` imports a name
    from the module ``config``. The file system tells the two apart.
    """
    candidate = f"{base}.{name}" if base else name
    path = SRC.joinpath(*candidate.split("."))
    return candidate if path.with_suffix(".py").exists() or path.is_dir() else base


def internal_imports(path: Path) -> set[str]:
    """Returns the package modules a source file imports, e.g. ``{"db", "tools.gateway"}``.

    Handles absolute imports (``coldchain_copilot.x``) and relative ones
    (``from . import db``). Imports of other packages are ignored.
    """
    own_package = module_name(path).split(".")[:-1]
    found: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.startswith(PACKAGE + "."):
                    found.add(alias.name.removeprefix(PACKAGE + "."))
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                parts = own_package[: len(own_package) - (node.level - 1)]
                base = ".".join([*parts, *([node.module] if node.module else [])])
            elif node.module == PACKAGE or (node.module or "").startswith(PACKAGE + "."):
                base = node.module.removeprefix(PACKAGE).lstrip(".")
            else:
                continue
            found.update(_submodule(base, alias.name) for alias in node.names)
    return found - {""}


def test_the_parser_finds_both_import_styles() -> None:
    # engine.py uses relative imports, tools/gateway.py absolute ones.
    assert {"db", "detection", "ontology", "registry", "rules", "errors"} <= internal_imports(SRC / "engine.py")
    assert {"engine", "errors", "tools.adhoc", "tools.sensor"} <= internal_imports(SRC / "tools" / "gateway.py")


def test_every_module_has_a_layer() -> None:
    unplaced = [module_name(p) for p in package_modules() if module_name(p).split(".")[0] not in LAYERS]
    assert unplaced == [], "Add these modules to LAYERS (design/decisions.md § 7)"


@pytest.mark.parametrize("path", package_modules(), ids=module_name)
def test_imports_point_downward(path: Path) -> None:
    """Rule A1: a module imports only from its own layer or a lower one."""
    own = LAYER_ORDER.index(layer(module_name(path)))
    upward = sorted(m for m in internal_imports(path) if LAYER_ORDER.index(layer(m)) > own)
    assert upward == [], f"{module_name(path)} ({LAYER_ORDER[own]}) imports from a higher layer"


def test_agent_reaches_data_only_through_the_gateway() -> None:
    """Rule A2: from the engine and tools layers, the agent imports only the gateway."""
    imports = internal_imports(SRC / "agent.py")
    assert {m for m in imports if layer(m) in ("engine", "tools")} == {"tools.gateway"}
