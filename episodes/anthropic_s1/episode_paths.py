from pathlib import Path
import os
import sys
import subprocess
from functools import lru_cache
EPISODE_ROOT = Path(__file__).resolve().parent
OSINT_ROOT = Path(os.environ.get('OSINT_GENERATOR_ROOT', str(EPISODE_ROOT.parent/'osint_generator'))).resolve()

# Production calls repeatedly parse the same large upstream rules YAML (including
# once per romanized character). Cache that validated document, never its values
# in this repository. Invalidate on file change and return independent models so
# callers cannot mutate a later caller's configuration. Upstream tests still run
# without this episode adapter.
if OSINT_ROOT.is_dir():
    expected='7d85942e536e0eb0796292aa628540d8319cf9af'
    actual=subprocess.check_output(['git','-C',str(OSINT_ROOT),'rev-parse','HEAD'],text=True).strip()
    if actual!=expected or (OSINT_ROOT/'VERSION').read_text().strip()!='7.4.0':
        raise RuntimeError(f'Expected osint_generator 7.4.0 at {expected}; got {actual}')
    sys.path.insert(0,str(OSINT_ROOT))
    import rules
    _uncached_load_rules=rules.load_rules

    @lru_cache(maxsize=4)
    def _rules_snapshot(path: str, mtime_ns: int, size: int):
        return _uncached_load_rules(Path(path))

    def _load_rules(path=None):
        target=Path(path or rules.RULES_PATH).resolve();stat=target.stat()
        return _rules_snapshot(str(target),stat.st_mtime_ns,stat.st_size).model_copy(deep=True)

    rules.load_rules=_load_rules
