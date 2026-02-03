.PHONY: help install lint lint-fix lint-strict validate build xpi start clean ci all

.DEFAULT_GOAL := help

help:
	@echo "Available targets:"
	@echo "  install      Install dependencies (npm ci)"
	@echo "  lint         Run ESLint"
	@echo "  lint-fix     Run ESLint with auto-fix"
	@echo "  lint-strict  Run ESLint with zero warnings allowed"
	@echo "  validate     Validate extension manifest with web-ext"
	@echo "  build        Build the extension (.zip)"
	@echo "  xpi          Build the extension (.xpi)"
	@echo "  start        Run the extension in Firefox"
	@echo "  clean        Remove build artifacts"
	@echo "  ci           Run full CI pipeline (lint, validate, build)"
	@echo "  all          Same as ci"

install:
	npm ci

lint:
	npm run lint

lint-fix:
	npm run lint:fix

lint-strict:
	npm run lint:strict

validate:
	npm run validate

build:
	npm run build

xpi: build
	@for f in dist/*.zip; do cp "$$f" "$${f%.zip}.xpi"; done
	@echo "Created .xpi in dist/"

start:
	npm run start

clean:
	rm -rf dist

ci: lint validate build

all: ci
