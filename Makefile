.PHONY: setup data test engine app demo clean

setup:
	python3 -m venv .venv
	.venv/bin/pip install -r engine/requirements.txt
	cd app && npm install

data:
	.venv/bin/python engine/generate.py

test:
	.venv/bin/python -m pytest engine -q

engine:
	APP_ENV=development .venv/bin/uvicorn engine.main:app --reload --port 8000

app:
	cd app && npm run dev

demo:
	.venv/bin/python engine/generate.py; \
	APP_ENV=development .venv/bin/uvicorn engine.main:app --port 8000 & \
	sleep 2 && cd app && npm run dev

clean:
	rm -rf app/.next app/node_modules .venv data/readings.csv data/feasibility3d.db data/evidence
	find . -name __pycache__ -type d -exec rm -rf {} + 2>/dev/null || true
