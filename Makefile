.PHONY: lint lint-fix format test

lint:
	ruff check .
	ruff format --check .
	npx eslint app.js client/*.js

lint-fix:
	ruff check --fix .
	npx eslint --fix app.js client/*.js

format:
	ruff format .

PYTEST ?= pytest
ifneq (,$(wildcard .venv/bin/pytest))
PYTEST := .venv/bin/pytest
endif

test:
	$(PYTEST) -q
