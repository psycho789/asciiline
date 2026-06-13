.PHONY: lint lint-fix format

lint:
	ruff check .
	npx eslint app.js

lint-fix:
	ruff check --fix .
	npx eslint --fix app.js

format:
	ruff format .
