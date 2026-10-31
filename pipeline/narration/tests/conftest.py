import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))


def pytest_configure(config):
    # pyworld 0.3.5 가 import 때 내는 pkg_resources 폐지 경고(무해, setuptools<81 고정)
    config.addinivalue_line("filterwarnings", "ignore:pkg_resources is deprecated:UserWarning")
