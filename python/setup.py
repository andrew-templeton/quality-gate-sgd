"""
Quality-Gated Reasoning: Python Scientific Module

Setup for publication-grade experiments on SWE-bench.
"""

from setuptools import setup, find_packages

setup(
    name="quality-gate-research",
    version="0.1.0",
    description="Quality-gated reasoning evaluation for SWE-bench experiments",
    author="Quality SGD Team",
    packages=find_packages(),
    python_requires=">=3.9",
    install_requires=[
        # Core dependencies
        "pydantic>=2.0.0",
        "numpy>=1.24.0",
        "scipy>=1.10.0",

        # For mini-swe-agent integration
        "jinja2>=3.1.0",

        # For experiments
        "tqdm>=4.65.0",
        "jsonlines>=3.1.0",

        # For analysis
        "pandas>=2.0.0",
        "matplotlib>=3.7.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.3.0",
            "pytest-cov>=4.1.0",
            "black>=23.3.0",
            "mypy>=1.3.0",
        ],
        "mini-swe": [
            # Mini-SWE-agent dependencies
            "litellm>=1.0.0",
            "anthropic>=0.18.0",
            "openai>=1.0.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "quality-gate-test=quality_gate.cli:test_quality_gate",
            "quality-gate-run=experiments.run_treatment:main",
        ],
    },
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Science/Research",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
)
