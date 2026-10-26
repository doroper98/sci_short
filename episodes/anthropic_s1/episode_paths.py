from pathlib import Path
import os
EPISODE_ROOT = Path(__file__).resolve().parent
OSINT_ROOT = Path(os.environ.get('OSINT_GENERATOR_ROOT', str(EPISODE_ROOT.parent/'osint_generator'))).resolve()
